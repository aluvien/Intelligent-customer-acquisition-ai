import express from 'express';
import jwt from 'jsonwebtoken';

// 获取 JWT 密钥：生产环境缺失直接拒绝启动，开发环境警告
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ FATAL: JWT_SECRET 未设置，拒绝启动');
      process.exit(1);
    }
    console.warn('⚠️  JWT_SECRET 未设置，开发环境使用默认密钥，切勿用于生产');
    return 'xinglian-yunke-secret-key';
  }
  return secret;
}

// 登录鉴权中间件：校验 Bearer JWT，并做租户隔离
function requireAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: '未提供认证令牌',
    });
  }

  try {
    const decoded = jwt.verify(authHeader.substring(7), getJwtSecret()) as any;
    (req as any).user = decoded;

    // 租户隔离：客户端若传 X-Tenant-ID，必须与 token 内 tenantId 一致
    const tenantHeader = req.headers['x-tenant-id'];
    if (tenantHeader && tenantHeader !== decoded.tenantId) {
      return res.status(403).json({
        success: false,
        message: '租户无权访问',
      });
    }

    return next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: '认证令牌无效',
    });
  }
}

module.exports = { requireAuth, getJwtSecret };
