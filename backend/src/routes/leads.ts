import express from 'express';
import { query } from '../db';
import { randomId } from '../config';
import { AppError } from '../errors';
import { isUniqueViolation, optionalText, pageParams, requireText, tenantId } from './helpers';
import { requireRole } from '../middleware/auth';

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const { page, limit, offset } = pageParams(req);
    const status = typeof req.query.status === 'string' && req.query.status !== 'all' ? req.query.status : undefined;
    const values: unknown[] = [tenant];
    const filters = ['l.tenant_id = $1'];
    if (status) { values.push(status); filters.push(`l.status = $${values.length}`); }
    const count = await query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM leads l WHERE ${filters.join(' AND ')}`, values);
    values.push(limit, offset);
    const result = await query(`SELECT l.id, l.conversation_id AS "conversationId", l.channel_account_id AS "channelId", l.external_user_id AS "userId", l.user_nickname AS "userNickname", CASE WHEN l.phone IS NULL THEN NULL WHEN length(l.phone) <= 4 THEN '****' ELSE repeat('*', GREATEST(length(l.phone) - 4, 4)) || right(l.phone, 4) END AS phone, CASE WHEN l.email IS NULL THEN NULL WHEN position('@' IN l.email) > 1 THEN left(l.email, 1) || '***' || substring(l.email FROM position('@' IN l.email)) ELSE '***' END AS email, l.contact_source AS "contactSource", l.consent_at AS "consentAt", l.consent_version AS "consentVersion", l.score, l.status, l.assigned_to AS "assignedTo", l.tags, l.notes, l.created_at AS "createdAt", l.updated_at AS "updatedAt" FROM leads l WHERE ${filters.join(' AND ')} ORDER BY l.created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    const total = Number(count.rows[0]?.count || 0);
    res.json({ success: true, message: '获取线索列表成功', data: { leads: result.rows, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } } });
  } catch (error) { next(error); }
});

router.get('/stats/overview', async (req, res, next) => {
  try {
    const result = await query<{ total: string; new_count: string; contacted: string; qualified: string; converted: string }>(`SELECT COUNT(*)::text AS total, COUNT(*) FILTER (WHERE status = 'new')::text AS new_count, COUNT(*) FILTER (WHERE status = 'contacted')::text AS contacted, COUNT(*) FILTER (WHERE status = 'qualified')::text AS qualified, COUNT(*) FILTER (WHERE status = 'converted')::text AS converted FROM leads WHERE tenant_id = $1`, [tenantId(req)]);
    const row = result.rows[0] || { total: '0', new_count: '0', contacted: '0', qualified: '0', converted: '0' };
    res.json({ success: true, message: '获取线索统计成功', data: { total: Number(row.total), new: Number(row.new_count), contacted: Number(row.contacted), qualified: Number(row.qualified), converted: Number(row.converted) } });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`SELECT l.id, l.conversation_id AS "conversationId", l.channel_account_id AS "channelId", l.external_user_id AS "userId", l.user_nickname AS "userNickname", l.phone, l.email, l.contact_source AS "contactSource", l.consent_at AS "consentAt", l.consent_version AS "consentVersion", l.score, l.status, l.assigned_to AS "assignedTo", l.tags, l.notes, l.created_at AS "createdAt", l.updated_at AS "updatedAt" FROM leads l WHERE l.id = $1 AND l.tenant_id = $2`, [req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'LEAD_NOT_FOUND', '线索不存在');
    const followups = await query(`SELECT id, user_id AS "userId", action, note, created_at AS "createdAt" FROM lead_followups WHERE lead_id = $1 AND tenant_id = $2 ORDER BY created_at DESC`, [req.params.id, tenantId(req)]);
    res.json({ success: true, message: '获取线索成功', data: { lead: result.rows[0], followups: followups.rows } });
  } catch (error) { next(error); }
});

