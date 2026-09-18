import express from 'express';
import { query } from '../db';
import { randomId, randomOpaqueToken } from '../config';
import { tenantId } from './helpers';
import { requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`SELECT id, name, public_key AS "publicKey", enabled, allowed_origins AS "allowedOrigins", created_at AS "createdAt", updated_at AS "updatedAt" FROM widgets WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId(req)]);
    return res.json({ success: true, message: '获取访客入口成功', data: { widgets: result.rows } });
  } catch (error) { return next(error); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const allowedOrigins = Array.isArray(req.body?.allowedOrigins) ? req.body.allowedOrigins.filter((origin: unknown): origin is string => typeof origin === 'string' && origin.length < 300) : [];
    if (!name || name.length > 120) return res.status(400).json({ success: false, message: '入口名称不能为空且不能超过120个字符' });
    const id = randomId();
    const publicKey = randomOpaqueToken();
    const result = await query(`INSERT INTO widgets(id, tenant_id, name, public_key, allowed_origins) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, public_key AS "publicKey", enabled, allowed_origins AS "allowedOrigins", created_at AS "createdAt"`, [id, tenantId(req), name, publicKey, allowedOrigins]);
    return res.status(201).json({ success: true, message: '访客入口创建成功', data: { widget: result.rows[0] } });
  } catch (error) { return next(error); }
});

router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const updates: string[] = [];
    const values: unknown[] = [];
    if (typeof req.body?.name === 'string' && req.body.name.trim()) { values.push(req.body.name.trim()); updates.push(`name = $${values.length}`); }
    if (typeof req.body?.enabled === 'boolean') { values.push(req.body.enabled); updates.push(`enabled = $${values.length}`); }
    if (Array.isArray(req.body?.allowedOrigins)) { values.push(req.body.allowedOrigins.filter((origin: unknown): origin is string => typeof origin === 'string')); updates.push(`allowed_origins = $${values.length}`); }
    if (!updates.length) return res.status(400).json({ success: false, message: '没有可更新字段' });
    values.push(req.params.id, tenantId(req));
    const result = await query(`UPDATE widgets SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length - 1} AND tenant_id = $${values.length} RETURNING id, name, public_key AS "publicKey", enabled, allowed_origins AS "allowedOrigins", updated_at AS "updatedAt"`, values);
    if (!result.rowCount) return res.status(404).json({ success: false, message: '访客入口不存在' });
    return res.json({ success: true, message: '访客入口已更新', data: { widget: result.rows[0] } });
  } catch (error) { return next(error); }
});

export default router;
