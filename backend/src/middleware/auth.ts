import express from 'express';
import jwt from 'jsonwebtoken';
import { config, getJwtSecret } from '../config';
import { query } from '../db';
import { AppError } from '../errors';

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: 'admin' | 'operator' | 'viewer';
  sessionId: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export async function resolveAccessToken(token: string): Promise<AuthContext | null> {
  try {
    const decoded = jwt.verify(token, getJwtSecret(), {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithms: ['HS256'],
    }) as jwt.JwtPayload & Partial<AuthContext> & { tokenType?: string; authVersion?: unknown };
    if (decoded.tokenType !== 'access' || !decoded.userId || !decoded.tenantId || !decoded.sessionId) return null;

    const result = await query<{
      user_id: string;
      tenant_id: string;
      role: 'admin' | 'operator' | 'viewer';
      status: 'active' | 'inactive';
      tenant_status: 'active' | 'suspended' | 'expired';
      auth_version: number;
      session_revoked_at: Date | null;
      session_expires_at: Date;
    }>(
      `SELECT u.id AS user_id, u.tenant_id, u.role, u.status, u.auth_version, t.status AS tenant_status,
              s.revoked_at AS session_revoked_at, s.expires_at AS session_expires_at
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         JOIN auth_sessions s ON s.user_id = u.id AND s.id = $2
        WHERE u.id = $1 AND u.tenant_id = $3`,
      [decoded.userId, decoded.sessionId, decoded.tenantId],
    );
    const row = result.rows[0];
    if (!row || typeof decoded.authVersion !== 'number' || decoded.authVersion !== Number(row.auth_version) || row.status !== 'active' || row.tenant_status !== 'active' || row.session_revoked_at || new Date(row.session_expires_at) <= new Date()) return null;
    return { userId: row.user_id, tenantId: row.tenant_id, role: row.role, sessionId: decoded.sessionId };
  } catch (error) {
    if (error instanceof AppError && error.code.startsWith('DATABASE_')) throw error;
    return null;
  }
}

export async function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: '未提供认证令牌', code: 'AUTH_REQUIRED' });
    return;
  }
  let auth: AuthContext | null;
  try {
    auth = await resolveAccessToken(authHeader.slice(7));
  } catch (error) {
    next(error);
    return;
  }
  if (!auth) {
    res.status(401).json({ success: false, message: '认证令牌无效或已撤销', code: 'AUTH_INVALID' });
    return;
  }
  const tenantHeader = req.headers['x-tenant-id'];
  if (tenantHeader && tenantHeader !== auth.tenantId) {
    res.status(403).json({ success: false, message: '租户无权访问', code: 'TENANT_FORBIDDEN' });
    return;
  }
  req.auth = auth;
  next();
}

export function requireRole(...roles: AuthContext['role'][]): express.RequestHandler {
  return (req, res, next) => {
    if (!req.auth || !roles.includes(req.auth.role)) {
      res.status(403).json({ success: false, message: '权限不足', code: 'ROLE_FORBIDDEN' });
      return;
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, resolveAccessToken };
