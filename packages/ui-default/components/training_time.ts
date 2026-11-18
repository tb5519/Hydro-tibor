/** Silent, foreground-only training telemetry. The server owns elapsed time and
 * the cross-device lease; the browser never supplies durations or code content. */
export interface TrainingTimeConfig {
  enabled: boolean;
  startUrl: string;
  heartbeatUrl: string;
  sourceToken: string;
  contextKey?: string;
  scope?: string;
  heartbeatSeconds?: number;
  idleSeconds?: number;
}
interface Clock { monotonic: number; wall: number }
interface TrainingResponse { accepted?: boolean; sessionId?: string; refreshSource?: boolean }
type Payload = Record<string, string | number | boolean>;
interface CollectorOptions {
  now: () => Clock;
  isForeground: () => boolean;
  isOnline?: () => boolean;
  refreshSource?: () => Promise<TrainingTimeConfig | null>;
  requestId: () => string;
  send: (url: string, payload: Payload, keepalive?: boolean) => Promise<TrainingResponse>;
}
interface Session { id: string; seq: number; config: TrainingTimeConfig }
const sameContext = (a: TrainingTimeConfig, b: TrainingTimeConfig) =>
  a.scope === b.scope && (a.contextKey || a.sourceToken) === (b.contextKey || b.sourceToken);

