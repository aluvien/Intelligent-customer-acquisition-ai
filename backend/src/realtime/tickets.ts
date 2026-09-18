import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { config, getJwtSecret, hashOpaqueToken, randomId } from '../config';

export interface RealtimeIdentity {
  userId: string;
  tenantId: string;
  sessionId: string;
}

let redis: Redis | null = null;
const localTickets = new Map<string, { identity: RealtimeIdentity; expiresAt: number }>();

function getRedis(): Redis | null {
  if (!config.redisUrl) return null;
  if (!redis) {
    redis = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
    redis.on('error', (error) => console.error('Redis 连接错误:', error.message));
  }
  return redis;
}

export async function checkRedis(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    if (client.status !== 'ready') await client.connect();
    return client.status === 'ready' && (await client.ping()) === 'PONG';
  } catch {
    return false;
  }
}

export async function issueRealtimeTicket(identity: RealtimeIdentity): Promise<string> {
  const jti = randomId();
  const ticket = jwt.sign({ purpose: 'ws', ...identity, jti }, getJwtSecret(), {
    expiresIn: 60,
    issuer: config.jwtIssuer,
    audience: config.jwtAudience,
    algorithm: 'HS256',
  });
  const client = getRedis();
  if (client) {
    await client.connect().catch(() => undefined);
    if (client.status !== 'ready') throw new Error('Redis 不可用，无法创建实时连接凭证');
    await client.set(`ws:ticket:${hashOpaqueToken(jti)}`, JSON.stringify(identity), 'EX', 60, 'NX');
  } else {
    if (config.nodeEnv === 'production') throw new Error('生产环境必须配置 REDIS_URL');
    localTickets.set(jti, { identity, expiresAt: Date.now() + 60_000 });
  }
  return ticket;
}

export async function consumeRealtimeTicket(ticket: string): Promise<RealtimeIdentity | null> {
  try {
    const decoded = jwt.verify(ticket, getJwtSecret(), {
      issuer: config.jwtIssuer,
      audience: config.jwtAudience,
      algorithms: ['HS256'],
    }) as jwt.JwtPayload & RealtimeIdentity & { purpose?: string; jti?: string };
    if (decoded.purpose !== 'ws' || !decoded.jti || !decoded.userId || !decoded.tenantId || !decoded.sessionId) return null;
    const client = getRedis();
    if (client) {
      await client.connect().catch(() => undefined);
      if (client.status !== 'ready') return null;
      const key = `ws:ticket:${hashOpaqueToken(decoded.jti)}`;
      const value = await client.getdel(key);
      return value ? JSON.parse(value) as RealtimeIdentity : null;
    }
    if (config.nodeEnv === 'production') return null;
    const entry = localTickets.get(decoded.jti);
    localTickets.delete(decoded.jti);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.identity;
  } catch {
    return null;
  }
}
