import express from 'express';
import { query } from '../db';
import { randomId } from '../config';
import { AppError } from '../errors';
import { requireRole } from '../middleware/auth';
import { tenantId } from './helpers';

const router = express.Router();

function mapChannel(row: Record<string, unknown>) {
  return {
    id: row.id,
    type: row.platform,
    name: row.display_name,
    accountId: row.external_account_id,
    accountName: row.display_name,
    avatar: row.avatar || undefined,
    status: row.status,
    lastHeartbeat: row.last_event_at,
    config: { autoReply: false, keywords: [], welcomeMessage: '', silenceTimeout: 0, maxConcurrent: 0 },
    createdAt: row.created_at,
    capability: row.platform === 'web' ? 'verified' : 'unverified',
  };
}

router.get('/douyin/oauth/url', (_req, res) => res.status(503).json({ success: false, message: '抖音 OAuth 尚未完成当前应用的真实权限核验', code: 'PLATFORM_UNVERIFIED' }));
router.get('/douyin/oauth/callback', (_req, res) => res.status(503).json({ success: false, message: '抖音 OAuth 回调暂未启用，避免未经验证的授权流程', code: 'PLATFORM_UNVERIFIED' }));
router.post('/douyin/start', (_req, res) => res.status(503).json({ success: false, message: '抖音监听能力尚未完成真实核验', code: 'PLATFORM_UNVERIFIED' }));
router.post('/douyin/stop', (_req, res) => res.status(503).json({ success: false, message: '抖音监听能力尚未完成真实核验', code: 'PLATFORM_UNVERIFIED' }));

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`SELECT id, platform, external_account_id, display_name, avatar, status, last_event_at, created_at FROM channel_accounts WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId(req)]);
    res.json({ success: true, message: '获取渠道列表成功', data: { channels: result.rows.map(mapChannel) } });
  } catch (error) { next(error); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const platform = typeof req.body?.platform === 'string' ? req.body.platform.trim() : '';
    const externalAccountId = typeof req.body?.accountId === 'string' ? req.body.accountId.trim() : '';
    const displayName = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (!['web', 'douyin', 'kuaishou', 'wechat', 'xiaohongshu'].includes(platform) || !externalAccountId || !displayName) throw new AppError(400, 'INVALID_CHANNEL', '平台、账号标识和名称均为必填项');
    if (platform !== 'web') throw new AppError(503, 'PLATFORM_UNVERIFIED', '该平台尚未完成当前应用的真实能力核验');
    const result = await query(`INSERT INTO channel_accounts(id, tenant_id, platform, external_account_id, display_name, status) VALUES ($1, $2, $3, $4, $5, 'authorized') RETURNING id, platform, external_account_id, display_name, avatar, status, last_event_at, created_at`, [randomId(), tenantId(req), platform, externalAccountId, displayName]);
    res.status(201).json({ success: true, message: '渠道已创建', data: { channel: mapChannel(result.rows[0]) } });
  } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const result = await query(`SELECT id, platform, external_account_id, display_name, avatar, status, last_event_at, created_at FROM channel_accounts WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'CHANNEL_NOT_FOUND', '渠道账号不存在');
    res.json({ success: true, message: '获取渠道成功', data: { channel: mapChannel(result.rows[0]) } });
  } catch (error) { next(error); }
});

router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
    const status = ['authorized', 'subscribed', 'error', 'disabled', 'unconfigured'].includes(req.body?.status) ? req.body.status : undefined;
    if (!name && !status) throw new AppError(400, 'NO_CHANGES', '没有可更新字段');
    const result = await query(`UPDATE channel_accounts SET display_name = COALESCE($1, display_name), status = COALESCE($2, status), updated_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING id, platform, external_account_id, display_name, avatar, status, last_event_at, created_at`, [name || null, status || null, req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'CHANNEL_NOT_FOUND', '渠道账号不存在');
    res.json({ success: true, message: '渠道已更新', data: { channel: mapChannel(result.rows[0]) } });
  } catch (error) { next(error); }
});

router.delete('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const result = await query(`UPDATE channel_accounts SET status = 'disabled', credentials_encrypted = NULL, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING id`, [req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'CHANNEL_NOT_FOUND', '渠道账号不存在');
    res.json({ success: true, message: '渠道已停用', data: { id: req.params.id } });
  } catch (error) { next(error); }
});

router.get('/:id/status', async (req, res, next) => {
  try {
    const result = await query(`SELECT id, platform, status, last_event_at AS "lastEventAt" FROM channel_accounts WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'CHANNEL_NOT_FOUND', '渠道账号不存在');
    const row = result.rows[0] as { status: string; platform: string };
    res.json({ success: true, message: '获取渠道状态成功', data: { ...result.rows[0], connected: ['authorized', 'subscribed'].includes(row.status), subscription: row.status === 'subscribed', replyCapability: row.platform === 'web' ? 'verified' : 'unverified' } });
  } catch (error) { next(error); }
});

export default router;
