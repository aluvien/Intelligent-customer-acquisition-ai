import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';

// middleware/auth 用 module.exports 导出，此处保持同风格
const { getJwtSecret } = require('../middleware/auth') as { getJwtSecret: () => string };

const TICKET_TTL_SECONDS = 60;
const HEARTBEAT_MS = 30000;
const TICKET_REUSE_WINDOW_MS = 5 * 60 * 1000;

interface authedSocket extends WebSocket {
  userId?: string;
  tenantId?: string;
  alive?: boolean;
}

// 一次性 ticket 记录（单机内存版；多机部署时换成 Redis SET NX，见 README 规划）
const usedTickets = new Map<string, number>();

// 签发一次性连接凭证（有效期 60 秒）
function issueTicket(user: { userId: string; tenantId: string }): string {
  const jti = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return jwt.sign(
    { purpose: 'ws', userId: user.userId, tenantId: user.tenantId, jti },
    getJwtSecret(),
    { expiresIn: TICKET_TTL_SECONDS }
  );
}

// 消费 ticket：验签 + 用途 + 一次性，三者都过才返回身份
function consumeTicket(ticket: string): { userId: string; tenantId: string } | null {
  try {
    const decoded = jwt.verify(ticket, getJwtSecret()) as any;
    if (decoded.purpose !== 'ws' || !decoded.jti || !decoded.userId) {
      return null;
    }
    if (usedTickets.has(decoded.jti)) {
      return null;
    }
    usedTickets.set(decoded.jti, Date.now());
    return { userId: decoded.userId, tenantId: decoded.tenantId };
  } catch {
    return null;
  }
}

// 定期清理已消费 ticket 记录与僵尸连接
setInterval(() => {
  const now = Date.now();
  for (const [jti, ts] of usedTickets) {
    if (now - ts > TICKET_REUSE_WINDOW_MS) {
      usedTickets.delete(jti);
    }
  }
}, 60 * 1000).unref();

const tenants = new Map<string, Set<authedSocket>>();

function attach(server: HttpServer): void {
  const wss = new WebSocketServer({ server, path: '/ws' });

  // 心跳：30 秒一轮，失联即断
  const heartbeat = setInterval(() => {
    for (const clients of tenants.values()) {
      for (const socket of clients) {
        if (socket.alive === false) {
          socket.terminate();
          continue;
        }
        socket.alive = false;
        socket.ping();
      }
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  wss.on('connection', (socket: authedSocket, req) => {
    const ticket = new URL(req.url || '/', 'http://localhost').searchParams.get('ticket') || '';
    const identity = consumeTicket(ticket);
    if (!identity) {
      socket.close(4401, 'invalid ticket');
      return;
    }

    socket.userId = identity.userId;
    socket.tenantId = identity.tenantId;
    socket.alive = true;

    if (!tenants.has(identity.tenantId)) {
      tenants.set(identity.tenantId, new Set());
    }
    tenants.get(identity.tenantId)!.add(socket);

    socket.on('pong', () => {
      socket.alive = true;
    });

    socket.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch {
        // 非 JSON 帧直接忽略
      }
    });

    const cleanup = () => {
      tenants.get(identity.tenantId)?.delete(socket);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);

    socket.send(
      JSON.stringify({ type: 'welcome', userId: identity.userId, timestamp: Date.now() })
    );
  });
}

// 按租户广播（事件 pipeline/桌面推送统一入口）
function broadcast(tenantId: string, payload: unknown): number {
  const clients = tenants.get(tenantId);
  if (!clients || clients.size === 0) {
    return 0;
  }
  const text = JSON.stringify(payload);
  let sent = 0;
  for (const socket of clients) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(text);
      sent += 1;
    }
  }
  return sent;
}

function stats(): { tenants: number; connections: number } {
  let connections = 0;
  for (const clients of tenants.values()) {
    connections += clients.size;
  }
  return { tenants: tenants.size, connections };
}

module.exports = { attach, broadcast, stats, issueTicket };
