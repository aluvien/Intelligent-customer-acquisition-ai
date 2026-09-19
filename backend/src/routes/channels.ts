import express from 'express';
import { query } from '../db';
import { hashOpaqueToken, randomId, randomOpaqueToken } from '../config';
import { AppError } from '../errors';
import { requireRole } from '../middleware/auth';
import { buildDouyinAuthorizeUrl, douyinOAuthConfigStatus, getDouyinOAuthConfig } from '../services/douyinOAuth';
import { tenantId } from './helpers';

const router = express.Router();

function mapChannel(row: Record<string, unknown>) {
  const accountAuthorized = row.platform === 'douyin'
    && row.has_credentials === true
    && ['authorized', 'subscribed'].includes(String(row.status));
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
    capability: row.platform === 'web' ? 'verified' : accountAuthorized ? 'account_authorized' : 'unverified',
    accountAuthorization: row.platform === 'web' || accountAuthorized ? 'verified' : 'unverified',
    messageCapability: row.platform === 'web' ? 'verified' : 'unverified',
  };
}

router.get('/douyin/oauth/config', requireRole('admin'), (_req, res) => {
  const status = douyinOAuthConfigStatus();
  res.json({
    success: true,
    message: status.configured ? '抖音账号授权已配置' : '抖音账号授权需要完成服务端配置',
    data: { ...status, messageCapability: 'unverified' },
  });
});

router.post('/douyin/oauth/requests', requireRole('admin'), async (req, res, next) => {
  try {
    const oauth = getDouyinOAuthConfig();
    const requestId = randomId();
    const state = randomOpaqueToken();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await query(
      `INSERT INTO channel_oauth_requests(id, tenant_id, user_id, auth_session_id, platform, state_hash, expires_at)
       VALUES ($1, $2, $3, $4, 'douyin', $5, $6)`,
      [requestId, tenantId(req), req.auth!.userId, req.auth!.sessionId, hashOpaqueToken(state), expiresAt],
    );
    res.status(201).json({
      success: true,
      message: '抖音扫码授权请求已创建',
      data: { requestId, authUrl: buildDouyinAuthorizeUrl(oauth, state), expiresAt: expiresAt.toISOString() },
    });
  } catch (error) { next(error); }
});

router.get('/douyin/oauth/requests/:requestId', requireRole('admin'), async (req, res, next) => {
  try {
    let result = await query<{
      status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired';
      channel_account_id: string | null;
      error_code: string | null;
      error_message: string | null;
      expires_at: Date;
    }>(
      `SELECT status, channel_account_id, error_code, error_message, expires_at
         FROM channel_oauth_requests
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND auth_session_id = $4 AND platform = 'douyin'`,
      [req.params.requestId, tenantId(req), req.auth!.userId, req.auth!.sessionId],
    );
    if (!result.rowCount) throw new AppError(404, 'OAUTH_REQUEST_NOT_FOUND', '扫码授权请求不存在');
    const current = result.rows[0];
    const expired = current.status === 'pending'
      ? current.expires_at <= new Date()
      : current.status === 'processing' && current.expires_at.getTime() <= Date.now() - 60_000;
    if (expired) {
      const expiration = await query<{
        status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired';
        channel_account_id: string | null;
        error_code: string | null;
        error_message: string | null;
        expires_at: Date;
      }>(
        `UPDATE channel_oauth_requests
            SET status = 'expired', error_code = 'OAUTH_REQUEST_EXPIRED', error_message = '二维码已过期，请重新生成', updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND auth_session_id = $4
            AND (status = 'pending' OR (status = 'processing' AND expires_at < NOW() - INTERVAL '1 minute'))
          RETURNING status, channel_account_id, error_code, error_message, expires_at`,
        [req.params.requestId, tenantId(req), req.auth!.userId, req.auth!.sessionId],
      );
      if (expiration.rowCount) result = expiration;
      else {
        result = await query(
          `SELECT status, channel_account_id, error_code, error_message, expires_at
             FROM channel_oauth_requests
            WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND auth_session_id = $4 AND platform = 'douyin'`,
          [req.params.requestId, tenantId(req), req.auth!.userId, req.auth!.sessionId],
        );
      }
    }
    const row = result.rows[0];
    res.json({
      success: true,
      message: '获取扫码授权状态成功',
      data: {
        status: row.status,
        channelAccountId: row.channel_account_id,
        errorCode: row.error_code,
        errorMessage: row.error_message,
        expiresAt: row.expires_at,
      },
    });
  } catch (error) { next(error); }
});

