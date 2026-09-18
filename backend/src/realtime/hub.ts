import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { checkOrigin } from '../security/cookies';
import { consumeRealtimeTicket } from './tickets';

const HEARTBEAT_MS = 30_000;

interface AuthedSocket extends WebSocket {
  userId?: string;
  tenantId?: string;
  alive?: boolean;
}

const tenants = new Map<string, Set<AuthedSocket>>();
let attached = false;

export function attach(server: HttpServer): void {
  if (attached) return;
  attached = true;
  const wss = new WebSocketServer({ server, path: '/ws' });
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

  wss.on('connection', async (socket: AuthedSocket, req) => {
    if (!checkOrigin(req.headers.origin)) {
      socket.close(4403, 'origin not allowed');
      return;
    }
    const ticket = new URL(req.url || '/', 'http://localhost').searchParams.get('ticket') || '';
    const identity = await consumeRealtimeTicket(ticket);
    if (!identity) {
      socket.close(4401, 'invalid ticket');
      return;
    }
    socket.userId = identity.userId;
    socket.tenantId = identity.tenantId;
    socket.alive = true;
    if (!tenants.has(identity.tenantId)) tenants.set(identity.tenantId, new Set());
    tenants.get(identity.tenantId)!.add(socket);
    socket.on('pong', () => { socket.alive = true; });
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as { type?: string };
        if (message.type === 'ping' && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      } catch {
        socket.close(4400, 'invalid frame');
      }
    });
    const cleanup = () => {
      const clients = tenants.get(identity.tenantId);
      clients?.delete(socket);
      if (clients && clients.size === 0) tenants.delete(identity.tenantId);
    };
    socket.on('close', cleanup);
    socket.on('error', cleanup);
    socket.send(JSON.stringify({ type: 'welcome', userId: identity.userId, timestamp: Date.now() }));
  });
}

export function broadcast(tenantId: string, payload: unknown): number {
  const clients = tenants.get(tenantId);
  if (!clients) return 0;
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

export function stats(): { tenants: number; connections: number } {
  let connections = 0;
  for (const clients of tenants.values()) connections += clients.size;
  return { tenants: tenants.size, connections };
}

module.exports = { attach, broadcast, stats };
