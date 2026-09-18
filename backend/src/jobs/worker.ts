import crypto from 'crypto';
import { query, withTransaction } from '../db';
import { randomId } from '../config';
import { AppError } from '../errors';
import { broadcast } from '../realtime/hub';
import { generateDraft } from '../services/aiProvider';

type Job = {
  id: string;
  tenant_id: string;
  type: 'ai_draft' | 'web_delivery' | 'platform_delivery' | 'platform_sync';
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
};

const WORKER_ID = `${process.pid}-${crypto.randomUUID()}`;
let timer: NodeJS.Timeout | undefined;
let running = false;

export async function enqueueJob(tenantId: string, type: Job['type'], payload: Record<string, unknown>, maxAttempts = 3): Promise<string> {
  const id = randomId();
  await query(
    `INSERT INTO jobs(id, tenant_id, type, payload, max_attempts) VALUES ($1, $2, $3, $4::jsonb, $5)`,
    [id, tenantId, type, JSON.stringify(payload), maxAttempts],
  );
  return id;
}

async function claimJob(): Promise<Job | undefined> {
  return withTransaction(async (client) => {
    const result = await client.query<Job>(
      `WITH candidate AS (
         SELECT id FROM jobs
          WHERE (status = 'queued' AND run_after <= NOW())
             OR (status = 'running' AND locked_at < NOW() - INTERVAL '2 minutes')
          ORDER BY run_after, created_at
          FOR UPDATE SKIP LOCKED LIMIT 1
       )
       UPDATE jobs j
          SET status = 'running', locked_at = NOW(), locked_by = $1,
              attempts = j.attempts + 1, updated_at = NOW()
         FROM candidate c
        WHERE j.id = c.id
      RETURNING j.id, j.tenant_id, j.type, j.payload, j.attempts, j.max_attempts`,
      [WORKER_ID],
    );
    return result.rows[0];
  });
}

async function complete(job: Job): Promise<void> {
  await query(`UPDATE jobs SET status = 'succeeded', locked_at = NULL, locked_by = NULL, updated_at = NOW() WHERE id = $1 AND locked_by = $2`, [job.id, WORKER_ID]);
}

async function fail(job: Job, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message.slice(0, 1000) : '任务失败';
  const terminal = job.attempts >= job.max_attempts;
  const delaySeconds = Math.min(300, 2 ** Math.max(0, job.attempts - 1) * 5);
  await query(
    `UPDATE jobs
        SET status = $3,
            run_after = NOW() + ($4 || ' seconds')::interval,
            locked_at = NULL, locked_by = NULL, last_error = $2, updated_at = NOW()
      WHERE id = $1 AND locked_by = $5`,
    [job.id, message, terminal ? 'dead' : 'queued', String(delaySeconds), WORKER_ID],
  );
  if (job.type === 'platform_delivery') {
    const messageId = typeof job.payload.messageId === 'string' ? job.payload.messageId : '';
    if (messageId) await query(`UPDATE messages SET delivery_status = CASE WHEN $3 = 'PLATFORM_UNVERIFIED' THEN 'failed' ELSE 'unknown' END WHERE id = $1 AND tenant_id = $2 AND delivery_status IN ('queued', 'sending')`, [messageId, job.tenant_id, error instanceof AppError ? error.code : 'UNKNOWN']);
  }
}

