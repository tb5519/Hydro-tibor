export interface VoiceCallConfig {
  enabled: boolean; uid: number; canTeach: boolean; socketUrl: string; windowUrl?: string;
}

export interface VoiceSnapshot {
  callId: string; status: 'ringing' | 'active'; teacherUid: number; teacherName: string;
  studentUid: number; studentName: string; createdAt: number | string; acceptedAt?: number | string;
  ringExpiresAt: number | string; isOwner: boolean;
}

export interface VoiceTransportOptions {
  mediaOwner: boolean;
  onMessage(message: any): void;
  onConnection?(connected: boolean): void;
  socketFactory?(url: string): WebSocket;
}

// Voice has its own identity and socket. Sharing, navigation and its editors
// never own, buffer or replay voice packets.
export class VoiceTransport {
  private socket: WebSocket | null = null;
  private stopped = false;
  private started = false;
  private connected = false;
  private reconnectTimer = 0;
  private heartbeat = 0;
  private retry = 600;
  private lastMessage = 0;
  private tabId: string;
  private deviceId: string;
  private channel: BroadcastChannel | null = null;
  private instanceId: string;
  private identityTimer = 0;
  private randomId: () => string;

  constructor(private config: VoiceCallConfig, private options: VoiceTransportOptions) {
    const random = () => Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join('');
    this.randomId = random; this.instanceId = random();
    const identity = (kind: 'sessionStorage' | 'localStorage', key: string) => {
      try {
        const value = window[kind].getItem(key);
        if (value && /^[a-zA-Z0-9_-]{8,96}$/.test(value)) return value;
        const next = random(); window[kind].setItem(key, next); return next;
      } catch { return random(); }
    };
    this.tabId = identity('sessionStorage', `onebyone.voice.tab:${config.uid}`);
    this.deviceId = identity('localStorage', `onebyone.voice.device:${config.uid}`);
  }

  get ready() { return this.connected; }

  start() {
    if (this.started || this.stopped || !this.config.enabled) return;
    this.started = true;
    window.addEventListener('online', this.reconnect);
    document.addEventListener('visibilitychange', this.visibility);
    // Duplicated tabs inherit sessionStorage. Let an already-open tab keep its
    // owner identity rather than silently moving its microphone to the copy.
    if (window.BroadcastChannel) {
      this.channel = new BroadcastChannel(`onebyone.voice.tabs:${this.config.uid}`);
      this.channel.onmessage = ({ data }) => {
        if (data?.tabId !== this.tabId || data.instanceId === this.instanceId) return;
        if (data.type === 'claim') this.channel?.postMessage({ type: 'occupied', tabId: this.tabId,
          instanceId: this.instanceId, target: data.instanceId });
        if (data.type === 'occupied' && data.target === this.instanceId) {
          this.tabId = this.randomId();
          try { window.sessionStorage.setItem(`onebyone.voice.tab:${this.config.uid}`, this.tabId); } catch { /* In-memory identity remains safe. */ }
          this.socket?.close();
        }
      };
      this.channel.postMessage({ type: 'claim', tabId: this.tabId, instanceId: this.instanceId });
      this.identityTimer = window.setTimeout(() => this.connect(), 80);
    } else this.connect();
  }

  private visibility = () => { this.send({ type: 'pulse', visible: !document.hidden }); };
  private reconnect = () => {
    if (this.stopped || this.socket) return;
    window.clearTimeout(this.reconnectTimer); this.connect();
  };

  private connect() {
    if (this.stopped || this.socket) return;
    const url = new URL(this.config.socketUrl, window.location.href);
    if (url.origin !== window.location.origin) {
      this.options.onMessage({ type: 'error', message: '语音地址不正确，请刷新页面后重试。' }); return;
    }
    url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = this.options.socketFactory ? this.options.socketFactory(url.href) : new WebSocket(url.href);
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.stopped || this.socket !== socket) return;
      this.lastMessage = Date.now();
      socket.send(JSON.stringify({ type: 'hello', tabId: this.tabId, deviceId: this.deviceId,
        visible: !document.hidden, mediaOwner: this.options.mediaOwner }));
      this.heartbeat = window.setInterval(() => {
        if (Date.now() - this.lastMessage > 35000) { socket.close(); return; }
        if (socket.readyState === WebSocket.OPEN) { socket.send('ping'); this.visibility(); }
      }, 10000);
    });
    socket.addEventListener('message', (event) => {
      if (this.stopped || this.socket !== socket || typeof event.data !== 'string') return;
      this.lastMessage = Date.now();
      if (event.data === 'pong') return;
      if (event.data === 'ping') { socket.send('pong'); return; }
      if (event.data.length > 512000) return;
      let message: any;
      try { message = JSON.parse(event.data); } catch { return; }
      if (message?.type === 'ready') {
        this.connected = true; this.retry = 600; this.options.onConnection?.(true);
      }
      this.options.onMessage(message);
    });
    socket.addEventListener('close', (event) => {
      if (this.stopped || this.socket !== socket) return;
      this.socket = null; this.connected = false; window.clearInterval(this.heartbeat);
      this.options.onConnection?.(false);
      if (event.code === 4002 || event.code === 4003) {
        this.dispose();
        this.options.onMessage({ type: 'terminated', closeCode: event.code, reason: event.code === 4002
          ? '语音已在另一个页面接续。' : '登录或课堂权限已失效，语音已结束。' });
        return;
      }
      this.reconnectTimer = window.setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(5000, this.retry * 1.7);
    });
    socket.addEventListener('error', () => { /* close owns reconnect and status. */ });
  }

  send(payload: any) {
    const socket = this.socket;
    if (!this.connected || this.stopped || socket?.readyState !== WebSocket.OPEN) return false;
    // A late audio packet is worse than a lost one. Never queue speech through
    // reconnects or behind a congested TCP connection.
    if (payload?.type === 'audio' && socket.bufferedAmount > 16000) return false;
    if (socket.bufferedAmount > 256000) { socket.close(); return false; }
    socket.send(JSON.stringify(payload)); return true;
  }

  dispose() {
    if (this.stopped) return;
    this.stopped = true; this.connected = false;
    window.clearTimeout(this.reconnectTimer); window.clearInterval(this.heartbeat);
    window.clearTimeout(this.identityTimer); this.channel?.close(); this.channel = null;
    window.removeEventListener('online', this.reconnect);
    document.removeEventListener('visibilitychange', this.visibility);
    this.socket?.close(); this.socket = null;
  }
}
