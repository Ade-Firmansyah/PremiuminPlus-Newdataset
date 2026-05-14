type SocketPayload = Record<string, unknown> & { type?: string };
type SocketListener = (payload: SocketPayload) => void;

class ManagedSocket {
  private socket: WebSocket | null = null;
  private reconnectTimer = 0;
  private heartbeatTimer = 0;
  private reconnectAttempts = 0;
  private manuallyClosed = false;
  private readonly listeners = new Set<SocketListener>();

  constructor(private readonly url: string) {}

  subscribe(listener: SocketListener) {
    this.listeners.add(listener);
    this.connect();

    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.close();
    };
  }

  get size() {
    return this.listeners.size;
  }

  private connect() {
    if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) return;
    this.manuallyClosed = false;
    window.clearTimeout(this.reconnectTimer);

    try {
      this.socket = new WebSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.emit({ type: 'socket_open' });
    });

    this.socket.addEventListener('message', (event) => {
      try {
        this.emit(JSON.parse(String(event.data)) as SocketPayload);
      } catch {
        this.emit({ type: 'socket_message', raw: String(event.data) });
      }
    });

    this.socket.addEventListener('close', () => {
      this.stopHeartbeat();
      this.emit({ type: 'socket_close' });
      if (!this.manuallyClosed && this.listeners.size) this.scheduleReconnect();
    });

    this.socket.addEventListener('error', () => {
      this.emit({ type: 'socket_error' });
    });
  }

  private scheduleReconnect() {
    window.clearTimeout(this.reconnectTimer);
    const delay = Math.min(1200 * 2 ** this.reconnectAttempts, 15000);
    this.reconnectAttempts += 1;
    this.reconnectTimer = window.setTimeout(() => this.connect(), delay);
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatTimer = window.setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping', ts: Date.now() }));
      }
    }, 30000);
  }

  private stopHeartbeat() {
    window.clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = 0;
  }

  private emit(payload: SocketPayload) {
    for (const listener of this.listeners) listener(payload);
  }

  private close() {
    this.manuallyClosed = true;
    window.clearTimeout(this.reconnectTimer);
    this.stopHeartbeat();
    this.socket?.close();
    this.socket = null;
  }
}

const sockets = new Map<string, ManagedSocket>();

export function subscribeSocket(url: string, listener: SocketListener) {
  let socket = sockets.get(url);
  if (!socket) {
    socket = new ManagedSocket(url);
    sockets.set(url, socket);
  }

  const unsubscribe = socket.subscribe(listener);
  return () => {
    unsubscribe();
    if (socket.size === 0) sockets.delete(url);
  };
}
