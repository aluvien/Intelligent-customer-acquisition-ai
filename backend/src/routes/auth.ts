import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config, getJwtSecret, hashOpaqueToken, randomId, randomOpaqueToken } from '../config';
import { query, withTransaction } from '../db';
import { AppError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { checkOrigin, clearRefreshCookie, parseCookies, REFRESH_COOKIE, setRefreshCookie } from '../security/cookies';
import { isUniqueViolation } from './helpers';
import { disconnectSession, disconnectUser } from '../realtime/hub';

const router = express.Router();

type UserRow = {
  id: string;
  tenant_id: string;
  username: string;
  email: string;
  password_hash: string;
  avatar: string | null;
  role: 'admin' | 'operator' | 'viewer';
  status: 'active' | 'inactive';
  auth_version: number;
  created_at: Date;
  updated_at: Date;
  tenant_name: string;
  tenant_plan: 'basic' | 'pro' | 'enterprise';
  tenant_status: 'active' | 'suspended' | 'expired';
};

function publicUser(row: UserRow) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    avatar: row.avatar || undefined,
    role: row.role,
    tenantId: row.tenant_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function findUserByUsername(username: string): Promise<UserRow | undefined> {
  const result = await query<UserRow>(
    `SELECT u.*, t.name AS tenant_name, t.plan AS tenant_plan, t.status AS tenant_status
       FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE lower(u.username) = lower($1) LIMIT 1`,
    [username],
  );
  return result.rows[0];
}

async function findUserById(userId: string): Promise<UserRow | undefined> {
  const result = await query<UserRow>(
    `SELECT u.*, t.name AS tenant_name, t.plan AS tenant_plan, t.status AS tenant_status
       FROM users u JOIN tenants t ON t.id = u.tenant_id
      WHERE u.id = $1 LIMIT 1`,
    [userId],
  );
  return result.rows[0];
}

function signAccessToken(user: UserRow, sessionId: string): string {
  return jwt.sign(
    { userId: user.id, tenantId: user.tenant_id, role: user.role, sessionId, authVersion: user.auth_version, tokenType: 'access' },
    getJwtSecret(),
    { expiresIn: config.accessTokenTtl as jwt.SignOptions['expiresIn'], issuer: config.jwtIssuer, audience: config.jwtAudience, algorithm: 'HS256' },
  );
}

async function createSession(user: UserRow): Promise<{ token: string; refreshToken: string }> {
  const sessionId = randomId();
  const familyId = randomId();
  const refreshToken = randomOpaqueToken();
  return withTransaction(async (client) => {
    const current = await client.query<UserRow>(
      `SELECT u.*, t.name AS tenant_name, t.plan AS tenant_plan, t.status AS tenant_status
         FROM users u JOIN tenants t ON t.id = u.tenant_id
        WHERE u.id = $1 AND u.tenant_id = $2 AND u.status = 'active' AND t.status = 'active'
        FOR UPDATE OF u`,
      [user.id, user.tenant_id],
    );
    if (!current.rows[0]) throw new AppError(403, 'ACCOUNT_DISABLED', '账户或企业已被禁用');
    await client.query(
      `INSERT INTO auth_sessions(id, user_id, tenant_id, family_id, refresh_token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, NOW() + ($6 || ' days')::interval)`,
      [sessionId, user.id, user.tenant_id, familyId, hashOpaqueToken(refreshToken), String(config.refreshTokenTtlDays)],
    );
    return { token: signAccessToken(current.rows[0], sessionId), refreshToken };
  });
}

function validateCredentials(username: unknown, password: unknown): asserts username is string {
  if (typeof username !== 'string' || username.trim().length < 3 || username.trim().length > 120 || typeof password !== 'string' || password.length < 8 || password.length > 256) {
    throw new AppError(400, 'INVALID_CREDENTIALS', '用户名至少 3 个字符，密码至少 8 个字符');
  }
}

router.post('/login', async (req, res, next) => {
  try {
    validateCredentials(req.body?.username, req.body?.password);
    const user = await findUserByUsername(req.body.username.trim());
    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) throw new AppError(401, 'INVALID_LOGIN', '用户名或密码错误');
    if (user.status !== 'active' || user.tenant_status !== 'active') throw new AppError(403, 'ACCOUNT_DISABLED', '账户或企业已被禁用');
    const session = await createSession(user);
    setRefreshCookie(res, session.refreshToken);
    res.json({ success: true, message: '登录成功', data: { token: session.token, user: publicUser(user), tenant: { id: user.tenant_id, name: user.tenant_name, plan: user.tenant_plan } } });
  } catch (error) {
    next(error);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    if (!config.allowSelfRegistration) throw new AppError(403, 'REGISTRATION_DISABLED', '当前环境未开放自助注册');
    validateCredentials(req.body?.username, req.body?.password);
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const tenantName = typeof req.body?.tenantName === 'string' ? req.body.tenantName.trim() : '';
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !tenantName || tenantName.length > 160 || req.body.password !== req.body.confirmPassword) throw new AppError(400, 'INVALID_REGISTRATION', '企业名称、有效邮箱和两次一致的密码均为必填项');
    const user = await withTransaction(async (client) => {
      const tenantId = randomId();
      const userId = randomId();
      const passwordHash = await bcrypt.hash(req.body.password, 12);
      await client.query(`INSERT INTO tenants(id, name, plan, expires_at) VALUES ($1, $2, 'basic', NOW() + INTERVAL '30 days')`, [tenantId, tenantName]);
      await client.query(`INSERT INTO users(id, tenant_id, username, email, password_hash, role) VALUES ($1, $2, $3, $4, $5, 'admin')`, [userId, tenantId, req.body.username.trim(), email, passwordHash]);
      const result = await client.query<UserRow>(`SELECT u.*, t.name AS tenant_name, t.plan AS tenant_plan, t.status AS tenant_status FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = $1`, [userId]);
      return result.rows[0];
    });
    const session = await createSession(user);
    setRefreshCookie(res, session.refreshToken);
    res.status(201).json({ success: true, message: '注册成功', data: { token: session.token, user: publicUser(user), tenant: { id: user.tenant_id, name: user.tenant_name, plan: user.tenant_plan } } });
  } catch (error) {
    if (isUniqueViolation(error)) return next(new AppError(409, 'ACCOUNT_EXISTS', '用户名或邮箱已存在'));
    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await findUserById(req.auth!.userId);
    if (!user) throw new AppError(401, 'USER_NOT_FOUND', '用户不存在');
    res.json({ success: true, message: '获取用户信息成功', data: { user: publicUser(user) } });
  } catch (error) {
    next(error);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    if (!checkOrigin(req.headers.origin)) throw new AppError(403, 'ORIGIN_FORBIDDEN', '请求来源不受信任');
    const refreshToken = parseCookies(req.headers.cookie)[REFRESH_COOKIE];
    if (!refreshToken) throw new AppError(401, 'REFRESH_REQUIRED', '刷新会话不存在');
    const nextSession = await withTransaction(async (client) => {
      // Lock the user before the session so refresh, logout and password changes
      // share one ordering and cannot miss a newly rotated/revoked session.
      const candidate = await client.query<UserRow & { session_id: string; family_id: string }>(
        `SELECT u.*, t.name AS tenant_name, t.plan AS tenant_plan, t.status AS tenant_status,
                s.id AS session_id, s.family_id
           FROM auth_sessions s
           JOIN users u ON u.id = s.user_id AND u.tenant_id = s.tenant_id
           JOIN tenants t ON t.id = u.tenant_id
          WHERE s.refresh_token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()
            AND u.status = 'active' AND t.status = 'active'
          FOR UPDATE OF u`,
        [hashOpaqueToken(refreshToken)],
      );
      const locked = candidate.rows[0];
      if (!locked) throw new AppError(401, 'REFRESH_INVALID', '刷新会话无效、已过期或已使用');
      const session = await client.query<{ id: string; family_id: string }>(
        `SELECT id, family_id FROM auth_sessions
          WHERE id = $1 AND user_id = $2 AND tenant_id = $3
            AND refresh_token_hash = $4 AND revoked_at IS NULL AND expires_at > NOW()
          FOR UPDATE`,
        [locked.session_id, locked.id, locked.tenant_id, hashOpaqueToken(refreshToken)],
      );
      if (!session.rows[0]) throw new AppError(401, 'REFRESH_REPLAYED', '刷新会话已使用，请重新登录');
      const nextRefresh = randomOpaqueToken();
      await client.query(
        `UPDATE auth_sessions
            SET refresh_token_hash = $2, expires_at = NOW() + ($3 || ' days')::interval, last_used_at = NOW()
          WHERE id = $1 AND revoked_at IS NULL`,
        [locked.session_id, hashOpaqueToken(nextRefresh), String(config.refreshTokenTtlDays)],
      );
      return { token: signAccessToken(locked, locked.session_id), refreshToken: nextRefresh };
    });
    setRefreshCookie(res, nextSession.refreshToken);
    res.json({ success: true, message: 'Token 刷新成功', data: { token: nextSession.token } });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await withTransaction(async (client) => {
      const user = await client.query<{ id: string }>('SELECT id FROM users WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [req.auth!.userId, req.auth!.tenantId]);
      if (!user.rowCount) return;
      const session = await client.query<{ family_id: string }>('SELECT family_id FROM auth_sessions WHERE id = $1 AND user_id = $2 AND tenant_id = $3 FOR UPDATE', [req.auth!.sessionId, req.auth!.userId, req.auth!.tenantId]);
      if (!session.rows[0]) return;
      await client.query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()), last_used_at = NOW() WHERE user_id = $1 AND tenant_id = $2 AND family_id = $3', [req.auth!.userId, req.auth!.tenantId, session.rows[0].family_id]);
    });
    disconnectSession(req.auth!.sessionId);
    clearRefreshCookie(res);
    res.json({ success: true, message: '已退出登录', data: null });
  } catch (error) {
    next(error);
  }
});

