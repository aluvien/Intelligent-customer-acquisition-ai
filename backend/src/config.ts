import crypto from 'crypto';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} 未配置`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

function positiveIntEnv(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > max) {
    throw new Error(`${name} 必须是有效的正整数`);
  }
  return value;
}

function nonNegativeIntEnv(name: string, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0 || value > max) {
    throw new Error(`${name} 必须是有效的非负整数`);
  }
  return value;
}

function sameSiteEnv(): 'lax' | 'strict' | 'none' {
  const value = optional('COOKIE_SAME_SITE', 'lax').toLowerCase();
  if (!['lax', 'strict', 'none'].includes(value)) throw new Error('COOKIE_SAME_SITE 必须是 lax、strict 或 none');
  return value as 'lax' | 'strict' | 'none';
}

export const config = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: positiveIntEnv('PORT', positiveIntEnv('API_PORT', 3001, 65535), 65535),
  databaseUrl: process.env.DATABASE_URL?.trim() || '',
  redisUrl: process.env.REDIS_URL?.trim() || '',
  jwtIssuer: optional('JWT_ISSUER', 'xinglian-yunke'),
  jwtAudience: optional('JWT_AUDIENCE', 'xinglian-yunke-web'),
  accessTokenTtl: optional('ACCESS_TOKEN_TTL', '15m'),
  refreshTokenTtlDays: positiveIntEnv('REFRESH_TOKEN_TTL_DAYS', 30, 365),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3000'),
  allowSelfRegistration: process.env.ALLOW_SELF_REGISTRATION === 'true',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  cookieSameSite: sameSiteEnv(),
  visitorSessionTtlHours: positiveIntEnv('VISITOR_SESSION_TTL_HOURS', 24, 720),
  maxBodyBytes: positiveIntEnv('MAX_BODY_BYTES', 10, 100) * 1024 * 1024,
  rateLimitWindowMs: positiveIntEnv('RATE_LIMIT_WINDOW_MS', 900_000, 86_400_000),
  rateLimitMaxRequests: positiveIntEnv('RATE_LIMIT_MAX_REQUESTS', 100, 100_000),
  publicRateLimitMaxRequests: positiveIntEnv('PUBLIC_RATE_LIMIT_MAX_REQUESTS', 400, 100_000),
  aiMaxRunsPerConversationHour: positiveIntEnv('AI_MAX_RUNS_PER_CONVERSATION_HOUR', 20, 1_000),
  trustProxyHops: nonNegativeIntEnv('TRUST_PROXY_HOPS', 0, 10),
  douyinClientKey: process.env.DOUYIN_APP_ID?.trim() || '',
  douyinClientSecret: process.env.DOUYIN_APP_SECRET?.trim() || '',
  douyinRedirectUri: process.env.DOUYIN_REDIRECT_URI?.trim() || '',
  douyinScopes: optional('DOUYIN_SCOPES', 'user_info'),
  jwtSecretEntropy: process.env.JWT_SECRET?.length || 0,
};

export function getJwtSecret(): string {
  return required('JWT_SECRET');
}

export function getEncryptionKey(): Buffer {
  const raw = required('ENCRYPTION_KEY');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('ENCRYPTION_KEY 必须是 base64 编码的 32 字节密钥');
  }
  return key;
}

export function assertProductionConfig(): void {
  if (config.nodeEnv !== 'production') return;
  const requiredNames = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'ENCRYPTION_KEY', 'CORS_ORIGIN'];
  const missing = requiredNames.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`生产启动缺少必要配置: ${missing.join(', ')}`);
  }
  if (config.jwtSecretEntropy < 32) {
    throw new Error('JWT_SECRET 长度至少需要 32 个字符');
  }
  if (config.cookieSameSite === 'none' && !config.cookieSecure) {
    throw new Error('COOKIE_SAME_SITE=none 时必须启用 COOKIE_SECURE=true');
  }
  if (!config.cookieSecure) throw new Error('生产环境必须启用 COOKIE_SECURE=true');
  if (config.corsOrigin.split(',').some((origin) => origin.trim() === '*')) throw new Error('生产环境禁止使用 CORS_ORIGIN=*');
  try {
    getEncryptionKey();
  } catch (error) {
    throw new Error(`ENCRYPTION_KEY 配置无效: ${error instanceof Error ? error.message : 'unknown error'}`);
  }
}

export function randomId(): string {
  return crypto.randomUUID();
}

export function hashOpaqueToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function randomOpaqueToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}
