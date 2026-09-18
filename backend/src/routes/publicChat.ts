import express from 'express';
import { query, withTransaction } from '../db';
import { config, hashOpaqueToken, randomId, randomOpaqueToken } from '../config';
import { AppError } from '../errors';
import { broadcast } from '../realtime/hub';
import { enqueueJob } from '../jobs/worker';
import { optionalText, requireText } from './helpers';

const router = express.Router();

type VisitorContext = { sessionId: string; tenantId: string; widgetId: string; visitorId: string; conversationId?: string };

function assertAllowedOrigin(origin: string | undefined, allowedOrigins: string[]): void {
  if (origin && allowedOrigins.length > 0 && !allowedOrigins.includes(origin)) throw new AppError(403, 'ORIGIN_FORBIDDEN', '访客入口不允许当前来源');
}

async function visitorContext(req: express.Request): Promise<VisitorContext> {
  const token = req.headers['x-visitor-token'];
  if (typeof token !== 'string' || !token) throw new AppError(401, 'VISITOR_AUTH_REQUIRED', '访客会话凭证缺失');
  const result = await query<VisitorContext & { expires_at: Date }>(
    `SELECT vs.id AS "sessionId", vs.tenant_id AS "tenantId", vs.widget_id AS "widgetId", vs.visitor_id AS "visitorId", vs.expires_at
       FROM visitor_sessions vs JOIN widgets w ON w.id = vs.widget_id
      WHERE vs.id = $1 AND vs.token_hash = $2 AND vs.expires_at > NOW() AND w.enabled = TRUE`,
    [req.params.sessionId, hashOpaqueToken(token)],
  );
  const context = result.rows[0];
  if (!context) throw new AppError(401, 'VISITOR_AUTH_INVALID', '访客会话无效或已过期');
  const origin = req.headers.origin;
  const allowed = await query<{ allowed_origins: string[] }>('SELECT allowed_origins FROM widgets WHERE id = $1', [context.widgetId]);
  assertAllowedOrigin(origin, allowed.rows[0]?.allowed_origins || []);
  await query('UPDATE visitor_sessions SET last_seen_at = NOW() WHERE id = $1', [context.sessionId]);
  return context;
}

router.post('/widgets/:widgetId/sessions', async (req, res, next) => {
  try {
    const widget = await query<{ id: string; tenant_id: string; enabled: boolean; allowed_origins: string[] }>('SELECT id, tenant_id, enabled, allowed_origins FROM widgets WHERE id = $1', [req.params.widgetId]);
    if (!widget.rows[0] || !widget.rows[0].enabled) throw new AppError(404, 'WIDGET_NOT_FOUND', '访客入口不存在或已停用');
    assertAllowedOrigin(req.headers.origin, widget.rows[0].allowed_origins || []);
    const visitorId = typeof req.body?.visitorId === 'string' && req.body.visitorId.trim() ? req.body.visitorId.trim().slice(0, 160) : randomId();
    const sessionId = randomId();
    const token = randomOpaqueToken();
    await query(`INSERT INTO visitor_sessions(id, widget_id, tenant_id, visitor_id, token_hash, expires_at) VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' hours')::interval)`, [sessionId, widget.rows[0].id, widget.rows[0].tenant_id, visitorId, hashOpaqueToken(token), String(config.visitorSessionTtlHours)]);
    res.status(201).json({ success: true, message: '访客会话已创建', data: { sessionId, visitorId, token, expiresInHours: config.visitorSessionTtlHours } });
  } catch (error) { next(error); }
});

router.get('/sessions/:sessionId/messages', async (req, res, next) => {
  try {
    const context = await visitorContext(req);
    const result = await query(`SELECT id, conversation_id AS "conversationId", direction, sender_type AS "senderType", content, delivery_status AS "deliveryStatus", created_at AS "createdAt" FROM messages WHERE tenant_id = $1 AND conversation_id IN (SELECT id FROM conversations WHERE tenant_id = $1 AND widget_id = $2 AND external_user_id = $3) ORDER BY created_at ASC LIMIT 200`, [context.tenantId, context.widgetId, context.visitorId]);
    res.json({ success: true, message: '获取消息成功', data: { messages: result.rows } });
  } catch (error) { next(error); }
});

