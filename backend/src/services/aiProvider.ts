import axios, { AxiosResponse } from 'axios';
import { query } from '../db';
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

function buildKnowledgeContext(knowledge: KnowledgeDocument[]): string {
  const parts: string[] = [];
  let remaining = 50_000;
  for (const item of knowledge) {
    if (remaining <= 0) break;
    const content = item.content.slice(0, Math.min(item.content.length, remaining));
    parts.push(`【${item.title}（v${item.version}）】\n${content}`);
    remaining -= content.length;
  }
  return parts.join('\n\n') || '（暂无已发布知识）';
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
  return status === 'failed' || status === 'error' || status === 'cancelled';
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
    if (role === 'assistant' && (type === 'answer' || (!type && contentType === 'text')) && contentType !== 'card' && typeof record.content === 'string' && record.content.trim()) {
      answers.push(record.content.trim());
    }
    if (record.messages) visit(record.messages);
    if (Array.isArray(record.data)) visit(record.data);
  };
  visit(body.data);
  visit(body.messages);
  return answers.length ? answers[answers.length - 1] : '';
}

function extractUsage(...bodies: CozeRecord[]): Record<string, unknown> | undefined {
  for (const body of bodies) {
    const nested = dataRecord(body);
    const usage = body.usage || nested.usage;
    if (usage && typeof usage === 'object' && !Array.isArray(usage)) return usage as Record<string, unknown>;
  }
  return undefined;
}

async function generateWithCoze(tenantId: string, question: string, conversationId: string, knowledge: KnowledgeDocument[]): Promise<DraftResult> {
  if (knowledge.length === 0) throw new AppError(409, 'AI_KNOWLEDGE_REQUIRED', '请先发布企业知识，再生成 AI 草稿');
  const token = process.env.COZE_TOKEN?.trim();
  const botId = process.env.COZE_BOT_ID?.trim();
  const baseUrl = (process.env.COZE_API_URL || '').trim().replace(/\/$/, '');
  if (!token || !botId || !baseUrl) throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI 供应商未配置，无法生成草稿');

  const previous = await query<{ provider_conversation_id: string }>(
    `SELECT provider_conversation_id
       FROM ai_runs
      WHERE tenant_id = $1 AND conversation_id = $2 AND provider = 'coze' AND provider_conversation_id IS NOT NULL
      ORDER BY created_at DESC LIMIT 1`,
    [tenantId, conversationId],
  );
  const previousConversationId = previous.rows[0]?.provider_conversation_id;
  const prompt = [
    '你是企业客服草稿助手，只能依据提供的企业知识回答。',
    '知识不足时明确要求人工接管，不得编造价格、库存、优惠、联系方式或承诺。',
    `企业知识：\n${buildKnowledgeContext(knowledge)}`,
    `客户问题：\n${question}`,
  ].join('\n\n');

  const response = await axios.post(`${baseUrl}/chat`, {
    bot_id: botId,
    user_id: `conversation:${conversationId}`,
    stream: false,
    auto_save_history: true,
    additional_messages: [{ role: 'user', type: 'question', content: prompt, content_type: 'text' }],
  }, {
    timeout: 20_000,
    params: previousConversationId ? { conversation_id: previousConversationId } : undefined,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
  const initialBody = assertCozeResponse(response, '发起对话');
  let meta = extractChatMeta(initialBody);
  let retrieveBody: CozeRecord = initialBody;
  let messagesBody: CozeRecord | undefined;
  let finalText = extractCozeText(initialBody);

  if (!finalText) {
    if (!meta.conversationId || !meta.chatId) throw new AppError(502, 'AI_PROVIDER_INCOMPLETE', 'Coze 未返回可查询的 conversation_id/chat_id');
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const statusResponse = await axios.get(`${baseUrl}/chat/retrieve`, {
        timeout: 10_000,
        params: { conversation_id: meta.conversationId, chat_id: meta.chatId },
        headers: { Authorization: `Bearer ${token}` },
        validateStatus: () => true,
      });
      retrieveBody = assertCozeResponse(statusResponse, '查询对话状态');
      meta = extractChatMeta(retrieveBody);
      if (failedStatus(meta.status)) throw new AppError(502, 'AI_PROVIDER_INCOMPLETE', 'Coze 对话执行失败');
      if (completedStatus(meta.status)) break;
      if (attempt === 29) throw new AppError(502, 'AI_PROVIDER_TIMEOUT', 'Coze 对话在规定时间内未完成');
      await sleep(1000);
    }
    const messagesResponse = await axios.get(`${baseUrl}/chat/message/list`, {
      timeout: 10_000,
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
    evidence: knowledge.map(({ id, title, version }) => ({ documentId: id, title, version })),
    providerRequestId: meta.chatId || undefined,
    providerConversationId: meta.conversationId || undefined,
    usage: extractUsage(initialBody, retrieveBody, messagesBody || {}),
  };
}

export async function generateDraft(tenantId: string, conversationId: string, question: string): Promise<DraftResult> {
  const knowledge = await loadKnowledge(tenantId);
  const provider = (process.env.AI_PROVIDER || 'coze').trim().toLowerCase();
  if (provider !== 'coze') throw new AppError(503, 'AI_PROVIDER_UNSUPPORTED', '当前只实现已配置的 Coze 供应商');
  return generateWithCoze(tenantId, question, conversationId, knowledge);
}
