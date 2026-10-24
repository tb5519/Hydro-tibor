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
interface TrainingResponse { accepted?: boolean; sessionId?: string }
type Payload = Record<string, string | number | boolean>;
interface CollectorOptions {
  now: () => Clock;
  isForeground: () => boolean;
  requestId: () => string;
  send: (url: string, payload: Payload, keepalive?: boolean) => Promise<TrainingResponse>;
}
interface Session { id: string; seq: number; config: TrainingTimeConfig }
const contextIdentity = (config: TrainingTimeConfig) => config.contextKey || config.sourceToken;

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
  let waitingForActivity = false;
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
    waitingForActivity = true;
    if (session) release(session, discard || invalidGap);
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
    const currentConfig = config;
    const ticket = ++generation;
    starting = true;
    waitingForActivity = false;
    try {
      // Switching daily questions must settle the short final interval before
      // acquiring another lease. Otherwise a fast next-question request could
      // overtake its release and discard the previous question's entire time.
      await releaseBarrier;
      if (disposed || ticket !== generation || !options.isForeground()) return;
      const result = await options.send(currentConfig.startUrl, {
        sourceToken: currentConfig.sourceToken, requestId: options.requestId(),
      });
      if (!result.accepted || !result.sessionId) {
        if (ticket === generation) {
          waitingForActivity = true;
          retryAfter = options.now().monotonic + 30000;
        }
        return;
      }
      const next: Session = { id: result.sessionId, seq: 0, config: currentConfig };
      if (disposed || ticket !== generation || !options.isForeground()) {
        release(next, true);
        return;
      }
      session = next;
      lastSent = options.now().monotonic;
    } catch {
      if (ticket === generation) {
        waitingForActivity = true;
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
    waitingForActivity = false;
    void start();
  }

  function tick() {
    if (disposed) return;
    const current = sample();
    if (current.discontinuity) return;
    if (!options.isForeground()) {
      if (session || starting) pause();
      return;
    }
    const idleMs = Math.min(300, Math.max(30, config?.idleSeconds || 300)) * 1000;
    if (current.monotonic - lastActivity >= idleMs) {
      if (session || starting) pause();
      return;
    }
    // No automatic start here: a stolen/expired lease waits for actual activity,
    // so two open tabs do not keep taking the session from one another.
    if (!session || sending || waitingForActivity) return;
    const pulseMs = Math.min(60, Math.max(15, config?.heartbeatSeconds || 30)) * 1000;
    if (current.monotonic - lastSent < pulseMs) return;
    const currentSession = session;
    const ticket = generation;
    sending = true;
    lastSent = current.monotonic;
    void options.send(currentSession.config.heartbeatUrl, {
      sessionId: currentSession.id, seq: ++currentSession.seq, active: true,
    }).then((result) => {
      if (ticket === generation && !result.accepted) pause(true);
    }).catch(() => {
      if (ticket === generation) {
        pause(true);
        retryAfter = options.now().monotonic + 30000;
      }
    }).finally(() => {
      if (ticket === generation) sending = false;
    });
  }

  return {
    activity,
    tick,
    pause,
    setContext(next?: TrainingTimeConfig | null) {
      if (disposed) return;
      const enabled = next?.enabled && next.sourceToken && next.startUrl && next.heartbeatUrl ? next : null;
      if (enabled && config && contextIdentity(enabled) === contextIdentity(config)) {
        config = enabled;
        return;
      }
      pause();
      config = enabled;
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
  const anchor = doc.querySelector('[data-daily-quiz], .problem-content-container, #scratchpad, [data-online-ide]')
    || doc.querySelector('.main');
  const controller = createTrainingTimeCollector({
    now: () => ({ monotonic: win.performance.now(), wall: Date.now() }),
    isForeground: () => !closed && doc.visibilityState === 'visible' && doc.hasFocus()
      && win.navigator.onLine !== false && win.location.pathname === initialPath,
    requestId: () => {
      const bytes = new Uint8Array(16);
      win.crypto.getRandomValues(bytes);
      return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    },
    send: async (url, payload, keepalive = false) => {
      const endpoint = new URL(url, win.location.href);
      if (endpoint.origin !== win.location.origin) throw new Error('Invalid training endpoint');
      const abort = new AbortController();
      const timeout = win.setTimeout(() => abort.abort(), 8000);
      try {
        const response = await win.fetch(endpoint.href, {
          method: 'POST', credentials: 'same-origin', cache: 'no-store', keepalive,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: JSON.stringify(payload), signal: abort.signal,
        });
        if (!response.ok || !/^application\/json/i.test(response.headers.get('Content-Type') || '')) {
          return { accepted: false };
        }
        return await response.json();
      } finally {
        win.clearTimeout(timeout);
      }
    },
  });
  const onActivity = (event: Event) => { if (event.isTrusted) controller.activity(); };
  const onVisibility = () => {
    if (doc.visibilityState !== 'visible' || !doc.hasFocus()) controller.pause();
    else controller.activity();
  };
  const onBlur = () => controller.pause();
  const onFocus = () => controller.activity();
  const onPageHide = () => controller.pause();
  const onPageShow = () => controller.activity();
  const onOffline = () => controller.pause(true);
  const onContext = (event: Event) => controller.setContext((event as CustomEvent).detail);
  const events = ['pointerdown', 'click', 'keydown', 'input', 'wheel', 'touchstart', 'touchmove'];
  events.forEach((name) => doc.addEventListener(name, onActivity, { passive: true, capture: true }));
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocus);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  win.addEventListener('offline', onOffline);
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
      win.removeEventListener(contextEvent, onContext);
    },
  };
}