router.post('/sessions/:sessionId/messages', async (req, res, next) => {
  try {
    const context = await visitorContext(req);
    const content = requireText(req.body?.content, '消息内容', 4000);
    const nickname = optionalText(req.body?.nickname, 120) || '访客';
    const headerIdempotencyKey = typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'].trim() : '';
    const idempotencyKey = headerIdempotencyKey && headerIdempotencyKey.length <= 160 ? headerIdempotencyKey : randomId();
    const eventSource = `web:${context.widgetId}:${context.visitorId}`;
    const result = await withTransaction(async (client) => {
      const conversation = await client.query<{ id: string; mode: 'human' | 'ai_draft' | 'auto'; mode_version: number }>(
        `SELECT id, mode, mode_version FROM conversations WHERE tenant_id = $1 AND widget_id = $2 AND external_user_id = $3 FOR UPDATE`,
        [context.tenantId, context.widgetId, context.visitorId],
      );
      let conversationId = conversation.rows[0]?.id;
      let mode = conversation.rows[0]?.mode || 'ai_draft';
      let modeVersion = conversation.rows[0]?.mode_version || 1;
      if (!conversationId) {
        conversationId = randomId();
        await client.query(`INSERT INTO conversations(id, tenant_id, widget_id, visitor_session_id, external_user_id, user_nickname, mode) VALUES ($1, $2, $3, $4, $5, $6, 'ai_draft')`, [conversationId, context.tenantId, context.widgetId, context.sessionId, context.visitorId, nickname]);
      } else {
        await client.query('UPDATE conversations SET visitor_session_id = COALESCE(visitor_session_id, $1), user_nickname = $2, updated_at = NOW() WHERE id = $3', [context.sessionId, nickname, conversationId]);
      }
      const messageId = randomId();
      const eventId = randomId();
      const eventInsert = await client.query<{ id: string }>(`INSERT INTO inbound_events(id, tenant_id, source, external_event_id, event_type, payload) VALUES ($1, $2, $3, $4, 'web_message', $5::jsonb) ON CONFLICT DO NOTHING RETURNING id`, [eventId, context.tenantId, eventSource, idempotencyKey, JSON.stringify({ version: '1', eventId, tenantId: context.tenantId, channelAccountId: null, source: eventSource, externalEventId: idempotencyKey, conversationId, type: 'web_message', content, occurredAt: new Date().toISOString(), receivedAt: new Date().toISOString(), metadata: { visitorSessionId: context.sessionId } })]);
      if (!eventInsert.rowCount) {
        const existing = await client.query<{ id: string; conversation_id: string }>(`SELECT id, conversation_id FROM messages WHERE tenant_id = $1 AND conversation_id = $2 AND external_message_id = $3`, [context.tenantId, conversationId, idempotencyKey]);
        return { conversationId: existing.rows[0]?.conversation_id || conversationId, messageId: existing.rows[0]?.id || messageId, aiRunId: undefined, mode, modeVersion, duplicate: true };
      }
      await client.query(`INSERT INTO messages(id, tenant_id, conversation_id, external_message_id, direction, sender_type, message_type, content, delivery_status, metadata) VALUES ($1, $2, $3, $4, 'inbound', 'visitor', 'web_message', $5, 'received', $6::jsonb)`, [messageId, context.tenantId, conversationId, idempotencyKey, content, JSON.stringify({ visitorSessionId: context.sessionId, standardEventVersion: '1' })]);
      await client.query('UPDATE conversations SET message_count = message_count + 1, last_message_at = NOW() WHERE id = $1', [conversationId]);
      const aiRunId = randomId();
      if (mode !== 'human') await client.query(`INSERT INTO ai_runs(id, tenant_id, conversation_id, message_id, provider, status) VALUES ($1, $2, $3, $4, $5, 'queued')`, [aiRunId, context.tenantId, conversationId, messageId, process.env.AI_PROVIDER || 'coze']);
      return { conversationId, messageId, aiRunId: mode === 'human' ? undefined : aiRunId, mode, modeVersion, duplicate: false };
    });
    if (result.aiRunId) await enqueueJob(context.tenantId, 'ai_draft', { conversationId: result.conversationId, messageId: result.messageId, aiRunId: result.aiRunId, modeVersion: result.modeVersion });
    if (!result.duplicate) broadcast(context.tenantId, { type: 'message', data: { id: result.messageId, conversationId: result.conversationId, direction: 'inbound', senderType: 'visitor', content, deliveryStatus: 'received' }, timestamp: new Date().toISOString() });
    res.status(201).json({ success: true, message: '消息已接收', data: { conversationId: result.conversationId, messageId: result.messageId, aiRunId: result.aiRunId || null } });
  } catch (error) { next(error); }
});

router.post('/sessions/:sessionId/lead', async (req, res, next) => {
  try {
    const context = await visitorContext(req);
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!phone && !email) throw new AppError(400, 'CONTACT_REQUIRED', '请至少提供手机号或邮箱');
    const conversation = await query<{ id: string; channel_account_id: string | null; external_user_id: string; user_nickname: string }>('SELECT id, channel_account_id, external_user_id, user_nickname FROM conversations WHERE tenant_id = $1 AND widget_id = $2 AND external_user_id = $3 ORDER BY created_at DESC LIMIT 1', [context.tenantId, context.widgetId, context.visitorId]);
    if (!conversation.rows[0]) throw new AppError(409, 'CONVERSATION_REQUIRED', '请先发送一条咨询消息');
    const result = await query(`INSERT INTO leads(id, tenant_id, conversation_id, channel_account_id, external_user_id, user_nickname, phone, email, contact_source, consent_at, consent_version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'customer_submitted', NOW(), $9) ON CONFLICT (tenant_id, conversation_id) DO UPDATE SET phone = COALESCE(EXCLUDED.phone, leads.phone), email = COALESCE(EXCLUDED.email, leads.email), consent_at = EXCLUDED.consent_at, consent_version = EXCLUDED.consent_version, updated_at = NOW() RETURNING id, status, created_at AS "createdAt"`, [randomId(), context.tenantId, conversation.rows[0].id, conversation.rows[0].channel_account_id, conversation.rows[0].external_user_id, conversation.rows[0].user_nickname, phone || null, email || null, typeof req.body?.consentVersion === 'string' ? req.body.consentVersion : 'v1']);
    res.status(201).json({ success: true, message: '联系方式已提交', data: { lead: result.rows[0] } });
  } catch (error) { next(error); }
});

export default router;
