import Redis from 'ioredis';
import jwt from 'jsonwebtoken';
import { config, getJwtSecret, hashOpaqueToken, randomId } from '../config';
import { query } from '../db';

export interface RealtimeIdentity {
  userId: string;
  tenantId: string;
  sessionId: string;
}

let redis: Redis | null = null;
let realtimeSubscriber: Redis | null = null;
const localTickets = new Map<string, { identity: RealtimeIdentity; expiresAt: number }>();
const REALTIME_CHANNEL = 'xinglian:realtime:broadcast';

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

export async function isRealtimeIdentityActive(identity: RealtimeIdentity): Promise<boolean> {
  try {
    const result = await query(
      `SELECT 1
         FROM users u
         JOIN tenants t ON t.id = u.tenant_id
         JOIN auth_sessions s ON s.user_id = u.id AND s.tenant_id = u.tenant_id AND s.id = $3
        WHERE u.id = $1 AND u.tenant_id = $2
          AND u.status = 'active' AND t.status = 'active'
          AND s.revoked_at IS NULL AND s.expires_at > NOW()
        LIMIT 1`,
      [identity.userId, identity.tenantId, identity.sessionId],
    );
    return Boolean(result.rowCount);
  } catch {
    // A revoked session must never remain connected because the database is unavailable.
    return false;
  }
}

export async function closeRealtimeRedis(): Promise<void> {
  localTickets.clear();
  if (realtimeSubscriber) {
    const subscriber = realtimeSubscriber;
    realtimeSubscriber = null;
    await subscriber.quit().catch(() => subscriber.disconnect());
  }
  if (!redis) return;
  const client = redis;
  redis = null;
  await client.quit().catch(() => client.disconnect());
}

export type RealtimeEnvelope = { origin: string; tenantId: string; payload: unknown };

export async function startRealtimeSubscriber(onMessage: (envelope: RealtimeEnvelope) => void): Promise<void> {
  const client = getRedis();
  if (!client || realtimeSubscriber) return;
  try {
    await client.connect().catch(() => undefined);
    if (client.status !== 'ready') return;
    const subscriber = client.duplicate();
    subscriber.on('error', (error) => console.error('Redis 实时订阅错误:', error.message));
    await subscriber.connect();
    await subscriber.subscribe(REALTIME_CHANNEL);
    subscriber.on('message', (_channel, raw) => {
      try {
        const envelope = JSON.parse(raw) as RealtimeEnvelope;
        if (envelope && typeof envelope.origin === 'string' && typeof envelope.tenantId === 'string') onMessage(envelope);
      } catch {
        // Ignore malformed cross-instance notifications.
      }
    });
    realtimeSubscriber = subscriber;
  } catch (error) {
    console.error('Redis 实时订阅初始化失败:', error instanceof Error ? error.message : error);
  }
}

export async function publishRealtime(envelope: RealtimeEnvelope): Promise<void> {
  const client = getRedis();
  if (!client) return;
  try {
    await client.connect().catch(() => undefined);
    if (client.status === 'ready') await client.publish(REALTIME_CHANNEL, JSON.stringify(envelope));
  } catch (error) {
    console.error('Redis 实时广播失败:', error instanceof Error ? error.message : error);
  }
}