export function createTrainingTimeCollector(options: CollectorOptions) {
  let config: TrainingTimeConfig | null = null;
  let session: Session | null = null;
  let lastTick = options.now();
  let lastActivity = lastTick.monotonic;
  let lastSent = lastActivity;
  let retryAfter = 0;
  let generation = 0;
  let starting = false;
  let sending = false;
  let disposed = false;
  let pendingStartId = '';
  let discardNextPulse = false;
  let resetSeq = 0;
  let offlineVersion = 0;
  const online = () => options.isOnline?.() !== false;
  let releaseBarrier: Promise<unknown> = Promise.resolve();

  function release(current: Session, discard: boolean) {
    // Keepalive is deliberately only used for a tiny final release, never for
    // an offline backlog. A late lower sequence cannot reopen a released lease.
    releaseBarrier = options.send(current.config.heartbeatUrl, {
      sessionId: current.id, seq: ++current.seq, active: false, discard,
    }, true).catch(() => {});
  }

  function pause(discard = false) {
    const current = options.now();
    const elapsed = current.monotonic - lastTick.monotonic;
    const wallElapsed = current.wall - lastTick.wall;
    const invalidGap = elapsed < 0 || wallElapsed < 0 || elapsed > 15000
      || Math.abs(elapsed - wallElapsed) > 5000;
    generation++;
    starting = false;
    sending = false;
    pendingStartId = '';
    if (session) release(session, discard || invalidGap || discardNextPulse || !online());
    discardNextPulse = false;
    resetSeq = 0;
    session = null;
  }

  function sample() {
    const current = options.now();
    const elapsed = current.monotonic - lastTick.monotonic;
    const wallElapsed = current.wall - lastTick.wall;
    // Suspended laptops and throttled/frozen pages must not manufacture active
    // time. Compare two clocks because performance.now differs across engines.
    const discontinuity = elapsed < 0 || wallElapsed < 0 || elapsed > 15000
      || Math.abs(elapsed - wallElapsed) > 5000;
    lastTick = current;
    if (discontinuity) pause(true);
    return { ...current, discontinuity };
  }

  async function start() {
    if (disposed || !config?.enabled || starting || session || !options.isForeground()
      || options.now().monotonic < retryAfter) return;
    pendingStartId ||= options.requestId();
    if (!online()) return;
    let currentConfig = config;
    const ticket = ++generation;
    starting = true;
    try {
      // Switching daily questions must settle the short final interval before
      // acquiring another lease. Otherwise a fast next-question request could
      // overtake its release and discard the previous question's entire time.
      await releaseBarrier;
      if (disposed || ticket !== generation || !options.isForeground() || !online()) return;
      const requestId = pendingStartId;
      const request = () => options.send(currentConfig.startUrl, { sourceToken: currentConfig.sourceToken, requestId });
      let result = await request();
      // Long-lived IDE/problem tabs can outlive the page grant. The server
      // reauthorizes the actual URL and the response must match the old source.
      if (!result.accepted && result.refreshSource && ticket === generation && options.refreshSource) {
        const fresh = await options.refreshSource();
        if (ticket !== generation || disposed) return;
        if (fresh?.enabled && sameContext(currentConfig, fresh) && options.isForeground() && online()) {
          config = fresh;
          currentConfig = fresh;
          result = await request();
        }
      }
      if (!result.accepted || !result.sessionId) {
        if (ticket === generation) {
          pendingStartId = '';
          retryAfter = options.now().monotonic + 30000;
        }
        return;
      }
      const next: Session = { id: result.sessionId, seq: 0, config: currentConfig };
      if (disposed || ticket !== generation || !options.isForeground()) {
        release(next, true);
        return;
      }
      pendingStartId = '';
      session = next;
      lastSent = options.now().monotonic;
      if (discardNextPulse && online()) tick();
    } catch {
      if (ticket === generation) {
        retryAfter = options.now().monotonic + 30000;
      }
    } finally {
      if (ticket === generation) starting = false;
    }
  }

  function activity() {
    if (disposed || !options.isForeground()) return;
    const current = sample();
    lastActivity = current.monotonic;
    void start();
  }

  function disconnected() {
    offlineVersion++;
    resetSeq = 0;
    if (session || starting || pendingStartId) discardNextPulse = true;
  }

  function tick() {
    if (disposed) return;
    const current = sample();
    if (current.discontinuity) return;
    if (!options.isForeground()) {
      if (session || starting || pendingStartId) pause();
      return;
    }
    const idleMs = Math.min(300, Math.max(30, config?.idleSeconds || 300)) * 1000;
    if (current.monotonic - lastActivity >= idleMs) {
      if (session || starting || pendingStartId) pause();
      return;
    }
    if (!online()) {
      if (session || starting || pendingStartId) discardNextPulse = true;
      return;
    }
    if (!session) {
      // Replaying the same request ID cannot take back another device's lease.
      if (pendingStartId) void start();
      return;
    }
    if (sending || current.monotonic < retryAfter) return;
    const pulseMs = Math.min(60, Math.max(15, config?.heartbeatSeconds || 30)) * 1000;
    if (!discardNextPulse && current.monotonic - lastSent < pulseMs) return;
    const currentSession = session;
    const network = offlineVersion;
    const ticket = generation;
    sending = true;
    lastSent = current.monotonic;
    const seq = discardNextPulse && resetSeq ? resetSeq : ++currentSession.seq;
    if (discardNextPulse) resetSeq = seq;
    void options.send(currentSession.config.heartbeatUrl, {
      sessionId: currentSession.id, seq, active: true,
      ...(discardNextPulse ? { discard: true } : {}),
    }).then((result) => {
      if (ticket !== generation) return;
      if (!result.accepted) {
        pause();
        if (result.refreshSource && options.refreshSource) void start();
      } else if (network === offlineVersion) {
        discardNextPulse = false;
        resetSeq = 0;
      }
    }).catch(() => {
      if (ticket === generation) {
        retryAfter = options.now().monotonic + 30000;
      }
    }).finally(() => {
      if (ticket === generation) sending = false;
    });
  }

  return {
    activity,
    disconnected,
    tick,
    pause,
    setContext(next?: TrainingTimeConfig | null) {
      if (disposed) return;
      const enabled = next?.enabled && next.sourceToken && next.startUrl && next.heartbeatUrl ? next : null;
      if (enabled && config && sameContext(enabled, config)) {
        config = enabled;
        return;
      }
      pause();
      config = enabled;
      retryAfter = 0;
      lastTick = options.now();
      lastActivity = lastTick.monotonic;
      if (config && options.isForeground()) activity();
    },
    dispose() {
      if (disposed) return;
      pause();
      disposed = true;
      config = null;
    },
  };
}

const contextEvent = 'hydro:training-time-context';
type TrainingWindow = Window & { __trainingTimeContext?: TrainingTimeConfig | null };

/** Daily questions may come from different domains. Publish the fresh server
 * grant only when that question actually becomes visible; completion sends null. */
export function setTrainingTimeContext(config: TrainingTimeConfig | null, win: Window = window) {
  (win as TrainingWindow).__trainingTimeContext = config;
  win.dispatchEvent(new (win as Window & typeof globalThis).CustomEvent(contextEvent, { detail: config }));
}

