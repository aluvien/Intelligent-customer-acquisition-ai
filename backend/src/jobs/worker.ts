import crypto from 'crypto';
import type { PoolClient } from 'pg';
import { query, withTransaction } from '../db';
import { randomId } from '../config';
import { AppError } from '../errors';
import { broadcast } from '../realtime/hub';
import { generateDraft } from '../services/aiProvider';
import { assertContentAllowed } from '../services/contentAudit';

type Job = {
  id: string;
  tenant_id: string;
  type: 'ai_draft' | 'web_delivery' | 'platform_delivery' | 'platform_sync';
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
  locked_at: Date;
};

const WORKER_ID = `${process.pid}-${crypto.randomUUID()}`;
let timer: NodeJS.Timeout | undefined;
let activeTick: Promise<void> | null = null;
let lastVisitorCleanup = 0;

export async function insertJob(client: PoolClient, tenantId: string, type: Job['type'], payload: Record<string, unknown>, maxAttempts = 3): Promise<string> {
  const id = randomId();
  await client.query(
    `INSERT INTO jobs(id, tenant_id, type, payload, max_attempts) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [id, tenantId, type, JSON.stringify(payload), maxAttempts],
  );
  return id;
}

async function claimJob(): Promise<Job | undefined> {
  return withTransaction(async (client) => {
    const exhausted = await client.query<{ id: string; type: Job['type']; payload: Record<string, unknown> }>(
      `UPDATE jobs
          SET status = 'dead', locked_at = NULL, locked_by = NULL,
              last_error = COALESCE(last_error, '任务租约耗尽重试次数'), updated_at = NOW()
        WHERE status = 'running' AND locked_at < NOW() - INTERVAL '2 minutes'
          AND attempts >= max_attempts
      RETURNING id, type, payload`,
    );
    for (const dead of exhausted.rows) {
      const aiRunId = typeof dead.payload?.aiRunId === 'string' ? dead.payload.aiRunId : '';
      const messageId = typeof dead.payload?.messageId === 'string' ? dead.payload.messageId : '';
      if (dead.type === 'ai_draft' && aiRunId) {
        await client.query(
          `UPDATE ai_runs
              SET status = 'failed', error = COALESCE(error, '任务租约耗尽重试次数'), completed_at = NOW()
            WHERE id = $1 AND tenant_id = (SELECT tenant_id FROM jobs WHERE id = $2)
              AND status IN ('queued', 'running')`,
          [aiRunId, dead.id],
        );
      }
      if (dead.type === 'web_delivery' && messageId) {
        await client.query(
          `UPDATE messages SET delivery_status = 'failed'
            WHERE id = $1 AND tenant_id = (SELECT tenant_id FROM jobs WHERE id = $2)
              AND delivery_status IN ('queued', 'sending')`,
          [messageId, dead.id],
        );
      }
      if (dead.type === 'platform_delivery' && messageId) {
        await client.query(
          `UPDATE messages SET delivery_status = 'unknown'
            WHERE id = $1 AND tenant_id = (SELECT tenant_id FROM jobs WHERE id = $2)
              AND delivery_status IN ('queued', 'sending')`,
          [messageId, dead.id],
        );
      }
    }
    const result = await client.query<Job>(
      `WITH candidate AS (
         SELECT id FROM jobs
          WHERE ((status = 'queued' AND run_after <= NOW())
             OR (status = 'running' AND locked_at < NOW() - INTERVAL '2 minutes'))
            AND attempts < max_attempts
          ORDER BY run_after, created_at
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE jobs j
          SET status = 'running', locked_at = NOW(), locked_by = $1,
              attempts = j.attempts + 1, updated_at = NOW()
         FROM candidate c
        WHERE j.id = c.id
      RETURNING j.id, j.tenant_id, j.type, j.payload, j.attempts, j.max_attempts, j.locked_at`,
      [WORKER_ID],
    );
    return result.rows[0];
  });
}

async function assertLease(job: Job): Promise<void> {
  const result = await query(
    `SELECT 1 FROM jobs
      WHERE id = $1 AND status = 'running' AND locked_by = $2
        AND locked_at > NOW() - INTERVAL '2 minutes'`,
    [job.id, WORKER_ID],
  );
  if (!result.rowCount) throw new AppError(409, 'JOB_LEASE_LOST', '任务租约已失效，停止副作用操作');
}

async function assertLeaseOnClient(client: PoolClient, job: Job): Promise<void> {
  const result = await client.query(
    `SELECT 1 FROM jobs
      WHERE id = $1 AND status = 'running' AND locked_by = $2
        AND locked_at > NOW() - INTERVAL '2 minutes'
      FOR UPDATE`,
    [job.id, WORKER_ID],
  );
  if (!result.rowCount) throw new AppError(409, 'JOB_LEASE_LOST', '任务租约已失效，停止副作用操作');
}

async function renewLease(job: Job): Promise<void> {
  try {
    await query(`UPDATE jobs SET locked_at = NOW(), updated_at = NOW() WHERE id = $1 AND status = 'running' AND locked_by = $2`, [job.id, WORKER_ID]);
  } catch (error) {
    console.error(`任务 ${job.id} 租约续期失败:`, error instanceof Error ? error.message : error);
  }
}

async function cleanupExpiredVisitorSessions(): Promise<void> {
  if (Date.now() - lastVisitorCleanup < 300_000) return;
  lastVisitorCleanup = Date.now();
  await query(`DELETE FROM visitor_sessions WHERE expires_at < NOW() - INTERVAL '24 hours'`);
}

async function complete(job: Job): Promise<void> {
  await query(`UPDATE jobs SET status = 'succeeded', locked_at = NULL, locked_by = NULL, updated_at = NOW() WHERE id = $1 AND locked_by = $2`, [job.id, WORKER_ID]);
}

async function fail(job: Job, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 1000) : '任务失败';
  const deterministicBlocked = job.type === 'ai_draft' && error instanceof AppError && ['AI_NOT_CONFIGURED', 'AI_PROVIDER_UNSUPPORTED', 'AI_KNOWLEDGE_REQUIRED', 'AI_KNOWLEDGE_SNAPSHOT_INVALID', 'AI_PROVIDER_CREATION_UNKNOWN', 'CONTENT_BLOCKED'].includes(error.code);
  const terminal = job.attempts >= job.max_attempts || deterministicBlocked;
  const delaySeconds = Math.min(300, 2 ** Math.max(0, job.attempts - 1) * 5);
  if (job.type === 'ai_draft') {
    const aiRunId = typeof job.payload.aiRunId === 'string' ? job.payload.aiRunId : '';
    if (aiRunId) {
      const runStatus = deterministicBlocked ? 'blocked' : terminal ? 'failed' : 'queued';
      await query(
        `UPDATE ai_runs
            SET status = $2, error = $3,
                completed_at = CASE WHEN $2 IN ('blocked', 'failed') THEN NOW() ELSE NULL END
          WHERE id = $1 AND tenant_id = $4 AND EXISTS (SELECT 1 FROM jobs WHERE id = $5 AND status = 'running' AND locked_by = $6)`,
        [aiRunId, runStatus, message, job.tenant_id, job.id, WORKER_ID],
      );
    }
  }
  if (job.type === 'platform_delivery') {
    const messageId = typeof job.payload.messageId === 'string' ? job.payload.messageId : '';
    if (messageId) await query(`UPDATE messages SET delivery_status = CASE WHEN $3 = 'PLATFORM_UNVERIFIED' THEN 'failed' ELSE 'unknown' END WHERE id = $1 AND tenant_id = $2 AND delivery_status IN ('queued', 'sending') AND EXISTS (SELECT 1 FROM jobs WHERE id = $4 AND status = 'running' AND locked_by = $5)`, [messageId, job.tenant_id, error instanceof AppError ? error.code : 'UNKNOWN', job.id, WORKER_ID]);
  }
  if (job.type === 'web_delivery' && terminal) {
    const messageId = typeof job.payload.messageId === 'string' ? job.payload.messageId : '';
    if (messageId && !(error instanceof AppError && error.code === 'WEB_DELIVERY_RECONCILIATION_REQUIRED')) {
      await query(`UPDATE messages SET delivery_status = 'failed' WHERE id = $1 AND tenant_id = $2 AND delivery_status IN ('queued', 'sending') AND EXISTS (SELECT 1 FROM jobs WHERE id = $3 AND status = 'running' AND locked_by = $4)`, [messageId, job.tenant_id, job.id, WORKER_ID]);
    }
  }
  await query(
    `UPDATE jobs
        SET status = $3,
            run_after = NOW() + ($4 || ' seconds')::interval,
            locked_at = NULL, locked_by = NULL, last_error = $2, updated_at = NOW()
      WHERE id = $1 AND locked_by = $5`,
    [job.id, message, terminal ? 'dead' : 'queued', String(delaySeconds), WORKER_ID],
  );
}

async function processWebDelivery(job: Job): Promise<void> {
  const messageId = String(job.payload.messageId || '');
  await assertLease(job);
  const result = await withTransaction(async (client) => {
    await assertLeaseOnClient(client, job);
    const messageResult = await client.query<{
      id: string;
      conversation_id: string;
      content: string;
      created_at: Date;
      sender_type: 'human' | 'ai';
      delivery_status: string;
      metadata: Record<string, unknown>;
    }>(
      `SELECT id, conversation_id, content, created_at, sender_type, delivery_status, metadata
         FROM messages
        WHERE id = $1 AND tenant_id = $2 AND direction = 'outbound'
        FOR UPDATE`,
      [messageId, job.tenant_id],
    );
    const message = messageResult.rows[0];
    if (!message) throw new AppError(404, 'MESSAGE_NOT_FOUND', '待发送消息不存在');
    if (message.delivery_status === 'unknown') throw new AppError(409, 'WEB_DELIVERY_RECONCILIATION_REQUIRED', '网页消息投递结果未知，不能自动标记任务成功');
    if (!['queued', 'sending'].includes(message.delivery_status)) return undefined;
    const conversationResult = await client.query<{ mode: 'human' | 'ai_draft' | 'auto'; mode_version: number; status: string }>(
      'SELECT mode, mode_version, status FROM conversations WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [message.conversation_id, job.tenant_id],
    );
    const conversation = conversationResult.rows[0];
    if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '消息所属会话不存在');
    const expectedModeVersion = Number(message.metadata?.modeVersion || job.payload.modeVersion || 0);
    const staleAiMessage = message.sender_type === 'ai' && (
      conversation.mode !== 'auto' ||
      conversation.status === 'closed' ||
      (expectedModeVersion > 0 && conversation.mode_version !== expectedModeVersion)
    );
    if (staleAiMessage) {
      await assertLeaseOnClient(client, job);
      await client.query(`UPDATE messages SET delivery_status = 'cancelled' WHERE id = $1 AND delivery_status IN ('queued', 'sending')`, [message.id]);
      return undefined;
    }
    const accepted = await client.query<{ id: string }>(
      `UPDATE messages SET delivery_status = 'provider_accepted'
        WHERE id = $1 AND tenant_id = $2 AND delivery_status IN ('queued', 'sending')
          AND EXISTS (SELECT 1 FROM jobs WHERE id = $3 AND status = 'running' AND locked_by = $4 AND locked_at > NOW() - INTERVAL '2 minutes')
        RETURNING id`,
      [message.id, job.tenant_id, job.id, WORKER_ID],
    );
    return accepted.rowCount ? message : undefined;
  });
  if (!result) return;
  broadcast(job.tenant_id, { type: 'message', data: { id: result.id, conversationId: result.conversation_id, direction: 'outbound', senderType: result.sender_type, content: result.content, deliveryStatus: 'provider_accepted', createdAt: result.created_at }, timestamp: new Date().toISOString() });
}

async function processAiDraft(job: Job): Promise<void> {
  const conversationId = String(job.payload.conversationId || '');
  const messageId = String(job.payload.messageId || '');
  const aiRunId = String(job.payload.aiRunId || '');
  const run = await query<{ status: string }>('SELECT status FROM ai_runs WHERE id = $1 AND tenant_id = $2', [aiRunId, job.tenant_id]);
  if (!run.rows[0]) throw new AppError(404, 'AI_RUN_NOT_FOUND', 'AI 任务不存在');
  if (run.rows[0].status === 'succeeded') return;
  const input = await query<{ content: string }>(`SELECT content FROM messages WHERE id = $1 AND tenant_id = $2 AND direction = 'inbound'`, [messageId, job.tenant_id]);
  if (!input.rows[0]) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'AI 输入消息不存在');
  await assertLease(job);
  const running = await query(`UPDATE ai_runs SET status = 'running', completed_at = NULL WHERE id = $1 AND tenant_id = $2 AND EXISTS (SELECT 1 FROM jobs WHERE id = $3 AND status = 'running' AND locked_by = $4)`, [aiRunId, job.tenant_id, job.id, WORKER_ID]);
  if (!running.rowCount) throw new AppError(409, 'JOB_LEASE_LOST', '任务租约已失效，停止副作用操作');
  const draft = await generateDraft(job.tenant_id, conversationId, input.rows[0].content, aiRunId);
  try { assertContentAllowed(draft.text); } catch { throw new AppError(400, 'CONTENT_BLOCKED', 'AI 草稿包含被禁止的内容'); }
  await assertLease(job);
  const savedDraft = await query(`UPDATE ai_runs SET status = 'running', draft = $2, evidence = $3::jsonb, provider_request_id = $4, provider_conversation_id = $5, usage = $6::jsonb, error = NULL WHERE id = $1 AND tenant_id = $7 AND EXISTS (SELECT 1 FROM jobs WHERE id = $8 AND status = 'running' AND locked_by = $9)`, [aiRunId, draft.text, JSON.stringify(draft.evidence), draft.providerRequestId || null, draft.providerConversationId || null, draft.usage ? JSON.stringify(draft.usage) : null, job.tenant_id, job.id, WORKER_ID]);
  if (!savedDraft.rowCount) throw new AppError(409, 'JOB_LEASE_LOST', '任务租约已失效，停止副作用操作');
  let autoPublished = false;
  if (draft.text) {
    const queuedModeVersion = Number(job.payload.modeVersion || 0);
    autoPublished = Boolean(await withTransaction(async (client) => {
      await assertLeaseOnClient(client, job);
      const locked = await client.query<{ mode: 'human' | 'ai_draft' | 'auto'; mode_version: number; widget_id: string | null }>('SELECT mode, mode_version, widget_id FROM conversations WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [conversationId, job.tenant_id]);
      if (!locked.rows[0] || locked.rows[0].mode !== 'auto' || !locked.rows[0].widget_id) return undefined;
      if (queuedModeVersion > 0 && locked.rows[0].mode_version !== queuedModeVersion) return undefined;
      const existing = await client.query<{ id: string }>(`SELECT id FROM messages WHERE tenant_id = $1 AND conversation_id = $2 AND direction = 'outbound' AND (metadata->>'aiRunId' = $3 OR metadata->>'approvedAiRunId' = $3) LIMIT 1`, [job.tenant_id, conversationId, aiRunId]);
      if (existing.rows[0]) return true;
      const id = randomId();
      await client.query(`INSERT INTO messages(id, tenant_id, conversation_id, direction, sender_type, message_type, content, delivery_status, metadata) VALUES ($1, $2, $3, 'outbound', 'ai', 'web_message', $4, 'queued', $5::jsonb)`, [id, job.tenant_id, conversationId, draft.text, JSON.stringify({ aiRunId, modeVersion: queuedModeVersion })]);
      await client.query(`UPDATE conversations SET last_message_at = NOW(), message_count = message_count + 1, updated_at = NOW() WHERE id = $1`, [conversationId]);
      await insertJob(client, job.tenant_id, 'web_delivery', { conversationId, messageId: id, modeVersion: queuedModeVersion });
      return true;
    }));
  }
  await assertLease(job);
  const completed = await query(`UPDATE ai_runs SET status = 'succeeded', provider_state = 'completed', completed_at = NOW() WHERE id = $1 AND tenant_id = $2 AND EXISTS (SELECT 1 FROM jobs WHERE id = $3 AND status = 'running' AND locked_by = $4)`, [aiRunId, job.tenant_id, job.id, WORKER_ID]);
  if (!completed.rowCount) throw new AppError(409, 'JOB_LEASE_LOST', '任务租约已失效，停止副作用操作');
  if (!autoPublished) broadcast(job.tenant_id, { type: 'ai_draft', data: { aiRunId, conversationId, messageId, draft: draft.text, evidence: draft.evidence }, timestamp: new Date().toISOString() });
}

async function processJob(job: Job): Promise<void> {
  switch (job.type) {
    case 'web_delivery':
      await processWebDelivery(job);
      return;
    case 'ai_draft':
      await processAiDraft(job);
      return;
    case 'platform_delivery':
    case 'platform_sync':
      throw new AppError(503, 'PLATFORM_UNVERIFIED', '目标平台能力尚未完成真实核验');
    default:
      throw new AppError(400, 'JOB_TYPE_UNSUPPORTED', '任务类型不受支持');
  }
}

async function tick(): Promise<void> {
  try {
    await cleanupExpiredVisitorSessions();
    const job = await claimJob();
    if (!job) return;
    const leaseTimer = setInterval(() => { void renewLease(job); }, 30_000);
    leaseTimer.unref();
    try {
      await processJob(job);
      await complete(job);
    } catch (error) {
      console.error(`任务 ${job.id} 失败:`, error instanceof Error ? error.message : error);
      await fail(job, error);
    } finally {
      clearInterval(leaseTimer);
    }
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'DATABASE_NOT_CONFIGURED')) console.error('Worker 轮询失败:', error instanceof Error ? error.message : error);
  }
}

function scheduleTick(): void {
  if (activeTick) return;
  activeTick = tick().finally(() => { activeTick = null; });
}

export function startWorker(): void {
  if (timer) return;
  timer = setInterval(scheduleTick, 1000);
  timer.unref();
  scheduleTick();
}

export async function stopWorker(): Promise<void> {
  if (timer) clearInterval(timer);
  timer = undefined;
  if (activeTick) await activeTick;
}
