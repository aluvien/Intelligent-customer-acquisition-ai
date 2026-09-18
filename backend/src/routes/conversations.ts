import express from 'express';
import { query, withTransaction } from '../db';
import { randomId } from '../config';
import { AppError } from '../errors';
import { broadcast } from '../realtime/hub';
import { insertJob } from '../jobs/worker';
import { encodeMessageCursor, optionalText, pageParams, parseExpectedModeVersion, parseMessageCursor, requireText, tenantId } from './helpers';
import { requireRole } from '../middleware/auth';
import { assertContentAllowed } from '../services/contentAudit';

const router = express.Router();

type ConversationRow = {
  id: string;
  channel_id: string | null;
  widget_id: string | null;
  visitor_session_id: string | null;
  external_user_id: string;
  user_nickname: string;
  user_avatar: string | null;
  status: 'active' | 'closed' | 'transferred';
  mode: 'human' | 'ai_draft' | 'auto';
  mode_version: number;
  assigned_to: string | null;
  last_message_at: Date;
  message_count: number;
  score: number;
  tags: string[];
  created_at: Date;
  latest_content: string | null;
  latest_direction: 'inbound' | 'outbound' | null;
};

function mapConversation(row: ConversationRow) {
  return {
    id: row.id,
    channelId: row.channel_id,
    widgetId: row.widget_id,
    userId: row.external_user_id,
    userNickname: row.user_nickname,
    userAvatar: row.user_avatar || undefined,
    status: row.status,
    mode: row.mode,
    modeVersion: row.mode_version,
    assignedTo: row.assigned_to,
    lastMessageAt: row.last_message_at,
    messageCount: row.message_count,
    score: Number(row.score || 0),
    tags: row.tags || [],
    latestMessage: row.latest_content ? { content: row.latest_content, direction: row.latest_direction } : null,
    createdAt: row.created_at,
  };
}

async function getConversation(id: string, tenant: string): Promise<ConversationRow> {
  const result = await query<ConversationRow>(
    `SELECT c.id, c.channel_account_id AS channel_id, c.widget_id, c.visitor_session_id,
            c.external_user_id, c.user_nickname, c.user_avatar, c.status, c.mode,
            c.mode_version, c.assigned_to, c.last_message_at, c.message_count,
            c.score, c.tags, c.created_at,
            lm.content AS latest_content, lm.direction AS latest_direction
       FROM conversations c
       LEFT JOIN LATERAL (
         SELECT content, direction FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
       ) lm ON TRUE
      WHERE c.id = $1 AND c.tenant_id = $2`,
    [id, tenant],
  );
  if (!result.rows[0]) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
  return result.rows[0];
}

router.get('/', async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const { page, limit, offset } = pageParams(req);
    const status = typeof req.query.status === 'string' && req.query.status !== 'all' ? req.query.status : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const values: unknown[] = [tenant];
    const filters = ['c.tenant_id = $1'];
    if (status) { values.push(status); filters.push(`c.status = $${values.length}`); }
    if (search) { values.push(`%${search}%`); filters.push(`(c.user_nickname ILIKE $${values.length} OR c.external_user_id ILIKE $${values.length})`); }
    const count = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM conversations c WHERE ${filters.join(' AND ')}`, values);
    values.push(limit, offset);
    const result = await query<ConversationRow>(
      `SELECT c.id, c.channel_account_id AS channel_id, c.widget_id, c.visitor_session_id,
              c.external_user_id, c.user_nickname, c.user_avatar, c.status, c.mode,
              c.mode_version, c.assigned_to, c.last_message_at, c.message_count,
              c.score, c.tags, c.created_at, lm.content AS latest_content, lm.direction AS latest_direction
         FROM conversations c
         LEFT JOIN LATERAL (SELECT content, direction FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) lm ON TRUE
        WHERE ${filters.join(' AND ')} ORDER BY c.last_message_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values,
    );
    const total = Number(count.rows[0]?.count || 0);
    res.json({ success: true, message: '获取对话列表成功', data: { conversations: result.rows.map(mapConversation), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try { res.json({ success: true, message: '获取对话成功', data: { conversation: mapConversation(await getConversation(req.params.id, tenantId(req))) } }); }
  catch (error) { next(error); }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    await getConversation(req.params.id, tenant);
    const before = parseMessageCursor(typeof req.query.before === 'string' ? req.query.before : undefined);
    const values: unknown[] = [req.params.id, tenant];
    const cursorFilter = before
      ? before.id ? ' AND (created_at < $3 OR (created_at = $3 AND id < $4))' : ' AND created_at < $3'
      : '';
    if (before) values.push(before.createdAt);
    if (before?.id) values.push(before.id);
    const result = await query(`SELECT * FROM (SELECT id, conversation_id AS "conversationId", direction, sender_type AS "senderType", message_type AS "messageType", content, delivery_status AS "deliveryStatus", metadata, created_at AS "createdAt", created_at::text AS "cursorCreatedAt" FROM messages WHERE conversation_id = $1 AND tenant_id = $2${cursorFilter} ORDER BY created_at DESC, id DESC LIMIT 500) recent ORDER BY "createdAt" ASC, id ASC`, values);
    const rows = result.rows.map(({ cursorCreatedAt: _cursorCreatedAt, ...row }) => row);
    res.json({ success: true, message: '获取消息记录成功', data: { messages: rows, pagination: { hasMore: result.rowCount === 500, nextBefore: result.rowCount === 500 && result.rows[0] ? encodeMessageCursor(result.rows[0].cursorCreatedAt, result.rows[0].id) : null } } });
  } catch (error) { next(error); }
});