router.post('/', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const tenant = tenantId(req);
    const conversationId = requireText(req.body?.conversationId, 'conversationId', 100);
    const phone = optionalText(req.body?.phone, 64);
    const email = optionalText(req.body?.email, 254)?.toLowerCase();
    if (!phone && !email) throw new AppError(400, 'CONTACT_REQUIRED', '至少需要客户主动提供手机号或邮箱');
    if (phone && !/^[+0-9() .-]{6,64}$/.test(phone)) throw new AppError(400, 'INVALID_PHONE', '手机号格式无效');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(400, 'INVALID_EMAIL', '邮箱格式无效');
    const contactSource = typeof req.body?.contactSource === 'string' ? req.body.contactSource : 'customer_submitted';
    if (!['customer_submitted', 'authorized'].includes(contactSource)) throw new AppError(400, 'INVALID_CONTACT_SOURCE', '联系方式来源无效');
    const score = req.body?.score === undefined || req.body?.score === null ? 0 : Number(req.body.score);
    if (!Number.isFinite(score) || score < 0 || score > 10) throw new AppError(400, 'INVALID_SCORE', '评分必须在 0 到 10 之间');
    const conversation = await query<{ id: string; channel_account_id: string | null; external_user_id: string; user_nickname: string }>('SELECT id, channel_account_id, external_user_id, user_nickname FROM conversations WHERE id = $1 AND tenant_id = $2', [conversationId, tenant]);
    if (!conversation.rows[0]) throw new AppError(404, 'CONVERSATION_NOT_FOUND', '对话不存在');
    const id = randomId();
    const result = await query(`INSERT INTO leads(id, tenant_id, conversation_id, channel_account_id, external_user_id, user_nickname, phone, email, contact_source, consent_at, consent_version, score, tags, notes) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10, $11, $12, $13) RETURNING id, conversation_id AS "conversationId", phone, email, status, score, created_at AS "createdAt"`, [id, tenant, conversationId, conversation.rows[0].channel_account_id, conversation.rows[0].external_user_id, conversation.rows[0].user_nickname, phone || null, email || null, contactSource, typeof req.body?.consentVersion === 'string' ? req.body.consentVersion.slice(0, 40) : 'v1', score, Array.isArray(req.body?.tags) ? req.body.tags.filter((tag: unknown): tag is string => typeof tag === 'string' && tag.length <= 100).slice(0, 20) : [], typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 4000) : '']);
    res.status(201).json({ success: true, message: '线索已保存', data: { lead: result.rows[0] } });
  } catch (error) {
    if (isUniqueViolation(error)) return next(new AppError(409, 'LEAD_EXISTS', '该对话已经存在一条线索'));
    next(error);
  }
});

router.patch('/:id', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const fields: string[] = [];
    const values: unknown[] = [];
    if (['new', 'contacted', 'qualified', 'converted', 'lost'].includes(req.body?.status)) { values.push(req.body.status); fields.push(`status = $${values.length}`); }
    if (req.body?.assignedTo === null || typeof req.body?.assignedTo === 'string') {
      if (typeof req.body.assignedTo === 'string') {
        const user = await query('SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND status = \'active\'', [req.body.assignedTo, tenantId(req)]);
        if (!user.rowCount) throw new AppError(400, 'INVALID_ASSIGNEE', '负责人不存在或已停用');
      }
      values.push(req.body.assignedTo || null); fields.push(`assigned_to = $${values.length}`);
    }
    if (Array.isArray(req.body?.tags)) { values.push(req.body.tags.filter((tag: unknown): tag is string => typeof tag === 'string')); fields.push(`tags = $${values.length}`); }
    if (typeof req.body?.notes === 'string') { values.push(req.body.notes.slice(0, 4000)); fields.push(`notes = $${values.length}`); }
    if (!fields.length) throw new AppError(400, 'NO_CHANGES', '没有可更新字段');
    values.push(req.params.id, tenantId(req));
    const result = await query(`UPDATE leads SET ${fields.join(', ')}, updated_at = NOW() WHERE id = $${values.length - 1} AND tenant_id = $${values.length} RETURNING id, status, assigned_to AS "assignedTo", tags, notes, updated_at AS "updatedAt"`, values);
    if (!result.rowCount) throw new AppError(404, 'LEAD_NOT_FOUND', '线索不存在');
    res.json({ success: true, message: '线索已更新', data: { lead: result.rows[0] } });
  } catch (error) { next(error); }
});

router.post('/:id/followups', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const action = requireText(req.body?.action, 'action', 80);
    const note = requireText(req.body?.note, 'note', 2000);
    const exists = await query('SELECT id FROM leads WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId(req)]);
    if (!exists.rowCount) throw new AppError(404, 'LEAD_NOT_FOUND', '线索不存在');
    const result = await query(`INSERT INTO lead_followups(id, tenant_id, lead_id, user_id, action, note) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, action, note, created_at AS "createdAt"`, [randomId(), tenantId(req), req.params.id, req.auth!.userId, action, note]);
    res.status(201).json({ success: true, message: '跟进记录已保存', data: { followup: result.rows[0] } });
  } catch (error) { next(error); }
});

router.post('/:id/assign', requireRole('admin', 'operator'), async (req, res, next) => {
  try {
    const assignedTo = requireText(req.body?.assignedTo, 'assignedTo', 100);
    const user = await query('SELECT id FROM users WHERE id = $1 AND tenant_id = $2 AND status = \'active\'', [assignedTo, tenantId(req)]);
    if (!user.rowCount) throw new AppError(400, 'INVALID_ASSIGNEE', '负责人不存在或已停用');
    const result = await query(`UPDATE leads SET assigned_to = $1, status = CASE WHEN status = 'new' THEN 'contacted' ELSE status END, updated_at = NOW() WHERE id = $2 AND tenant_id = $3 RETURNING id, assigned_to AS "assignedTo", status`, [assignedTo, req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'LEAD_NOT_FOUND', '线索不存在');
    res.json({ success: true, message: '线索已分配', data: { lead: result.rows[0] } });
  } catch (error) { next(error); }
});

export default router;