export function bindTrainingTime(initial: TrainingTimeConfig | null, win: Window = window) {
  const doc = win.document;
  let closed = false;
  const initialPath = win.location.pathname;
  function isForeground() {
    if (closed || doc.visibilityState !== 'visible' || win.location.pathname !== initialPath) return false;
    const frame = win.frameElement as HTMLElement | null;
    if (!frame?.matches('iframe[data-platform-page]')) return doc.hasFocus();
    const shell = frame.ownerDocument;
    if (!frame.isConnected || frame.inert || frame.hidden || frame.style.visibility === 'hidden'
      || shell.visibilityState !== 'visible' || !shell.hasFocus()) return false;
    // The browser can keep focus on the shell body while a learner reads or
    // scrolls the visible study frame. A focused chat or other host control
    // belongs to a separate activity.
    return shell.activeElement === frame || shell.activeElement === shell.body || shell.activeElement === shell.documentElement;
  }
  const anchor = doc.querySelector('[data-daily-quiz], .problem-content-container, #scratchpad, [data-online-ide]')
    || doc.querySelector('.main');
  async function fetchJson(url: URL, init: RequestInit) {
    if (url.origin !== win.location.origin) throw new Error('Invalid training endpoint');
    const abort = new AbortController();
    const timeout = win.setTimeout(() => abort.abort(), 8000);
    try {
      const response = await win.fetch(url.href, {
        credentials: 'same-origin', cache: 'no-store', ...init, signal: abort.signal,
      });
      if (response.status === 429 || response.status >= 500) throw new Error('Training clock unavailable');
      if (!response.ok || !/^application\/json/i.test(response.headers.get('Content-Type') || '')) return null;
      return await response.json();
    } finally {
      win.clearTimeout(timeout);
    }
  }
  const controller = createTrainingTimeCollector({
    now: () => ({ monotonic: win.performance.now(), wall: Date.now() }),
    isForeground,
    isOnline: () => win.navigator.onLine !== false,
    requestId: () => {
      const bytes = new Uint8Array(16);
      win.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    },
    refreshSource: async () => {
      if (doc.documentElement.dataset.page === 'daily_quiz' || win.location.pathname !== initialPath) return null;
      const url = new URL(win.location.href);
      url.searchParams.set('__trainingTimeGrant', '1');
      const result = await fetchJson(url, {
        method: 'GET', redirect: 'error', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      return result?.trainingTime || null;
    },
    send: async (url, payload, keepalive = false) => await fetchJson(new URL(url, win.location.href), {
      method: 'POST', keepalive,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(payload),
    }) || { accepted: false },
  });
  const onActivity = (event: Event) => { if (event.isTrusted) controller.activity(); };
  const onVisibility = () => {
    if (!isForeground()) controller.pause();
    else controller.activity();
  };
  const onBlur = () => controller.pause();
  const onFocus = () => controller.activity();
  const onPageHide = () => controller.pause();
  const onPageShow = () => controller.activity();
  const onOffline = () => controller.disconnected();
  const onOnline = () => controller.tick();
  const onContext = (event: Event) => controller.setContext((event as CustomEvent).detail);
  const events = ['pointerdown', 'click', 'keydown', 'input', 'wheel', 'touchstart', 'touchmove'];
  events.forEach((name) => doc.addEventListener(name, onActivity, { passive: true, capture: true }));
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocus);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  win.addEventListener('offline', onOffline);
  win.addEventListener('online', onOnline);
  win.addEventListener(contextEvent, onContext);
  const timer = win.setInterval(() => controller.tick(), 5000);
  const staged = (win as TrainingWindow).__trainingTimeContext;
  controller.setContext(staged === undefined ? initial : staged);
  return {
    contentRemoved(element: Element) {
      if ((anchor && (element === anchor || element.contains(anchor))) || win.location.pathname !== initialPath) {
        this.dispose();
      }
    },
    dispose() {
      if (closed) return;
      controller.dispose();
      closed = true;
      win.clearInterval(timer);
      events.forEach((name) => doc.removeEventListener(name, onActivity, true));
      doc.removeEventListener('visibilitychange', onVisibility);
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('focus', onFocus);
      win.removeEventListener('pagehide', onPageHide);
      win.removeEventListener('pageshow', onPageShow);
      win.removeEventListener('offline', onOffline);
      win.removeEventListener('online', onOnline);
      win.removeEventListener(contextEvent, onContext);
    },
  };
}
