import axios from 'axios';
import { config } from '../config';
import { query } from '../db';
import { AppError } from '../errors';

export interface DraftResult {
  text: string;
  evidence: Array<{ documentId: string; title: string }>;
  providerRequestId?: string;
  usage?: Record<string, unknown>;
}

async function loadKnowledge(tenantId: string): Promise<Array<{ id: string; title: string; content: string }>> {
  const result = await query<{ id: string; title: string; content: string }>(
    `SELECT id, title, content FROM knowledge_documents WHERE tenant_id = $1 AND status = 'published' ORDER BY updated_at DESC LIMIT 20`,
    [tenantId],
  );
  return result.rows;
}

async function generateWithCoze(question: string, conversationId: string, knowledge: Array<{ id: string; title: string; content: string }>): Promise<DraftResult> {
  if (knowledge.length === 0) throw new AppError(409, 'AI_KNOWLEDGE_REQUIRED', '请先发布企业知识，再生成 AI 草稿');
  const token = process.env.COZE_TOKEN?.trim();
  const botId = process.env.COZE_BOT_ID?.trim();
  const baseUrl = (process.env.COZE_API_URL || '').trim();
  if (!token || !botId || !baseUrl) throw new AppError(503, 'AI_NOT_CONFIGURED', 'AI 供应商未配置，无法生成草稿');
  const prompt = [
    '你是企业客服草稿助手，只能依据提供的企业知识回答。',
    '知识不足时明确要求人工接管，不得编造价格、库存、优惠、联系方式或承诺。',
    `企业知识:\n${knowledge.map((item) => `【${item.title}】\n${item.content}`).join('\n\n') || '（暂无已发布知识）'}`,
    `客户问题:\n${question}`,
  ].join('\n\n');
  const response = await axios.post(`${baseUrl.replace(/\/$/, '')}/chat`, {
    bot_id: botId,
    user_id: `conversation:${conversationId}`,
    query: prompt,
    stream: false,
  }, {
    timeout: 20_000,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });
  if (response.status < 200 || response.status >= 300) throw new AppError(502, 'AI_PROVIDER_ERROR', `AI 供应商返回 HTTP ${response.status}`);
  const body = response.data as Record<string, unknown>;
  const nested = body.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : {};
  const status = String(body.status || nested.status || '');
  const conversationIdFromProvider = String(body.conversation_id || nested.conversation_id || '');
  const chatId = String(body.chat_id || nested.id || '');
  let finalText = extractCozeText(body);
  if (!finalText && conversationIdFromProvider && chatId) {
    const statusResponse = await axios.get(`${baseUrl.replace(/\/$/, '')}/chat/retrieve`, {
      timeout: 20_000,
      params: { conversation_id: conversationIdFromProvider, chat_id: chatId },
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    });
    const retrievedBody = statusResponse.data as Record<string, unknown>;
    const retrievedData = retrievedBody.data && typeof retrievedBody.data === 'object' ? retrievedBody.data as Record<string, unknown> : {};
    if (statusResponse.status < 200 || statusResponse.status >= 300 || String(retrievedBody.status || retrievedData.status || '') !== 'completed') throw new AppError(502, 'AI_PROVIDER_INCOMPLETE', 'AI 供应商未返回已完成的对话');
    const messages = await axios.get(`${baseUrl.replace(/\/$/, '')}/chat/message/list`, {
      timeout: 20_000,
      params: { conversation_id: conversationIdFromProvider, chat_id: chatId },
      headers: { Authorization: `Bearer ${token}` },
      validateStatus: () => true,
    });
    if (messages.status < 200 || messages.status >= 300) throw new AppError(502, 'AI_PROVIDER_MESSAGES_ERROR', 'AI 供应商消息读取失败');
    finalText = extractCozeText(messages.data as Record<string, unknown>);
  }
  if (!finalText && status && status !== 'completed') throw new AppError(502, 'AI_PROVIDER_INCOMPLETE', 'AI 供应商未返回已完成的对话');
  if (!finalText.trim()) throw new AppError(502, 'AI_EMPTY_RESPONSE', 'AI 供应商未返回可用草稿');
  return { text: finalText.trim(), evidence: knowledge.map(({ id, title }) => ({ documentId: id, title })), providerRequestId: chatId || undefined, usage: body.usage as Record<string, unknown> | undefined };
}

function extractCozeText(body: Record<string, unknown>): string {
  const candidates: unknown[] = [body.content, body.answer, body.message, body.data, body.messages];
  const findText = (candidate: unknown): string => {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
    if (Array.isArray(candidate)) {
      for (const item of [...candidate].reverse()) {
        const text = findText(item);
        if (text) return text;
      }
      return '';
    }
    if (!candidate || typeof candidate !== 'object') return '';
    const record = candidate as Record<string, unknown>;
    const role = String(record.role || '').toLowerCase();
    const type = String(record.type || '').toLowerCase();
    if (type === 'follow_up' || type === 'question' || role === 'user') return '';
    if (typeof record.content === 'string' && record.content.trim()) return record.content;
    return findText(record.messages) || findText(record.data);
  };
  for (const candidate of candidates) {
    const text = findText(candidate);
    if (text) return text;
  }
  return '';
}

export async function generateDraft(tenantId: string, conversationId: string, question: string): Promise<DraftResult> {
  const knowledge = await loadKnowledge(tenantId);
  const provider = (process.env.AI_PROVIDER || 'coze').trim().toLowerCase();
  if (provider !== 'coze') throw new AppError(503, 'AI_PROVIDER_UNSUPPORTED', '当前只实现已配置的 Coze 供应商');
  return generateWithCoze(question, conversationId, knowledge);
}
