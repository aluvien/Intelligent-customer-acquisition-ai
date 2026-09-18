import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config, getJwtSecret, hashOpaqueToken, randomId, randomOpaqueToken } from '../config';
import { query, withTransaction } from '../db';
import { AppError } from '../errors';
import { requireAuth } from '../middleware/auth';
import { checkOrigin, clearRefreshCookie, parseCookies, REFRESH_COOKIE, setRefreshCookie } from '../security/cookies';
import { isUniqueViolation } from './helpers';

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
    { userId: user.id, tenantId: user.tenant_id, role: user.role, sessionId, tokenType: 'access' },
    getJwtSecret(),
    { expiresIn: config.accessTokenTtl as jwt.SignOptions['expiresIn'], issuer: config.jwtIssuer, audience: config.jwtAudience, algorithm: 'HS256' },
  );
}

async function createSession(user: UserRow): Promise<{ token: string; refreshToken: string }> {
  const sessionId = randomId();
  const refreshToken = randomOpaqueToken();
  await query(
    `INSERT INTO auth_sessions(id, user_id, tenant_id, refresh_token_hash, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval)`,
    [sessionId, user.id, user.tenant_id, hashOpaqueToken(refreshToken), String(config.refreshTokenTtlDays)],
  );
  return { token: signAccessToken(user, sessionId), refreshToken };
}

function validateCredentials(username: unknown, password: unknown): asserts username is string {
  if (typeof username !== 'string' || username.trim().length < 3 || typeof password !== 'string' || password.length < 8) {
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
    if (!email || !tenantName || req.body.password !== req.body.confirmPassword) throw new AppError(400, 'INVALID_REGISTRATION', '企业名称、邮箱和两次一致的密码均为必填项');
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
    const current = await query<{ id: string; user_id: string }>(`SELECT id, user_id FROM auth_sessions WHERE refresh_token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`, [hashOpaqueToken(refreshToken)]);
    const session = current.rows[0];
    if (!session) throw new AppError(401, 'REFRESH_INVALID', '刷新会话无效或已过期');
    const user = await findUserById(session.user_id);
    if (!user || user.status !== 'active' || user.tenant_status !== 'active') throw new AppError(401, 'ACCOUNT_DISABLED', '账户不可用');
    const nextSession = await withTransaction(async (client) => {
      await client.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE id = $1', [session.id]);
      const nextId = randomId();
      const nextRefresh = randomOpaqueToken();
      await client.query(`INSERT INTO auth_sessions(id, user_id, tenant_id, refresh_token_hash, expires_at) VALUES ($1, $2, $3, $4, NOW() + ($5 || ' days')::interval)`, [nextId, user.id, user.tenant_id, hashOpaqueToken(nextRefresh), String(config.refreshTokenTtlDays)]);
      return { token: signAccessToken(user, nextId), refreshToken: nextRefresh };
    });
    setRefreshCookie(res, nextSession.refreshToken);
    res.json({ success: true, message: 'Token 刷新成功', data: { token: nextSession.token } });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await query('UPDATE auth_sessions SET revoked_at = COALESCE(revoked_at, NOW()) WHERE id = $1', [req.auth!.sessionId]);
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
      await client.query('UPDATE users SET password_hash = $1, password_changed_at = NOW(), updated_at = NOW() WHERE id = $2', [passwordHash, user.id]);
      await client.query('UPDATE auth_sessions SET revoked_at = NOW() WHERE user_id = $1', [user.id]);
    });
    clearRefreshCookie(res);
    res.json({ success: true, message: '密码修改成功，请重新登录', data: null });
  } catch (error) {
    next(error);
  }
});

export default router;
