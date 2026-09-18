import express from 'express';
import { query, checkDatabase } from '../db';
import { config } from '../config';
import { checkRedis } from '../realtime/tickets';
import { tenantId } from './helpers';

const router = express.Router();

router.get('/tenants', async (req, res, next) => {
  try {
    const result = await query(`SELECT id, name, domain, plan, status, expires_at AS "expiresAt", created_at AS "createdAt" FROM tenants WHERE id = $1`, [tenantId(req)]);
    res.json({ success: true, message: '获取企业信息成功', data: { tenants: result.rows } });
  } catch (error) { next(error); }
});

router.get('/billing/plans', (_req, res) => res.status(501).json({ success: false, message: '计费模块尚未接入，不返回演示套餐数据', code: 'FEATURE_NOT_IMPLEMENTED' }));
router.get('/billing/subscription', (_req, res) => res.status(501).json({ success: false, message: '计费模块尚未接入', code: 'FEATURE_NOT_IMPLEMENTED' }));
router.post('/billing/subscribe', (_req, res) => res.status(501).json({ success: false, message: '计费模块尚未接入', code: 'FEATURE_NOT_IMPLEMENTED' }));
router.put('/billing/cancel', (_req, res) => res.status(501).json({ success: false, message: '计费模块尚未接入', code: 'FEATURE_NOT_IMPLEMENTED' }));

router.get('/monitoring', async (req, res, next) => {
  try {
    const memory = process.memoryUsage();
    const dbReady = await checkDatabase();
    const redisReady = config.redisUrl ? await checkRedis() : false;
    res.json({ success: true, message: '获取运行状态成功', data: { uptimeSeconds: Math.floor(process.uptime()), memoryRssBytes: memory.rss, heapUsedBytes: memory.heapUsed, database: dbReady ? 'ready' : 'unavailable', redis: config.redisUrl ? (redisReady ? 'ready' : 'unavailable') : 'not-configured', nodeEnv: process.env.NODE_ENV || 'development' } });
  } catch (error) { next(error); }
});

router.get('/logs', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
    const result = await query(`SELECT id, user_id AS "userId", action, resource_type AS "resourceType", resource_id AS "resourceId", metadata, created_at AS "createdAt" FROM audit_logs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`, [tenantId(req), limit]);
    res.json({ success: true, message: '获取审计日志成功', data: { logs: result.rows } });
  } catch (error) { next(error); }
});

export default router;