async function processWebDelivery(job: Job): Promise<void> {
  const messageId = String(job.payload.messageId || '');
  const result = await query<{ id: string; conversation_id: string; content: string; created_at: Date; sender_type: 'human' | 'ai'; delivery_status: string; mode: 'human' | 'ai_draft' | 'auto' }>(
    `SELECT m.id, m.conversation_id, m.content, m.created_at, m.sender_type, m.delivery_status, c.mode
       FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.id = $1 AND m.tenant_id = $2 AND m.direction = 'outbound'`,
    [messageId, job.tenant_id],
  );
  const message = result.rows[0];
  if (!message) throw new AppError(404, 'MESSAGE_NOT_FOUND', '待发送消息不存在');
  if (!['queued', 'sending'].includes(message.delivery_status)) return;
  if (message.sender_type === 'ai' && message.mode !== 'auto') {
    await query(`UPDATE messages SET delivery_status = 'cancelled' WHERE id = $1 AND tenant_id = $2 AND delivery_status = 'queued'`, [messageId, job.tenant_id]);
    return;
  }
  const delivered = await query(`UPDATE messages SET delivery_status = 'delivered' WHERE id = $1 AND tenant_id = $2 AND delivery_status IN ('queued', 'sending') RETURNING id`, [messageId, job.tenant_id]);
  if (!delivered.rowCount) return;
  broadcast(job.tenant_id, { type: 'message', data: { id: message.id, conversationId: message.conversation_id, content: message.content, type: message.sender_type, deliveryStatus: 'delivered', timestamp: message.created_at }, timestamp: new Date().toISOString() });
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
  await query(`UPDATE ai_runs SET status = 'running' WHERE id = $1 AND tenant_id = $2`, [aiRunId, job.tenant_id]);
  try {
    const draft = await generateDraft(job.tenant_id, conversationId, input.rows[0].content);
    await query(`UPDATE ai_runs SET status = 'running', draft = $2, evidence = $3::jsonb, provider_request_id = $4, usage = $5::jsonb, error = NULL WHERE id = $1 AND tenant_id = $6`, [aiRunId, draft.text, JSON.stringify(draft.evidence), draft.providerRequestId || null, draft.usage ? JSON.stringify(draft.usage) : null, job.tenant_id]);
    let autoMessageId: string | undefined;
    if (draft.text) {
      autoMessageId = await withTransaction(async (client) => {
        const locked = await client.query<{ mode: 'human' | 'ai_draft' | 'auto'; mode_version: number; widget_id: string | null }>('SELECT mode, mode_version, widget_id FROM conversations WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [conversationId, job.tenant_id]);
        if (!locked.rows[0] || locked.rows[0].mode !== 'auto' || !locked.rows[0].widget_id) return undefined;
        const queuedModeVersion = Number(job.payload.modeVersion || 0);
        if (queuedModeVersion > 0 && locked.rows[0].mode_version !== queuedModeVersion) return undefined;
        const existing = await client.query<{ id: string }>(`SELECT id FROM messages WHERE tenant_id = $1 AND conversation_id = $2 AND direction = 'outbound' AND sender_type = 'ai' AND metadata->>'aiRunId' = $3 LIMIT 1`, [job.tenant_id, conversationId, aiRunId]);
        if (existing.rows[0]) return existing.rows[0].id;
        const id = randomId();
        await client.query(`INSERT INTO messages(id, tenant_id, conversation_id, direction, sender_type, message_type, content, delivery_status, metadata) VALUES ($1, $2, $3, 'outbound', 'ai', 'web_message', $4, 'queued', $5::jsonb)`, [id, job.tenant_id, conversationId, draft.text, JSON.stringify({ aiRunId })]);
        await client.query(`UPDATE conversations SET last_message_at = NOW(), message_count = message_count + 1, updated_at = NOW() WHERE id = $1`, [conversationId]);
        return id;
      });
    }
    if (autoMessageId) await enqueueJob(job.tenant_id, 'web_delivery', { conversationId, messageId: autoMessageId });
    await query(`UPDATE ai_runs SET status = 'succeeded', completed_at = NOW() WHERE id = $1 AND tenant_id = $2`, [aiRunId, job.tenant_id]);
    broadcast(job.tenant_id, { type: 'ai_draft', data: { aiRunId, conversationId, messageId, draft: draft.text, evidence: draft.evidence }, timestamp: new Date().toISOString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI 草稿生成失败';
    const blocked = error instanceof AppError && ['AI_NOT_CONFIGURED', 'AI_PROVIDER_UNSUPPORTED', 'AI_KNOWLEDGE_REQUIRED'].includes(error.code);
    await query(`UPDATE ai_runs SET status = $2, error = $3, completed_at = NOW() WHERE id = $1 AND tenant_id = $4`, [aiRunId, blocked ? 'blocked' : 'failed', message, job.tenant_id]);
    throw error;
  }
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
  if (running) return;
  running = true;
  try {
    const job = await claimJob();
    if (!job) return;
    try {
      await processJob(job);
      await complete(job);
    } catch (error) {
      console.error(`任务 ${job.id} 失败:`, error instanceof Error ? error.message : error);
      await fail(job, error);
    }
  } catch (error) {
    if (!(error instanceof AppError && error.code === 'DATABASE_NOT_CONFIGURED')) console.error('Worker 轮询失败:', error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

export function startWorker(): void {
  timer = setInterval(() => { void tick(); }, 1000);
  timer.unref();
  void tick();
}

export function stopWorker(): void {
  if (timer) clearInterval(timer);
  timer = undefined;
}
