import express from 'express';
import { hashOpaqueToken, randomId } from '../config';
import { query, withTransaction } from '../db';
import { AppError } from '../errors';
import { encryptSecret } from '../security/crypto';
import { authorizeDouyinAccount } from '../services/douyinOAuth';

const router = express.Router();

type OAuthRequest = {
  id: string;
  tenant_id: string;
  user_id: string;
  auth_session_id: string;
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'expired';
  expires_at: Date;
};

function page(title: string, message: string): string {
  const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] || character);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title></head><body><main><h1>${escape(title)}</h1><p>${escape(message)}</p><p>你可以关闭此页面并返回渠道中心。</p></main></body></html>`;
}

function sendPage(res: express.Response, status: number, title: string, message: string): void {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).type('html').send(page(title, message));
}

async function claimRequest(state: string): Promise<OAuthRequest> {
  const outcome = await withTransaction(async (client) => {
    const result = await client.query<OAuthRequest>(
      `SELECT id, tenant_id, user_id, auth_session_id, status, expires_at
         FROM channel_oauth_requests
        WHERE platform = 'douyin' AND state_hash = $1
        FOR UPDATE`,
      [hashOpaqueToken(state)],
    );
    const request = result.rows[0];
    if (!request || request.status !== 'pending') {
      return { error: new AppError(400, 'OAUTH_STATE_INVALID', '授权状态无效或已使用') };
    }
    if (request.expires_at <= new Date()) {
      await client.query(
        `UPDATE channel_oauth_requests SET status = 'expired', error_code = 'OAUTH_REQUEST_EXPIRED', error_message = '二维码已过期，请重新生成', updated_at = NOW() WHERE id = $1`,
        [request.id],
      );
      return { error: new AppError(400, 'OAUTH_REQUEST_EXPIRED', '二维码已过期，请重新生成') };
    }
    const active = await client.query(
      `SELECT 1
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
         JOIN tenants t ON t.id = u.tenant_id
        WHERE s.id = $1 AND s.user_id = $2 AND s.tenant_id = $3
          AND s.revoked_at IS NULL AND s.expires_at > NOW()
          AND u.status = 'active' AND u.role = 'admin' AND t.status = 'active'`,
      [request.auth_session_id, request.user_id, request.tenant_id],
    );
    if (!active.rowCount) {
      await client.query(
        `UPDATE channel_oauth_requests SET status = 'failed', error_code = 'OAUTH_SESSION_INVALID', error_message = '发起授权的管理员会话已失效', updated_at = NOW() WHERE id = $1`,
        [request.id],
      );
      return { error: new AppError(400, 'OAUTH_SESSION_INVALID', '发起授权的管理员会话已失效，请重新登录后扫码') };
    }
    await client.query(
      `UPDATE channel_oauth_requests SET status = 'processing', consumed_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [request.id],
    );
    return { request };
  });
  if ('error' in outcome) throw outcome.error;
  return outcome.request;
}

async function failRequest(requestId: string, error: unknown): Promise<void> {
  const appError = error instanceof AppError ? error : new AppError(502, 'DOUYIN_OAUTH_FAILED', '抖音授权失败，请重新扫码');
  await query(
    `UPDATE channel_oauth_requests
        SET status = 'failed', error_code = $2, error_message = $3, updated_at = NOW()
      WHERE id = $1 AND status = 'processing'`,
    [requestId, appError.code.slice(0, 100), appError.message.slice(0, 500)],
  ).catch(() => undefined);
}

router.get('/', async (req, res) => {
  const state = typeof req.query.state === 'string' ? req.query.state.trim() : '';
  if (!state || state.length > 512) {
    sendPage(res, 400, '授权失败', '授权状态缺失或无效，请返回渠道中心重新扫码。');
    return;
  }
  let request: OAuthRequest;
  try {
    request = await claimRequest(state);
  } catch (error) {
    sendPage(res, error instanceof AppError ? error.status : 400, '授权失败', error instanceof Error ? error.message : '授权状态无效');
    return;
  }

  const providerError = typeof req.query.error === 'string' ? req.query.error.trim() : '';
  const code = typeof req.query.code === 'string' ? req.query.code.trim() : '';
  if (providerError || !code || code.length > 2048) {
    const error = new AppError(400, 'DOUYIN_AUTH_DENIED', providerError ? '你已取消或拒绝抖音授权' : '抖音未返回有效授权码');
    await failRequest(request.id, error);
    sendPage(res, 400, '授权未完成', error.message);
    return;
  }

  try {
    const account = await authorizeDouyinAccount(code);
    const encryptedCredentials = encryptSecret(JSON.stringify(account.credentials));
    await withTransaction(async (client) => {
      // Use the same user -> session lock order as logout/refresh. Re-reading the
      // session only after acquiring both locks prevents a concurrent revoke or
      // password change from being missed while this callback waits.
      const activeUser = await client.query(
        `SELECT u.id
           FROM users u
           JOIN tenants t ON t.id = u.tenant_id
          WHERE u.id = $1 AND u.tenant_id = $2
            AND u.status = 'active' AND u.role = 'admin' AND t.status = 'active'
          FOR UPDATE OF u`,
        [request.user_id, request.tenant_id],
      );
      if (!activeUser.rowCount) throw new AppError(400, 'OAUTH_SESSION_INVALID', '发起授权的管理员会话已失效');
      const activeSession = await client.query(
        `SELECT id
           FROM auth_sessions
          WHERE id = $1 AND user_id = $2 AND tenant_id = $3
            AND revoked_at IS NULL AND expires_at > NOW()
          FOR UPDATE`,
        [request.auth_session_id, request.user_id, request.tenant_id],
      );
      if (!activeSession.rowCount) throw new AppError(400, 'OAUTH_SESSION_INVALID', '发起授权的管理员会话已失效');
      const channelId = randomId();
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO channel_accounts(id, tenant_id, platform, external_account_id, display_name, avatar, credentials_encrypted, status)
         VALUES ($1, $2, 'douyin', $3, $4, $5, $6, 'authorized')
         ON CONFLICT (tenant_id, platform, external_account_id) DO UPDATE
           SET display_name = EXCLUDED.display_name,
               avatar = EXCLUDED.avatar,
               credentials_encrypted = EXCLUDED.credentials_encrypted,
               status = 'authorized',
               updated_at = NOW()
         RETURNING id`,
        [channelId, request.tenant_id, account.openId, account.nickname, account.avatar || null, encryptedCredentials],
      );
      const completed = await client.query(
        `UPDATE channel_oauth_requests
            SET status = 'succeeded', channel_account_id = $2, error_code = NULL, error_message = NULL, updated_at = NOW()
          WHERE id = $1 AND status = 'processing'`,
        [request.id, inserted.rows[0].id],
      );
      if (!completed.rowCount) throw new AppError(409, 'OAUTH_REQUEST_STALE', '授权请求状态已变化，请重新扫码');
      await client.query(
        `INSERT INTO audit_logs(id, tenant_id, user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, $2, $3, 'channel_account_authorized', 'channel_account', $4, $5::jsonb)`,
        [randomId(), request.tenant_id, request.user_id, inserted.rows[0].id, JSON.stringify({ platform: 'douyin', oauthRequestId: request.id, scopes: account.credentials.scope })],
      );
    });
    sendPage(res, 200, '授权成功', '抖音账号已安全添加到渠道中心。');
  } catch (error) {
    await failRequest(request.id, error);
    sendPage(res, error instanceof AppError ? error.status : 502, '授权失败', error instanceof Error ? error.message : '抖音授权失败，请重新扫码');
  }
});

export default router;
