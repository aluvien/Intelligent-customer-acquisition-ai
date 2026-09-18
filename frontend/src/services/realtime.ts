import api from './api';

export interface RealtimeEvents {
  onEvent?: (payload: any) => void;
  onOpen?: () => void;
  onClose?: (code: number) => void;
}

// 实时连接：先用登录 JWT 换一次性 ticket，再建 WS（token 永不拼进 URL）
// Web 与未来桌面端（Electron/Tauri）走同一契约：
//   GET /api/ws/ticket -> ws(s)://host/ws?ticket=xxx
export function connectRealtime(
  events: RealtimeEvents = {},
  opts: { maxRetries?: number } = {}
): () => void {
  const maxRetries = opts.maxRetries ?? 5;
  let socket: WebSocket | null = null;
  let retries = 0;
  let closed = false;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  const cleanup = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (socket) {
      socket.onclose = null;
      socket.close();
      socket = null;
    }
  };

  const connect = async () => {
    if (closed) {
      return;
    }
    try {
      const ticket = await api
        .get<{ success: boolean; data: { ticket: string } }>('/ws/ticket')
        .then((res) => res.data.data.ticket);

      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      socket = new WebSocket(`${proto}://${window.location.host}/ws?ticket=${ticket}`);

      socket.onopen = () => {
        retries = 0;
        heartbeatTimer = setInterval(() => {
          socket?.send(JSON.stringify({ type: 'ping' }));
        }, 25000);
        events.onOpen?.();
      };

      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'pong' || msg.type === 'welcome') {
            return;
          }
          events.onEvent?.(msg);
        } catch {
          // 非 JSON 帧忽略
        }
      };

      socket.onclose = (e) => {
        cleanup();
        events.onClose?.(e.code);
        // 4401 = ticket 无效，不重试（等重新登录）；其他断线指数退避重连
        if (!closed && e.code !== 4401 && retries < maxRetries) {
          retries += 1;
          setTimeout(connect, Math.min(1000 * 2 ** retries, 15000));
        }
      };
    } catch {
      if (!closed && retries < maxRetries) {
        retries += 1;
        setTimeout(connect, Math.min(1000 * 2 ** retries, 15000));
      }
    }
  };

  connect();

  return () => {
    closed = true;
    cleanup();
  };
}
