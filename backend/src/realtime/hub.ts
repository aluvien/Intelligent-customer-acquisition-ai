import { Server as HttpServer } from 'http';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { checkOrigin } from '../security/cookies';
import { closeRealtimeRedis, consumeRealtimeTicket, isRealtimeIdentityActive, publishRealtime, startRealtimeSubscriber } from './tickets';

const HEARTBEAT_MS = 30_000;

interface AuthedSocket extends WebSocket {
  userId?: string;
  tenantId?: string;
  sessionId?: string;
  alive?: boolean;
}

const tenants = new Map<string, Set<AuthedSocket>>();
const INSTANCE_ID = `${process.pid}-${crypto.randomUUID()}`;
let attached = false;
let wss: WebSocketServer | undefined;
let heartbeat: NodeJS.Timeout | undefined;
let heartbeatRunning = false;

function removeSocket(socket: AuthedSocket): void {
  if (!socket.tenantId) return;
  const clients = tenants.get(socket.tenantId);
  clients?.delete(socket);
  if (clients && clients.size === 0) tenants.delete(socket.tenantId);
}

async function sweepSockets(): Promise<void> {
  if (heartbeatRunning) return;
  heartbeatRunning = true;
  try {
    const sockets = [...tenants.values()].flatMap((clients) => [...clients]);
    for (const socket of sockets) {
      if (socket.readyState !== WebSocket.OPEN) {
        removeSocket(socket);
        continue;
      }
      if (socket.alive === false) {
        socket.terminate();
        removeSocket(socket);
        continue;
      }
      if (!socket.userId || !socket.tenantId || !socket.sessionId || !(await isRealtimeIdentityActive({ userId: socket.userId, tenantId: socket.tenantId, sessionId: socket.sessionId }))) {
        socket.close(4401, 'session revoked');
        removeSocket(socket);
        continue;
      }
      socket.alive = false;
      socket.ping();
    }
  } finally {
    heartbeatRunning = false;
  }
}

export function attach(server: HttpServer): void {
  if (attached) return;
  attached = true;
  wss = new WebSocketServer({ server, path: '/ws' });
  heartbeat = setInterval(() => { void sweepSockets(); }, HEARTBEAT_MS);
  heartbeat.unref();
  void startRealtimeSubscriber((envelope) => {
    if (envelope.origin !== INSTANCE_ID) localBroadcast(envelope.tenantId, envelope.payload);
  });

  wss.on('connection', async (socket: AuthedSocket, req) => {
    if (!checkOrigin(req.headers.origin)) {
      socket.close(4403, 'origin not allowed');
      return;
    }
    const ticket = new URL(req.url || '/', 'http://localhost').searchParams.get('ticket') || '';
    const identity = await consumeRealtimeTicket(ticket);
    if (!identity || !(await isRealtimeIdentityActive(identity))) {
      socket.close(4401, 'invalid ticket');
      return;
    }
    socket.userId = identity.userId;
    socket.tenantId = identity.tenantId;
    socket.sessionId = identity.sessionId;
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
    const cleanup = () => removeSocket(socket);
    socket.on('close', cleanup);
    socket.on('error', cleanup);
    socket.send(JSON.stringify({ type: 'welcome', userId: identity.userId, timestamp: Date.now() }));
  });
}

function disconnectWhere(predicate: (socket: AuthedSocket) => boolean): void {
  for (const clients of tenants.values()) {
    for (const socket of [...clients]) {
      if (!predicate(socket)) continue;
      socket.close(4401, 'session revoked');
      removeSocket(socket);
    }
  }
}

export function disconnectSession(sessionId: string): void {
  disconnectWhere((socket) => socket.sessionId === sessionId);
}

export function disconnectUser(userId: string): void {
  disconnectWhere((socket) => socket.userId === userId);
}

export async function closeHub(): Promise<void> {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = undefined;
  for (const clients of tenants.values()) {
    for (const socket of clients) socket.terminate();
  }
  tenants.clear();
  if (wss) {
    const current = wss;
    wss = undefined;
    await new Promise<void>((resolve) => current.close(() => resolve()));
  }
  await closeRealtimeRedis();
  attached = false;
}

function localBroadcast(tenantId: string, payload: unknown): number {
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

export function broadcast(tenantId: string, payload: unknown): number {
  const sent = localBroadcast(tenantId, payload);
  void publishRealtime({ origin: INSTANCE_ID, tenantId, payload });
  return sent;
}

export function stats(): { tenants: number; connections: number } {
  let connections = 0;
  for (const clients of tenants.values()) connections += clients.size;
  return { tenants: tenants.size, connections };
}

export function tenantConnectionCount(tenantId: string): number {
  return tenants.get(tenantId)?.size || 0;
}

module.exports = { attach, broadcast, stats, tenantConnectionCount, disconnectSession, disconnectUser, closeHub };
