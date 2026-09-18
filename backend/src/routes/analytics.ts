import express from 'express';
import { query } from '../db';
import { tenantConnectionCount } from '../realtime/hub';
import { tenantId } from './helpers';

const router = express.Router();

router.get('/dashboard', async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await query<{ conversations: string; active: string; leads: string; new_leads: string; converted: string; response_seconds: string | null }>(
      `SELECT
         (SELECT COUNT(*) FROM conversations WHERE tenant_id = $1)::text AS conversations,
         (SELECT COUNT(*) FROM conversations WHERE tenant_id = $1 AND status = 'active')::text AS active,
         (SELECT COUNT(*) FROM leads WHERE tenant_id = $1)::text AS leads,
         (SELECT COUNT(*) FROM leads WHERE tenant_id = $1 AND status = 'new')::text AS new_leads,
         (SELECT COUNT(*) FROM leads WHERE tenant_id = $1 AND status = 'converted')::text AS converted,
         (SELECT AVG(EXTRACT(EPOCH FROM (outbound.created_at - inbound.created_at)))::text
            FROM messages inbound JOIN LATERAL (
              SELECT created_at FROM messages m2 WHERE m2.conversation_id = inbound.conversation_id AND m2.direction = 'outbound' AND m2.created_at >= inbound.created_at ORDER BY m2.created_at LIMIT 1
            ) outbound ON TRUE
           WHERE inbound.tenant_id = $1 AND inbound.direction = 'inbound') AS response_seconds`,
      [tenant],
    );
    const row = result.rows[0];
    const leads = Number(row?.leads || 0);
    res.json({ success: true, message: '获取仪表盘统计成功', data: {
      totalConversations: Number(row?.conversations || 0),
      activeConversations: Number(row?.active || 0),
      totalLeads: leads,
      newLeads: Number(row?.new_leads || 0),
      conversionRate: leads ? Number(((Number(row?.converted || 0) / leads) * 100).toFixed(2)) : 0,
      avgResponseTime: row?.response_seconds ? Number(Number(row.response_seconds).toFixed(2)) : null,
      satisfactionScore: null,
    } });
  } catch (error) { next(error); }
});

router.get('/realtime', async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const result = await query<{ active: string; messages: string }>(`SELECT (SELECT COUNT(*) FROM conversations WHERE tenant_id = $1 AND status = 'active')::text AS active, (SELECT COUNT(*) FROM messages WHERE tenant_id = $1 AND created_at >= NOW() - INTERVAL '1 minute')::text AS messages`, [tenant]);
    const memory = process.memoryUsage();
    res.json({ success: true, message: '获取实时数据成功', data: {
      onlineUsers: tenantConnectionCount(tenant),
      activeConversations: Number(result.rows[0]?.active || 0),
      messagesPerMinute: Number(result.rows[0]?.messages || 0),
      systemLoad: Number(((memory.rss / process.memoryUsage().heapTotal) * 100).toFixed(2)),
    } });
  } catch (error) { next(error); }
});

router.get('/channels', async (req, res, next) => {
  try {
    const result = await query(`SELECT ca.id AS "channelId", ca.display_name AS "channelName", COUNT(DISTINCT c.id)::int AS conversations, COUNT(DISTINCT l.id)::int AS leads, CASE WHEN COUNT(DISTINCT c.id) = 0 THEN 0 ELSE ROUND(COUNT(DISTINCT l.id)::numeric / COUNT(DISTINCT c.id) * 100, 2) END AS "conversionRate" FROM channel_accounts ca LEFT JOIN conversations c ON c.channel_account_id = ca.id LEFT JOIN leads l ON l.channel_account_id = ca.id WHERE ca.tenant_id = $1 GROUP BY ca.id ORDER BY conversations DESC`, [tenantId(req)]);
    res.json({ success: true, message: '获取渠道统计成功', data: { channels: result.rows } });
  } catch (error) { next(error); }
});

router.get('/trends', async (req, res, next) => {
  try {
    const period = req.query.period === '24h' ? '24 hours' : req.query.period === '30d' ? '30 days' : '7 days';
    const result = await query(`WITH days AS (SELECT generate_series(date_trunc('day', NOW() - $2::interval), date_trunc('day', NOW()), INTERVAL '1 day') AS day) SELECT to_char(days.day, 'YYYY-MM-DD') AS date, COUNT(DISTINCT c.id)::int AS conversations, COUNT(DISTINCT l.id)::int AS leads FROM days LEFT JOIN conversations c ON c.tenant_id = $1 AND c.created_at >= days.day AND c.created_at < days.day + INTERVAL '1 day' LEFT JOIN leads l ON l.tenant_id = $1 AND l.created_at >= days.day AND l.created_at < days.day + INTERVAL '1 day' GROUP BY days.day ORDER BY days.day`, [tenantId(req), period]);
    res.json({ success: true, message: '获取趋势数据成功', data: { trends: result.rows } });
  } catch (error) { next(error); }
});

router.get('/performance', async (req, res, next) => {
  try {
    const result = await query(`SELECT u.id AS "agentId", u.username AS agent, COUNT(DISTINCT c.id)::int AS conversations, COUNT(l.id)::int AS leads FROM users u LEFT JOIN conversations c ON c.assigned_to = u.id AND c.tenant_id = u.tenant_id LEFT JOIN leads l ON l.assigned_to = u.id AND l.tenant_id = u.tenant_id WHERE u.tenant_id = $1 GROUP BY u.id ORDER BY conversations DESC`, [tenantId(req)]);
    res.json({ success: true, message: '获取客服绩效成功', data: { performance: result.rows } });
  } catch (error) { next(error); }
});

router.get('/funnel', async (req, res, next) => {
  try {
    const result = await query(`SELECT status, COUNT(*)::int AS count FROM leads WHERE tenant_id = $1 GROUP BY status ORDER BY status`, [tenantId(req)]);
    res.json({ success: true, message: '获取转化漏斗成功', data: { funnel: result.rows } });
  } catch (error) { next(error); }
});

export default router;