router.post('/:id/messages', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const content = requireText(req.body?.content, '消息内容', 4000);
    try { assertContentAllowed(content); } catch { throw new AppError(400, 'CONTENT_BLOCKED', '消息包含被禁止的内容'); }
    const idempotencyKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : '';
    if (!idempotencyKey || idempotencyKey.length > 160) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', '人工回复必须提供有效的 Idempotency-Key');
    const externalMessageId = `staff:${req.auth!.userId}:${idempotencyKey}`;
    const result = await withTransaction(async (client) => {
      const conversationResult = await client.query<{ id: string; status: string; widget_id: string | null }>('SELECT id, status, widget_id FROM conversations WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [req.params.id, tenant]);
      const conversation = conversationResult.rows[0];
      if (!conversation) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
      if (conversation.status === 'closed') throw new AppError(409, 'CONVERSATION_CLOSED', '对话已关闭');
      const existing = await client.query<{ id: string; content: string; delivery_status: string }>('SELECT id, content, delivery_status FROM messages WHERE tenant_id = $1 AND conversation_id = $2 AND external_message_id = $3', [tenant, conversation.id, externalMessageId]);
      if (existing.rows[0]) {
        if (existing.rows[0].content !== content) throw new AppError(409, 'IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key 已用于另一条人工回复');
        return { messageId: existing.rows[0].id, text: existing.rows[0].content, deliveryStatus: existing.rows[0].delivery_status, duplicate: true };
      }
      const messageId = randomId();
      await client.query(`INSERT INTO messages(id, tenant_id, conversation_id, external_message_id, direction, sender_type, message_type, content, delivery_status, metadata) VALUES ($1, $2, $3, $4, 'outbound', 'human', 'web_message', $5, 'queued', $6::jsonb)`, [messageId, tenant, conversation.id, externalMessageId, content, JSON.stringify({ userId: req.auth!.userId, idempotencyKey })]);
      await client.query(`UPDATE conversations SET last_message_at = NOW(), message_count = message_count + 1, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [conversation.id, tenant]);
      await insertJob(client, tenant, conversation.widget_id ? 'web_delivery' : 'platform_delivery', { conversationId: conversation.id, messageId }, conversation.widget_id ? 3 : 1);
      return { messageId, text: content, deliveryStatus: 'queued', duplicate: false };
    });
    if (!result.duplicate) broadcast(tenant, { type: 'message', data: { id: result.messageId, conversationId: req.params.id, direction: 'outbound', senderType: 'human', content: result.text, deliveryStatus: result.deliveryStatus, createdAt: new Date().toISOString() }, timestamp: new Date().toISOString() });
    res.status(result.duplicate ? 200 : 201).json({ success: true, message: result.duplicate ? '已返回此前的回复结果' : '回复已进入发送队列', data: { messageId: result.messageId, deliveryStatus: result.deliveryStatus } });
  } catch (error) { next(error); }
});

router.post('/:id/drafts/:aiRunId/approve', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const content = optionalText(req.body?.content, 4000);
    if (content) {
      try { assertContentAllowed(content); } catch { throw new AppError(400, 'CONTENT_BLOCKED', '批准内容包含被禁止的内容'); }
    }
    const idempotencyKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : '';
    if (!idempotencyKey || idempotencyKey.length > 160) throw new AppError(400, 'IDEMPOTENCY_KEY_REQUIRED', '批准草稿必须提供有效的 Idempotency-Key');
    const result = await withTransaction(async (client) => {
      const run = await client.query<{ draft: string | null; status: string }>(`SELECT draft, status FROM ai_runs WHERE id = $1 AND tenant_id = $2 AND conversation_id = $3 FOR UPDATE`, [req.params.aiRunId, tenant, req.params.id]);
      if (!run.rows[0] || run.rows[0].status !== 'succeeded' || !(content || run.rows[0].draft)) throw new AppError(409, 'DRAFT_NOT_READY', 'AI 草稿尚未准备好或已失效');
      const externalMessageId = `ai-approval:${req.params.aiRunId}`;
      const text = content || run.rows[0].draft!;
      const existing = await client.query<{ id: string; content: string; delivery_status: string; external_message_id: string | null }>(`SELECT id, content, delivery_status, external_message_id FROM messages WHERE tenant_id = $1 AND conversation_id = $2 AND (external_message_id = $3 OR metadata->>'aiRunId' = $4 OR metadata->>'approvedAiRunId' = $4) FOR UPDATE`, [tenant, req.params.id, externalMessageId, req.params.aiRunId]);
      // Lock messages before the conversation, matching the worker's
      // message -> conversation order and avoiding approval/delivery deadlocks.
      const conversation = await client.query<{ status: string; mode: string; widget_id: string | null }>('SELECT status, mode, widget_id FROM conversations WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [req.params.id, tenant]);
      if (!conversation.rows[0] || conversation.rows[0].status === 'closed') throw new AppError(409, 'CONVERSATION_CLOSED', '对话已关闭');
      // An auto-publish transaction can insert the related message while the
      // conversation lock is being acquired. Re-read after that lock so the
      // unique index is not used as the normal concurrency response path.
      const currentExisting = await client.query<{ id: string; content: string; delivery_status: string; external_message_id: string | null }>(`SELECT id, content, delivery_status, external_message_id FROM messages WHERE tenant_id = $1 AND conversation_id = $2 AND (external_message_id = $3 OR metadata->>'aiRunId' = $4 OR metadata->>'approvedAiRunId' = $4) FOR UPDATE`, [tenant, req.params.id, externalMessageId, req.params.aiRunId]);
      const existingRow = [...existing.rows, ...currentExisting.rows].find((item) => item.external_message_id === externalMessageId) || currentExisting.rows[0] || existing.rows[0];
      if (existingRow) {
        const recoverable = ['cancelled', 'failed'].includes(existingRow.delivery_status);
        if (!recoverable && existingRow.content !== text) throw new AppError(409, 'DRAFT_ALREADY_PUBLISHED', '该 AI 草稿已经发布了不同内容');
        if (existingRow.delivery_status === 'unknown') throw new AppError(409, 'DRAFT_RECONCILIATION_REQUIRED', '该 AI 草稿的上一轮投递结果未知，请先完成对账');
        if (recoverable) {
          await client.query(
            `UPDATE messages
                SET external_message_id = $2, sender_type = 'human', content = $3,
                    delivery_status = 'queued',
                    metadata = jsonb_build_object('approvedAiRunId', $4, 'userId', $5, 'idempotencyKey', $6)
              WHERE id = $1 AND tenant_id = $7 AND conversation_id = $8
                AND delivery_status IN ('cancelled', 'failed')`,
            [existingRow.id, externalMessageId, text, req.params.aiRunId, req.auth!.userId, idempotencyKey, tenant, req.params.id],
          );
          await client.query(`UPDATE conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenant]);
          await insertJob(client, tenant, conversation.rows[0].widget_id ? 'web_delivery' : 'platform_delivery', { conversationId: req.params.id, messageId: existingRow.id }, conversation.rows[0].widget_id ? 3 : 1);
          return { messageId: existingRow.id, text, deliveryStatus: 'queued', duplicate: false };
        }
        return { messageId: existingRow.id, text: existingRow.content, deliveryStatus: existingRow.delivery_status, duplicate: true };
      }
      const messageId = randomId();
      await client.query(`INSERT INTO messages(id, tenant_id, conversation_id, external_message_id, direction, sender_type, message_type, content, delivery_status, metadata) VALUES ($1, $2, $3, $4, 'outbound', 'human', 'web_message', $5, 'queued', $6::jsonb)`, [messageId, tenant, req.params.id, externalMessageId, text, JSON.stringify({ approvedAiRunId: req.params.aiRunId, userId: req.auth!.userId, idempotencyKey })]);
      await client.query(`UPDATE conversations SET last_message_at = NOW(), message_count = message_count + 1, updated_at = NOW() WHERE id = $1`, [req.params.id]);
      await insertJob(client, tenant, conversation.rows[0].widget_id ? 'web_delivery' : 'platform_delivery', { conversationId: req.params.id, messageId }, conversation.rows[0].widget_id ? 3 : 1);
      return { messageId, text, deliveryStatus: 'queued', duplicate: false };
    });
    if (!result.duplicate) broadcast(tenant, { type: 'message', data: { id: result.messageId, conversationId: req.params.id, direction: 'outbound', senderType: 'human', content: result.text, deliveryStatus: result.deliveryStatus, createdAt: new Date().toISOString() }, timestamp: new Date().toISOString() });
    res.status(result.duplicate ? 200 : 201).json({ success: true, message: result.duplicate ? '已返回此前的批准结果' : '草稿已人工批准并进入发送队列', data: { messageId: result.messageId, deliveryStatus: result.deliveryStatus } });
  } catch (error) { next(error); }
});