router.put('/password', requireAuth, async (req, res, next) => {
  try {
    if (typeof req.body?.oldPassword !== 'string' || typeof req.body?.newPassword !== 'string' || req.body.newPassword.length < 8) throw new AppError(400, 'INVALID_PASSWORD', '新密码至少需要 8 个字符');
    const user = await findUserById(req.auth!.userId);
    if (!user || !(await bcrypt.compare(req.body.oldPassword, user.password_hash))) throw new AppError(400, 'PASSWORD_MISMATCH', '旧密码错误');
    const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    await withTransaction(async (client) => {
      const locked = await client.query<UserRow>(`SELECT u.*, t.name AS tenant_name, t.plan AS tenant_plan, t.status AS tenant_status FROM users u JOIN tenants t ON t.id = u.tenant_id WHERE u.id = $1 AND u.tenant_id = $2 AND u.status = 'active' AND t.status = 'active' FOR UPDATE OF u`, [user.id, req.auth!.tenantId]);
      if (!locked.rows[0] || !(await bcrypt.compare(req.body.oldPassword, locked.rows[0].password_hash))) throw new AppError(400, 'PASSWORD_MISMATCH', '旧密码错误');
      await client.query('UPDATE users SET password_hash = $1, auth_version = auth_version + 1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2 AND tenant_id = $3', [passwordHash, user.id, req.auth!.tenantId]);
      await client.query('UPDATE auth_sessions SET revoked_at = NOW(), last_used_at = NOW() WHERE user_id = $1 AND tenant_id = $2', [user.id, req.auth!.tenantId]);
    });
    disconnectUser(user.id);
    clearRefreshCookie(res);
    res.json({ success: true, message: '密码修改成功，请重新登录', data: null });
  } catch (error) {
    next(error);
  }
});

export default router;