router.post('/douyin/start', (_req, res) => res.status(503).json({ success: false, message: '抖音监听能力尚未完成真实核验', code: 'PLATFORM_UNVERIFIED' }));
router.post('/douyin/stop', (_req, res) => res.status(503).json({ success: false, message: '抖音监听能力尚未完成真实核验', code: 'PLATFORM_UNVERIFIED' }));

router.get('/', async (req, res, next) => {
  try {
    const result = await query(`SELECT id, platform, external_account_id, display_name, avatar, status, last_event_at, created_at, credentials_encrypted IS NOT NULL AS has_credentials FROM channel_accounts WHERE tenant_id = $1 ORDER BY created_at DESC`, [tenantId(req)]);
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
    const result = await query(`SELECT id, platform, external_account_id, display_name, avatar, status, last_event_at, created_at, credentials_encrypted IS NOT NULL AS has_credentials FROM channel_accounts WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'CHANNEL_NOT_FOUND', '渠道账号不存在');
    res.json({ success: true, message: '获取渠道成功', data: { channel: mapChannel(result.rows[0]) } });
  } catch (error) { next(error); }
});

router.patch('/:id', requireRole('admin'), async (req, res, next) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : undefined;
    const status = ['authorized', 'subscribed', 'error', 'disabled', 'unconfigured'].includes(req.body?.status) ? req.body.status : undefined;
    if (!name && !status) throw new AppError(400, 'NO_CHANGES', '没有可更新字段');
    const current = await query<{ platform: string }>('SELECT platform FROM channel_accounts WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId(req)]);
    if (!current.rowCount) throw new AppError(404, 'CHANNEL_NOT_FOUND', '渠道账号不存在');
    if (current.rows[0].platform === 'douyin' && status && ['authorized', 'subscribed'].includes(status)) {
      throw new AppError(409, 'DOUYIN_STATE_MANAGED', '抖音授权状态只能由官方 OAuth 和已验证的消息订阅流程更新');
    }
    const result = await query(`UPDATE channel_accounts SET display_name = COALESCE($1, display_name), status = COALESCE($2, status), updated_at = NOW() WHERE id = $3 AND tenant_id = $4 RETURNING id, platform, external_account_id, display_name, avatar, status, last_event_at, created_at, credentials_encrypted IS NOT NULL AS has_credentials`, [name || null, status || null, req.params.id, tenantId(req)]);
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
    const result = await query(`SELECT id, platform, status, last_event_at AS "lastEventAt", credentials_encrypted IS NOT NULL AS has_credentials FROM channel_accounts WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId(req)]);
    if (!result.rowCount) throw new AppError(404, 'CHANNEL_NOT_FOUND', '渠道账号不存在');
    const row = result.rows[0] as { status: string; platform: string; has_credentials: boolean };
    const accountAuthorized = row.platform === 'web'
      ? ['authorized', 'subscribed'].includes(row.status)
      : row.platform === 'douyin' && row.has_credentials && ['authorized', 'subscribed'].includes(row.status);
    const messageVerified = row.platform === 'web';
    res.json({ success: true, message: '获取渠道状态成功', data: { id: result.rows[0].id, platform: row.platform, status: row.status, lastEventAt: result.rows[0].lastEventAt, connected: accountAuthorized, subscription: messageVerified && row.status === 'subscribed', accountAuthorization: accountAuthorized ? 'verified' : 'unverified', messageCapability: messageVerified ? 'verified' : 'unverified', replyCapability: messageVerified ? 'verified' : 'unverified' } });
  } catch (error) { next(error); }
});

export default router;