router.put('/:id/close', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    await getConversation(req.params.id, tenant);
    const result = await query(`UPDATE conversations SET status = 'closed', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING id, status`, [req.params.id, tenant]);
    res.json({ success: true, message: '对话已关闭', data: { conversation: result.rows[0] } });
  } catch (error) { next(error); }
});

router.put('/:id/score', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const score = Number(req.body?.score);
    if (!Number.isFinite(score) || score < 0 || score > 10) throw new AppError(400, 'INVALID_SCORE', '评分必须在 0 到 10 之间');
    const result = await query(`UPDATE conversations SET score = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id, score`, [score, req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
    res.json({ success: true, message: '评分已保存', data: { conversation: result.rows[0] } });
  } catch (error) { next(error); }
});

router.put('/:id/mode', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const mode = req.body?.mode;
    if (!['human', 'ai_draft', 'auto'].includes(mode)) throw new AppError(400, 'INVALID_MODE', '会话模式无效');
    if (mode === 'auto' && req.auth!.role !== 'admin') throw new AppError(403, 'AUTO_MODE_FORBIDDEN', '只有管理员可以开启自动模式');
    const expectedModeVersion = parseExpectedModeVersion(req.body?.expectedModeVersion);
    if (mode === 'auto') {
      const knowledge = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM knowledge_documents WHERE tenant_id = $1 AND status = 'published'`, [tenantId(req)]);
      if (Number(knowledge.rows[0]?.count || 0) === 0) throw new AppError(409, 'AUTO_MODE_REQUIRES_KNOWLEDGE', '发布企业知识后才能开启自动模式');
      const conversation = await getConversation(req.params.id, tenantId(req));
      if (!conversation.widget_id) throw new AppError(409, 'AUTO_MODE_PLATFORM_UNVERIFIED', '未核验的平台渠道不能开启自动发送');
    }
    const values: unknown[] = [mode, req.params.id, tenantId(req), expectedModeVersion];
    const versionFilter = ' AND mode_version = $4';
    const result = await query(`UPDATE conversations SET mode = $1, mode_version = mode_version + 1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3${versionFilter} RETURNING id, mode, mode_version`, values);
    if (!result.rowCount) {
      const existing = await query('SELECT 1 FROM conversations WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId(req)]);
      if (existing.rowCount) throw new AppError(409, 'CONVERSATION_MODE_STALE', '会话模式已被其他操作更新，请重新读取后重试');
      throw new AppError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
    }
    await query(`INSERT INTO audit_logs(id, tenant_id, user_id, action, resource_type, resource_id, metadata) VALUES ($1, $2, $3, 'conversation_mode_changed', 'conversation', $4, $5::jsonb)`, [randomId(), tenantId(req), req.auth!.userId, req.params.id, JSON.stringify({ mode })]);
    res.json({ success: true, message: '会话模式已更新', data: { conversation: result.rows[0] } });
  } catch (error) { next(error); }
});

router.put('/:id/assign', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const assignedTo = typeof req.body?.assignedTo === 'string' ? req.body.assignedTo : null;
    if (assignedTo) {
      const user = await query('SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND status = \'active\'', [assignedTo, tenantId(req)]);
      if (!user.rowCount) throw new AppError(400, 'INVALID_ASSIGNEE', '负责人不存在或已停用');
    }
    const result = await query(`UPDATE conversations SET assigned_to = $1, status = CASE WHEN $1 IS NULL THEN status ELSE 'transferred' END, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id, assigned_to AS "assignedTo", status`, [assignedTo, req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
    res.json({ success: true, message: '负责人已更新', data: { conversation: result.rows[0] } });
  } catch (error) { next(error); }
});

export default router;
