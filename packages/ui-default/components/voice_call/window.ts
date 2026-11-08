import { microphoneError, VoiceAudio } from './audio';
import { VoiceCallConfig, VoiceSnapshot, VoiceTransport } from './transport';

type Intent = { type: 'dial'; studentUid: number; name?: string; requestId: string } | { type: 'accept'; callId: string };
export interface VoiceCallWindowOptions {
  transport: Pick<VoiceTransport, 'ready' | 'send'>;
  onEnded?(): void;
  onState?(snapshot: VoiceSnapshot | null): void;
  audioFactory?: (options: ConstructorParameters<typeof VoiceAudio>[0]) => VoiceAudio;
}

// The floating call belongs to the persistent host rather than any individual
// application page. Real reload recovery still verifies the same tab's owner.
export function mountVoiceCallWindow(root: HTMLElement, config: VoiceCallConfig, options: VoiceCallWindowOptions) {
  root.classList.add('voice-call-window');
  root.setAttribute('data-live-share-private', '');
  root.setAttribute('role', 'complementary'); root.setAttribute('aria-label', '课堂语音通话');
  root.hidden = true;
  const node = (tag: string, cls: string, text = '') => {
    const element = document.createElement(tag); element.className = cls; element.textContent = text; return element;
  };
  const body = node('div', 'voice-call-window__body');
  const avatar = node('span', 'voice-call-window__avatar', '语'); avatar.setAttribute('aria-hidden', 'true');
  const details = node('div', 'voice-call-window__details');
  const eyebrow = node('span', 'voice-call-window__eyebrow', '课堂语音');
  const name = node('strong', 'voice-call-window__name', '语音通话');
  const status = node('span', 'voice-call-window__status', '正在准备…'); status.setAttribute('role', 'status');
  const timer = node('span', 'voice-call-window__timer', '00:00'); timer.hidden = true;
  const meter = node('span', 'voice-call-window__meter'); meter.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 5; i++) meter.append(node('i', ''));
  details.append(eyebrow, name, status, timer); body.append(avatar, details, meter);
  const error = node('p', 'voice-call-window__error'); error.hidden = true; error.setAttribute('role', 'alert');
  const actions = node('div', 'voice-call-window__actions');
  const makeButton = (text: string, cls: string, path: string) => {
    const button = node('button', `voice-call-window__button ${cls}`) as HTMLButtonElement;
    button.type = 'button'; button.setAttribute('aria-label', text); button.title = text;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    const line = document.createElementNS(svg.namespaceURI, 'path'); line.setAttribute('d', path); svg.append(line);
    button.append(svg, node('span', '', text)); return button;
  };
  const mute = makeButton('静音', '', 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5M5 10v1a7 7 0 0 0 14 0v-1M12 18v4M8 22h8');
  mute.setAttribute('aria-pressed', 'false'); mute.disabled = true;
  const hangup = makeButton('挂断', 'is-danger', 'M3 15c5-7 13-7 18 0l-3 3-4-3v-3M10 12v3l-4 3-3-3');
  const retry = node('button', 'voice-call-window__retry', '重试麦克风') as HTMLButtonElement;
  retry.type = 'button'; retry.hidden = true;
  actions.append(mute, hangup); root.replaceChildren(body, error, retry, actions);

  let current: VoiceSnapshot | null = null;
  let intent: Intent | null = null;
  let awaitingRequest: Intent | null = null;
  let cancelAwaitingRequest = false;
  let busy = false;
  let generation = 0;
  let disposed = false;
  let connected = options.transport.ready;
  let muted = false;
  let sequence = Date.now() * 100;
  let remoteStream = '';
  let hideTimer = 0;
  const cancelledKey = `onebyone.voice.cancelled:${config.uid}`;
  const mutedKey = `onebyone.voice.muted:${config.uid}`;
  let cancelled: string[] = [];
  const closedCalls = new Set<string>();
  try { const saved = JSON.parse(sessionStorage.getItem(cancelledKey) || '[]'); if (Array.isArray(saved)) cancelled = saved.slice(-8); } catch { /* Storage is optional. */ }
  const saveCancelled = () => { try { sessionStorage.setItem(cancelledKey, JSON.stringify(cancelled.slice(-8))); } catch { /* Keep pending cancellation in memory. */ } };
  const setError = (text: string) => { error.textContent = text; error.hidden = !text; };
  const audio = options.audioFactory ? options.audioFactory({ onFrame, onLevel, onError }) : new VoiceAudio({ onFrame, onLevel, onError });
  function onFrame(data: string) {
    if (disposed || !connected || !current?.isOwner || current.status !== 'active') return;
    options.transport.send({ type: 'audio', callId: current.callId, seq: sequence++, data });
  }
  function onLevel(level: number) { meter.style.setProperty('--voice-level', String(level)); }
  function onError(cause: Error) {
    audio.stop(); mute.disabled = true; setError(microphoneError(cause)); retry.hidden = false;
    status.textContent = '麦克风已暂停';
  }
  function show() { window.clearTimeout(hideTimer); root.hidden = false; }
  function render() {
    const active = current?.status === 'active';
    if (current) {
      name.textContent = config.uid === current.teacherUid ? current.studentName : current.teacherName;
      avatar.textContent = Array.from(name.textContent || '语')[0];
    }
    status.textContent = !connected ? '连接中断，正在重新连接…'
      : busy ? '正在开启麦克风…' : active ? (muted ? '麦克风已静音' : '正在通话') : '等待对方接听…';
    timer.hidden = !active;
    mute.disabled = !audio.ready || !active;
    mute.classList.toggle('is-muted', muted); mute.setAttribute('aria-pressed', String(muted));
    const label = muted ? '取消静音' : '静音';
    mute.setAttribute('aria-label', label); mute.title = label; mute.querySelector('span')!.textContent = label;
    root.classList.toggle('is-active', !!active); root.classList.toggle('is-connecting', !connected);
    audio.setTransmitting(!!active && connected && !!current?.isOwner);
  }
  function finish(message = '通话已结束', immediately = false) {
    generation++; intent = null; busy = false; current = null; audio.stop(); retry.hidden = true; mute.disabled = true;
    if (!cancelAwaitingRequest) awaitingRequest = null;
    options.onState?.(null); timer.hidden = true; status.textContent = message; root.classList.remove('is-active');
    const hide = () => { root.hidden = true; options.onEnded?.(); };
    window.clearTimeout(hideTimer);
    if (immediately) hide(); else hideTimer = window.setTimeout(hide, 2200);
  }
  function hangUp() {
    if (current) {
      cancelled.push(current.callId); saveCancelled();
      options.transport.send({ type: 'hangup', callId: current.callId });
    } else if (awaitingRequest) {
      cancelAwaitingRequest = true;
      if (awaitingRequest.type === 'accept') {
        cancelled.push(awaitingRequest.callId); saveCancelled();
        options.transport.send({ type: 'hangup', callId: awaitingRequest.callId });
      }
    } else if (intent?.type === 'accept') {
      // The student can cancel even while the browser is asking for microphone
      // permission: no accept has been sent yet, but this is still a real call.
      cancelled.push(intent.callId); saveCancelled();
      options.transport.send({ type: 'hangup', callId: intent.callId });
    }
    finish('通话已结束', true);
  }
  async function prepare(next?: Intent) {
    if (disposed || busy) return;
    if (next) intent = next;
    if (!intent && !current?.isOwner) return;
    show(); setError(''); retry.hidden = true;
    if (!connected) { setError('正在连接语音服务，请稍后重试。'); retry.hidden = false; return; }
    busy = true;
    const attempt = ++generation;
    if (intent?.type === 'dial') { name.textContent = intent.name || '学员'; avatar.textContent = Array.from(name.textContent)[0]; }
    render();
    try {
      await audio.start();
      if (disposed || attempt !== generation || !audio.ready) return;
      if (!connected) { audio.stop(); throw new Error('语音连接暂时中断，请稍后重试。'); }
      if (intent) {
        const request = intent;
        if (!options.transport.send(request.type === 'dial' ? { type: 'dial', studentUid: request.studentUid, requestId: request.requestId }
          : { type: 'accept', callId: request.callId })) throw new Error('语音连接暂时中断，请稍后重试。');
        awaitingRequest = request; cancelAwaitingRequest = false;
        intent = null;
      }
      audio.setMuted(muted); busy = false; render();
    } catch (cause) {
      if (disposed || attempt !== generation) return;
      busy = false; audio.stop(); setError(microphoneError(cause)); retry.hidden = false;
      status.textContent = '麦克风未开启';
    }
  }
  mute.addEventListener('click', () => {
    muted = !muted; audio.setMuted(muted);
    try { sessionStorage.setItem(mutedKey, muted ? '1' : '0'); } catch { /* Current page still remembers mute. */ }
    render();
  });
  hangup.addEventListener('click', hangUp);
  retry.addEventListener('click', () => { void prepare(); });
  const clock = window.setInterval(() => {
    if (!current?.acceptedAt) return;
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(current.acceptedAt).getTime()) / 1000));
    timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  }, 1000);

  return {
    hangup: hangUp,
    dial(studentUid: number, studentName?: string) {
      if (current || busy || awaitingRequest || !Number.isSafeInteger(studentUid) || studentUid <= 0) return;
      muted = false;
      try { sessionStorage.removeItem(mutedKey); } catch { /* Default remains unmuted. */ }
      const requestId = Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
      void prepare({ type: 'dial', studentUid, name: studentName, requestId });
    },
    accept(callId: string) {
      if (!current && !busy && !awaitingRequest) {
        muted = false;
        try { sessionStorage.removeItem(mutedKey); } catch { /* Default remains unmuted. */ }
        void prepare({ type: 'accept', callId });
      }
    },
    receive(message: any) {
      if (disposed) return;
      if (message?.type === 'snapshot' && message.callId) {
        if (closedCalls.has(message.callId)) return false;
        if (cancelled.includes(message.callId)) { options.transport.send({ type: 'hangup', callId: message.callId }); return false; }
        if (message.isOwner && awaitingRequest?.type === 'dial' && message.requestId !== awaitingRequest.requestId) return false;
        if (message.isOwner && cancelAwaitingRequest && awaitingRequest
          && (awaitingRequest.type === 'accept' ? awaitingRequest.callId === message.callId : awaitingRequest.requestId === message.requestId)) {
          cancelled.push(message.callId); saveCancelled();
          options.transport.send({ type: 'hangup', callId: message.callId });
          awaitingRequest = null; cancelAwaitingRequest = false; return false;
        }
        if (!message.isOwner) {
          if (current?.callId === message.callId) finish('通话已在另一个页面接续');
          return;
        }
        awaitingRequest = null; current = message as VoiceSnapshot; show(); options.onState?.(current);
        if (!audio.ready && !busy) {
          try { muted = sessionStorage.getItem(mutedKey) === '1'; } catch { /* Default remains unmuted. */ }
          void prepare();
        }
        render();
      } else if (message?.type === 'audio' && current?.status === 'active' && current.isOwner && current.callId === message.callId) {
        if (message.streamId && message.streamId !== remoteStream) { remoteStream = message.streamId; audio.resetReceive(); }
        audio.receive(message.seq, message.data);
      } else if (message?.type === 'ended') {
        if (typeof message.callId === 'string') {
          closedCalls.add(message.callId);
          if (closedCalls.size > 32) closedCalls.delete(closedCalls.values().next().value!);
        }
        cancelled = cancelled.filter((id) => id !== message.callId); saveCancelled();
        if (current && current.callId !== message.callId
          || awaitingRequest?.type === 'dial' && awaitingRequest.requestId !== message.requestId
          || intent?.type === 'dial' && intent.requestId !== message.requestId) return false;
        if (current?.callId === message.callId || intent?.type === 'accept' && intent.callId === message.callId
          || awaitingRequest?.type === 'accept' && awaitingRequest.callId === message.callId
          || awaitingRequest?.type === 'dial' && awaitingRequest.requestId === message.requestId) {
          awaitingRequest = null; cancelAwaitingRequest = false;
          finish(message.reason || '通话已结束');
        }
      } else if (message?.type === 'error') {
        if (message.requestId && (awaitingRequest?.type !== 'dial' || message.requestId !== awaitingRequest.requestId)) return false;
        if (message.callId && message.callId !== current?.callId
          && !(intent?.type === 'accept' && message.callId === intent.callId)
          && !(awaitingRequest?.type === 'accept' && message.callId === awaitingRequest.callId)) return false;
        if (!current) {
          generation++; busy = false; audio.stop();
          if (!cancelAwaitingRequest && awaitingRequest) intent = awaitingRequest;
          awaitingRequest = null; cancelAwaitingRequest = false;
        }
        if (root.hidden) return;
        setError(message.message || '语音暂时无法连接，请重试。'); retry.hidden = !intent && !current;
        status.textContent = current ? '通话连接异常' : '暂时无法拨通';
      } else if (message?.type === 'terminated') {
        awaitingRequest = null; cancelAwaitingRequest = false;
        finish(message.reason || '语音已结束');
      }
    },
    setConnected(value: boolean) {
      connected = value;
      if (!value) { audio.setTransmitting(false); audio.resetReceive(); }
      if (!root.hidden) render();
    },
    dispose() {
      if (disposed) return;
      disposed = true; generation++; audio.stop(); window.clearInterval(clock); window.clearTimeout(hideTimer);
      root.replaceChildren();
    },
  };
}
