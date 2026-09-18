import axios, { AxiosResponse } from 'axios';
import { advisoryLockPool, assertDatabaseConfigured, query } from '../db';
import { AppError } from '../errors';

type KnowledgeDocument = { id: string; title: string; content: string; version: number };

export interface DraftResult {
  text: string;
  evidence: Array<{ documentId: string; title: string; version: number }>;
  providerRequestId?: string;
  providerConversationId?: string;
  usage?: Record<string, unknown>;
}

type CozeRecord = Record<string, unknown>;

async function loadKnowledge(tenantId: string): Promise<KnowledgeDocument[]> {
  const result = await query<KnowledgeDocument>(
    `SELECT id, title, content, version
       FROM knowledge_documents
      WHERE tenant_id = $1 AND status = 'published'
      ORDER BY updated_at DESC LIMIT 20`,
    [tenantId],
  );
  return result.rows;
}

function parseKnowledgeSnapshot(value: unknown): KnowledgeDocument[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const snapshot = value.filter((item): item is KnowledgeDocument => {
    if (!item || typeof item !== 'object') return false;
    const row = item as Partial<KnowledgeDocument>;
    return typeof row.id === 'string' && typeof row.title === 'string' && typeof row.content === 'string' && Number.isInteger(row.version);
  });
  if (snapshot.length !== value.length) throw new AppError(409, 'AI_KNOWLEDGE_SNAPSHOT_INVALID', 'AI 任务的知识快照无效，请重新创建任务');
  return snapshot;
}

async function loadKnowledgeForRun(tenantId: string, aiRunId: string): Promise<KnowledgeDocument[]> {
  const run = await query<{ knowledge_snapshot: unknown; knowledge_snapshot_state: 'pending' | 'captured' | 'unknown' }>('SELECT knowledge_snapshot, knowledge_snapshot_state FROM ai_runs WHERE id = $1 AND tenant_id = $2', [aiRunId, tenantId]);
  if (!run.rows[0]) throw new AppError(404, 'AI_RUN_NOT_FOUND', 'AI 任务不存在');
  if (run.rows[0].knowledge_snapshot_state === 'unknown') {
    throw new AppError(409, 'AI_KNOWLEDGE_SNAPSHOT_UNAVAILABLE', '该 AI 任务缺少可验证的历史知识依据，不能自动恢复');
  }
  const snapshot = parseKnowledgeSnapshot(run.rows[0].knowledge_snapshot);
  if (run.rows[0].knowledge_snapshot_state === 'captured') {
    if (!snapshot || snapshot.length === 0) throw new AppError(409, 'AI_KNOWLEDGE_SNAPSHOT_INVALID', 'AI 任务的知识快照无效，请重新创建任务');
    return snapshot;
  }
  if (snapshot && snapshot.length > 0) {
    await query(`UPDATE ai_runs SET knowledge_snapshot_state = 'captured' WHERE id = $1 AND tenant_id = $2 AND knowledge_snapshot_state = 'pending'`, [aiRunId, tenantId]);
    return snapshot;
  }
  const current = await loadKnowledge(tenantId);
  if (current.length === 0) throw new AppError(409, 'AI_KNOWLEDGE_REQUIRED', '请先发布企业知识，再生成 AI 草稿');
  // Persist before the provider request. A retry therefore uses the exact
  // documents and versions selected by the original attempt, even if the
  // published knowledge changes while the provider is processing.
  const persisted = await query<{ knowledge_snapshot: unknown }>(
    `UPDATE ai_runs SET knowledge_snapshot = $1::jsonb, knowledge_snapshot_state = 'captured'
       WHERE id = $2 AND tenant_id = $3 AND knowledge_snapshot_state = 'pending' AND knowledge_snapshot = '[]'::jsonb
     RETURNING knowledge_snapshot`,
    [JSON.stringify(current), aiRunId, tenantId],
  );
  if (persisted.rows[0]) return parseKnowledgeSnapshot(persisted.rows[0].knowledge_snapshot) || current;
  const latest = await query<{ knowledge_snapshot: unknown; knowledge_snapshot_state: 'pending' | 'captured' | 'unknown' }>('SELECT knowledge_snapshot, knowledge_snapshot_state FROM ai_runs WHERE id = $1 AND tenant_id = $2', [aiRunId, tenantId]);
  if (latest.rows[0]?.knowledge_snapshot_state === 'unknown') throw new AppError(409, 'AI_KNOWLEDGE_SNAPSHOT_UNAVAILABLE', '该 AI 任务缺少可验证的历史知识依据，不能自动恢复');
  const latestSnapshot = parseKnowledgeSnapshot(latest.rows[0]?.knowledge_snapshot);
  if (latestSnapshot && latestSnapshot.length > 0) return latestSnapshot;
  return current;
}

function buildKnowledgeContext(knowledge: KnowledgeDocument[]): { context: string; used: KnowledgeDocument[] } {
  const parts: string[] = [];
  const used: KnowledgeDocument[] = [];
  let remaining = 50_000;
  for (const item of knowledge) {
    if (remaining <= 0) break;
    const content = item.content.slice(0, Math.min(item.content.length, remaining));
    parts.push(`【${item.title}（v${item.version}）】\n${content}`);
    used.push(item);
    remaining -= content.length;
  }
  return { context: parts.join('\n\n') || '（暂无已发布知识）', used };
}

function dataRecord(body: CozeRecord): CozeRecord {
  return body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data as CozeRecord : {};
}

function stringField(record: CozeRecord, ...names: string[]): string {
  for (const name of names) {
    const value = record[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return '';
}

function assertCozeResponse(response: AxiosResponse<unknown>, operation: string): CozeRecord {
  if (response.status < 200 || response.status >= 300) throw new AppError(502, 'AI_PROVIDER_ERROR', `Coze ${operation} 返回 HTTP ${response.status}`);
  const body = response.data && typeof response.data === 'object' ? response.data as CozeRecord : {};
  const code = body.code;
  if (code !== undefined && String(code) !== '0') {
    const detail = stringField(body, 'msg', 'message').slice(0, 240);
    if (String(code) === '4016') throw new AppError(503, 'AI_PROVIDER_CONVERSATION_BUSY', `Coze ${operation} 正在处理同一会话，请稍后重试`);
    throw new AppError(502, 'AI_PROVIDER_ERROR', `Coze ${operation} 失败${detail ? `：${detail}` : ''}`);
  }
  return body;
}

function extractChatMeta(body: CozeRecord): { conversationId: string; chatId: string; status: string; usage?: Record<string, unknown> } {
  const nested = dataRecord(body);
  return {
    conversationId: stringField(nested, 'conversation_id') || stringField(body, 'conversation_id'),
    chatId: stringField(nested, 'id', 'chat_id') || stringField(body, 'chat_id', 'id'),
    status: (stringField(nested, 'status') || stringField(body, 'status')).toLowerCase(),
    usage: (nested.usage && typeof nested.usage === 'object' ? nested.usage : body.usage) as Record<string, unknown> | undefined,
  };
}

function completedStatus(status: string): boolean {
  return status === 'completed' || status === 'complete' || status === 'compleated';
}

function failedStatus(status: string): boolean {
  return status === 'failed' || status === 'error' || status === 'cancelled' || status === 'canceled';
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Extract only a completed assistant answer; never use verbose/follow-up/tool output as a reply. */
export function extractCozeText(body: CozeRecord): string {
  const answers: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const record = value as CozeRecord;
    const role = String(record.role || '').toLowerCase();
    const type = String(record.type || '').toLowerCase();
    const contentType = String(record.content_type || record.contentType || '').toLowerCase();
    if (role === 'assistant' && type === 'answer' && contentType === 'text' && typeof record.content === 'string' && record.content.trim()) {
      answers.push(record.content.trim());
    }
    if (record.messages) visit(record.messages);
    if (Array.isArray(record.data)) visit(record.data);
  };
  visit(body.data);
  visit(body.messages);
  return answers.join('\n\n');
}

function extractUsage(...bodies: CozeRecord[]): Record<string, unknown> | undefined {
  for (const body of [...bodies].reverse()) {
    const nested = dataRecord(body);
    for (const usage of [body.usage, nested.usage]) {
      if (usage && typeof usage === 'object' && !Array.isArray(usage) && Object.keys(usage).length > 0) return usage as Record<string, unknown>;
    }
  }
  return undefined;
}

async function generateWithCoze(tenantId: string, question: string, conversationId: string, knowledge: KnowledgeDocument[], aiRunId?: string): Promise<DraftResult> {
  if (knowledge.length === 0) throw new AppError(409, 'AI_KNOWLEDGE_REQUIRED', '请先发布企业知识，再生成 AI 草稿');
  const token = process.env.COZE_TOKEN?.trim();
  const botId = process.env.COZE_BOT_ID?.trim();
  const baseUrl = (process.env.COZE_API_URL || '').trim().replace(/\/$/, '');
  if (!token || !botId || !baseUrl) throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI 供应商未配置，无法生成草稿');

  const currentRun = aiRunId ? await query<{ provider_request_id: string | null; provider_conversation_id: string | null; provider_state: string }>(
    `SELECT provider_request_id, provider_conversation_id, provider_state FROM ai_runs WHERE id = $1 AND tenant_id = $2`,
    [aiRunId, tenantId],
  ) : { rows: [] } as { rows: Array<{ provider_request_id: string | null; provider_conversation_id: string | null; provider_state: string }> };
  const resumeChatId = currentRun.rows[0]?.provider_request_id || '';
  const resumeConversationId = currentRun.rows[0]?.provider_conversation_id || '';
  const providerState = currentRun.rows[0]?.provider_state || 'new';
  if ((resumeChatId && !resumeConversationId) || (!resumeChatId && resumeConversationId)) {
    throw new AppError(409, 'AI_PROVIDER_INCOMPLETE', 'Coze 会话标识不完整，不能安全恢复');
  }
  if (!resumeChatId && aiRunId && ['creating', 'unknown', 'completed'].includes(providerState)) {
    throw new AppError(409, 'AI_PROVIDER_CREATION_UNKNOWN', 'Coze 创建结果未能安全落库，需要人工对账后再重试');
  }
  const previous = await query<{ provider_conversation_id: string }>(
    `SELECT provider_conversation_id
       FROM ai_runs
      WHERE tenant_id = $1 AND conversation_id = $2 AND provider = 'coze' AND provider_conversation_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [tenantId, conversationId],
  );
  const previousConversationId = previous.rows[0]?.provider_conversation_id;
  const knowledgeContext = buildKnowledgeContext(knowledge);
  const prompt = [
    '你是企业客服草稿助手，只能依据提供的企业知识回答。',
    '知识不足时明确要求人工接管，不得编造价格、库存、优惠、联系方式或承诺。',
    `企业知识：\n${knowledgeContext.context}`,
    `客户问题：\n${question}`,
  ].join('\n\n');

  const deadline = Date.now() + 30_000;

  let meta = { conversationId: resumeConversationId, chatId: resumeChatId, status: '', usage: undefined as Record<string, unknown> | undefined };
  let initialBody: CozeRecord = {};
  let retrieveBody: CozeRecord = {};
  let messagesBody: CozeRecord | undefined;
  let finalText = '';

  if (!resumeChatId || !resumeConversationId) {
    if (aiRunId) {
      const marked = await query(
        `UPDATE ai_runs SET provider_state = 'creating'
           WHERE id = $1 AND tenant_id = $2 AND provider_state = 'new'
             AND provider_request_id IS NULL AND provider_conversation_id IS NULL
         RETURNING id`,
        [aiRunId, tenantId],
      );
      if (!marked.rowCount) throw new AppError(409, 'AI_PROVIDER_CREATION_UNKNOWN', 'Coze 创建结果未能安全落库，需要人工对账后再重试');
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new AppError(502, 'AI_PROVIDER_TIMEOUT', 'Coze 对话在规定时间内未完成');
    try {
      const response = await axios.post(`${baseUrl}/chat`, {
        bot_id: botId,
        user_id: `conversation:${conversationId}`,
        stream: false,
        auto_save_history: true,
        additional_messages: [{ role: 'user', type: 'question', content: prompt, content_type: 'text' }],
      }, {
        timeout: Math.min(20_000, remaining),
        params: previousConversationId ? { conversation_id: previousConversationId } : undefined,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        validateStatus: () => true,
      });
      initialBody = assertCozeResponse(response, '发起对话');
    } catch (error) {
      // Coze 4016 means this request was rejected because the conversation is
      // already busy; unlike a timeout, the provider did not create a new
      // chat, so the creating intent is safe to retry.
      if (error instanceof AppError && error.code === 'AI_PROVIDER_CONVERSATION_BUSY' && aiRunId) {
        await query(
          `UPDATE ai_runs SET provider_state = 'new'
             WHERE id = $1 AND tenant_id = $2 AND provider_state = 'creating'
               AND provider_request_id IS NULL AND provider_conversation_id IS NULL`,
          [aiRunId, tenantId],
        );
      }
      throw error;
    }
    const initialMeta = extractChatMeta(initialBody);
    meta = {
      conversationId: initialMeta.conversationId || meta.conversationId,
      chatId: initialMeta.chatId || meta.chatId,
      status: initialMeta.status,
      usage: initialMeta.usage,
    };
    if (aiRunId && meta.chatId && meta.conversationId) {
      const savedProviderIds = await query(`UPDATE ai_runs SET provider_request_id = $1, provider_conversation_id = $2, provider_state = 'active' WHERE id = $3 AND tenant_id = $4 AND provider_state = 'creating'`, [meta.chatId, meta.conversationId, aiRunId, tenantId]);
      if (!savedProviderIds.rowCount) throw new AppError(409, 'AI_PROVIDER_CREATION_UNKNOWN', 'Coze 创建结果未能安全落库，需要人工对账后再重试');
    }
    finalText = extractCozeText(initialBody);
  }

  if (!finalText) {
    if (!meta.conversationId || !meta.chatId) throw new AppError(502, 'AI_PROVIDER_INCOMPLETE', 'Coze 未返回可查询的 conversation_id/chat_id');
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new AppError(502, 'AI_PROVIDER_TIMEOUT', 'Coze 对话在规定时间内未完成');
      const statusResponse = await axios.get(`${baseUrl}/chat/retrieve`, {
        timeout: Math.min(10_000, remaining),
        params: { conversation_id: meta.conversationId, chat_id: meta.chatId },
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
      });
      retrieveBody = assertCozeResponse(statusResponse, '查询对话状态');
      const nextMeta = extractChatMeta(retrieveBody);
      meta = {
        conversationId: nextMeta.conversationId || meta.conversationId,
        chatId: nextMeta.chatId || meta.chatId,
        status: nextMeta.status || meta.status,
        usage: nextMeta.usage || meta.usage,
      };
      if (failedStatus(meta.status)) throw new AppError(502, 'AI_PROVIDER_INCOMPLETE', 'Coze 对话执行失败');
      if (completedStatus(meta.status)) break;
      await sleep(Math.min(1000, Math.max(0, deadline - Date.now())));
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new AppError(502, 'AI_PROVIDER_TIMEOUT', 'Coze 对话在规定时间内未完成');
    const messagesResponse = await axios.get(`${baseUrl}/chat/message/list`, {
      timeout: Math.min(10_000, remaining),
      params: { conversation_id: meta.conversationId, chat_id: meta.chatId },
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    });
    messagesBody = assertCozeResponse(messagesResponse, '读取对话消息');
    finalText = extractCozeText(messagesBody);
  }
  if (!finalText.trim()) throw new AppError(502, 'AI_EMPTY_RESPONSE', 'Coze 未返回可用的 assistant answer');
  return {
    text: finalText.trim(),
    evidence: knowledgeContext.used.map(({ id, title, version }) => ({ documentId: id, title, version })),
    providerRequestId: meta.chatId || undefined,
    providerConversationId: meta.conversationId || undefined,
    usage: extractUsage(initialBody, retrieveBody, messagesBody || {}),
  };
}

async function withProviderConversationLock<T>(tenantId: string, conversationId: string, fn: () => Promise<T>): Promise<T> {
  assertDatabaseConfigured();
  const client = await advisoryLockPool.connect().catch(() => {
    throw new AppError(503, 'DATABASE_UNAVAILABLE', '数据库暂时不可用');
  });
  const lockKey = `coze:${tenantId}:${conversationId}`;
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);
    return await fn();
  } finally {
    await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]).catch(() => undefined);
    client.release();
  }
}

export async function generateDraft(tenantId: string, conversationId: string, question: string, aiRunId?: string): Promise<DraftResult> {
  const knowledge = aiRunId ? await loadKnowledgeForRun(tenantId, aiRunId) : await loadKnowledge(tenantId);
  if (knowledge.length === 0) throw new AppError(409, 'AI_KNOWLEDGE_REQUIRED', '请先发布企业知识，再生成 AI 草稿');
  const provider = (process.env.AI_PROVIDER || 'coze').trim().toLowerCase();
  if (provider !== 'coze') throw new AppError(503, 'AI_PROVIDER_UNSUPPORTED', '当前只实现已配置的 Coze 供应商');
  return withProviderConversationLock(tenantId, conversationId, () => generateWithCoze(tenantId, question, conversationId, knowledge, aiRunId));
}
