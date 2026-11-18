/** Silent, foreground-only training telemetry. The server owns elapsed time and
 * the cross-device lease; the browser never supplies durations or code content. */
export interface TrainingTimeConfig {
  enabled: boolean;
  startUrl: string;
  heartbeatUrl: string;
  sourceToken: string;
  pendingSource?: boolean;
  refreshUrl?: string;
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
  refreshSource?: (context: TrainingTimeConfig) => Promise<TrainingTimeConfig | null>;
  requestId: (context: TrainingTimeConfig) => string;
  send: (url: string, payload: Payload, keepalive?: boolean) => Promise<TrainingResponse>;
}
interface Session { id: string; seq: number; config: TrainingTimeConfig }
const sameContext = (a: TrainingTimeConfig, b: TrainingTimeConfig) =>
  a.scope === b.scope && (a.refreshUrl || b.refreshUrl
    ? a.refreshUrl === b.refreshUrl && (!a.contextKey || !b.contextKey || a.contextKey === b.contextKey)
    : (a.contextKey || a.sourceToken) === (b.contextKey || b.sourceToken));

export function createTrainingTimeCollector(options: CollectorOptions) {
  let config: TrainingTimeConfig | null = null;
  let session: Session | null = null;
  let lastTick = options.now();
  let lastActivity = lastTick.monotonic;
  let lastSent = lastActivity;
  let retryAfter = 0;
  let retryDelay = 5000;
  let generation = 0;
  let starting = false;
  let sending = false;
  let disposed = false;
  let pendingStartId = '';
  let sentStartConfig: TrainingTimeConfig | null = null;
  let discardNextPulse = false;
  let resetSeq = 0;
  let offlineVersion = 0;
  const online = () => options.isOnline?.() !== false;
  function retryTransport() {
    retryAfter = options.now().monotonic + retryDelay;
    retryDelay = Math.min(30000, retryDelay * 2);
  }

  function idleEndsAt() {
    return lastActivity + Math.min(300, Math.max(30, config?.idleSeconds || 300)) * 1000;
  }

  async function release(sourceConfig: TrainingTimeConfig, payload: Payload) {
    const closedAt = options.now();
    try {
      await options.send(sourceConfig.heartbeatUrl, payload, true);
    } catch {
      // A lost response can mean the server already closed this lease. The
      // identical sequence is safe to replay. Subtract the time spent waiting
      // for that response, so a retry cannot turn time away into study.
      const current = options.now();
      const elapsed = current.monotonic - closedAt.monotonic;
      const wallElapsed = current.wall - closedAt.wall;
      if (!online() || elapsed < 0 || wallElapsed < 0 || Math.abs(elapsed - wallElapsed) > 1000) return;
      const delayedByMs = Number(payload.delayedByMs || 0) + Math.ceil(Math.max(elapsed, wallElapsed));
      if (delayedByMs > 90000) return;
      try { await options.send(sourceConfig.heartbeatUrl, { ...payload, delayedByMs }, true); } catch { /* Delivery is best effort. */ }
    }
  }

  function terminalFields(discard: boolean) {
    const current = options.now();
    const elapsed = current.monotonic - lastTick.monotonic;
    const wallElapsed = current.wall - lastTick.wall;
    const invalidGap = elapsed < 0 || wallElapsed < 0 || elapsed > 15000
      || Math.abs(elapsed - wallElapsed) > 5000;
    const drop = discard || invalidGap || discardNextPulse || !online();
    // Interactions and timer ticks have different phases. A late tick, blur
    // or next keystroke must all close at the very same idle deadline.
    const idleOverrun = drop ? 0 : Math.max(0, Math.ceil(current.monotonic - idleEndsAt()));
    return { active: false, discard: drop, ...(idleOverrun ? { delayedByMs: idleOverrun } : {}) };
  }

  function pause(discard = false) {
    generation++;
    starting = false;
    sending = false;
    const terminal = terminalFields(discard);
    if (session) {
      void release(session.config, { sessionId: session.id, seq: ++session.seq, ...terminal });
    } else if (sentStartConfig && pendingStartId) {
      // The request can have reached MongoDB while its reply is still in
      // flight (or was lost). Close that very attempt at the time of exit.
      void release(sentStartConfig, { sourceToken: sentStartConfig.sourceToken, requestId: pendingStartId,
        seq: 1, ...terminal });
    }
    pendingStartId = '';
    sentStartConfig = null;
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
    pendingStartId ||= options.requestId(config);
    if (!online()) return;
    const previousAttempt = sentStartConfig;
    // A status update can replace a page grant while a START reply is lost.
    // Keep both parts of the original idempotency key when retrying.
    let currentConfig = previousAttempt || config;
    const ticket = ++generation;
    starting = true;
    try {
      const requestId = pendingStartId;
      const request = () => {
        sentStartConfig = currentConfig;
        return options.send(currentConfig.startUrl, { sourceToken: currentConfig.sourceToken, requestId });
      };
      let result: TrainingResponse = currentConfig.pendingSource ? { refreshSource: true } : await request();
      if (previousAttempt && !result.accepted && ticket === generation) {
        // The first request may have acquired a lease before its reply was
        // lost. Settle its authorized tail up to expiry or a newer owner.
        void release(previousAttempt, { sourceToken: previousAttempt.sourceToken,
          requestId, seq: 1, ...terminalFields(!options.isForeground()) });
      }
      // Long-lived IDE/problem tabs can outlive the page grant. The server
      // reauthorizes the actual URL and the response must match the old source.
      if (!result.accepted && result.refreshSource && ticket === generation && options.refreshSource) {
        sentStartConfig = null;
        const fresh = await options.refreshSource(currentConfig);
        if (ticket !== generation || disposed) return;
        if (fresh?.enabled && fresh.sourceToken && sameContext(currentConfig, fresh) && options.isForeground() && online()) {
          config = fresh;
          currentConfig = fresh;
          result = await request();
        }
      }
      if (!result.accepted || !result.sessionId) {
        if (ticket === generation) {
          pendingStartId = '';
          sentStartConfig = null;
          retryAfter = options.now().monotonic + 30000;
        }
        return;
      }
      const next: Session = { id: result.sessionId, seq: 0, config: currentConfig };
      if (disposed || ticket !== generation) return; // pause() already closed this request ID.
      if (!options.isForeground()) { pause(true); return; }
      pendingStartId = '';
      sentStartConfig = null;
      session = next;
      retryDelay = 5000;
      retryAfter = 0;
      lastSent = options.now().monotonic;
      if (discardNextPulse && online()) tick();
    } catch {
      if (ticket === generation) retryTransport();
    } finally {
      if (ticket === generation) starting = false;
    }
  }

  function activity() {
    if (disposed || !options.isForeground()) return;
    const current = sample();
    if (current.monotonic > idleEndsAt() && (session || starting || pendingStartId)) pause();
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
    if (current.monotonic >= idleEndsAt()) {
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
        retryDelay = 5000;
        retryAfter = 0;
        discardNextPulse = false;
        resetSeq = 0;
      }
    }).catch(() => {
      if (ticket === generation) {
        // Start the retry timer at failure. Waiting another full heartbeat
        // after the HTTP timeout can exceed the server's per-pulse cap.
        lastSent = Number.NEGATIVE_INFINITY;
        retryTransport();
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
      const enabled = next?.enabled && (next.sourceToken || next.pendingSource) && next.startUrl && next.heartbeatUrl ? next : null;
      if (enabled && config && sameContext(enabled, config)) {
        config = enabled;
        return;
      }
      pause();
      config = enabled;
      retryDelay = 5000;
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
interface RequestOrder { account: string; prefix: string; number: number }
type TrainingWindow = Window & {
  __trainingTimeContext?: TrainingTimeConfig | null;
  __trainingTimeRequestOrder?: RequestOrder;
};
const orderHandoff = 'hydro:training-time-request-order';

/** Daily questions may come from different domains. Publish the fresh server
 * grant only when that question actually becomes visible; completion sends null. */
export function setTrainingTimeContext(config: TrainingTimeConfig | null, win: Window = window) {
  (win as TrainingWindow).__trainingTimeContext = config;
  win.dispatchEvent(new (win as Window & typeof globalThis).CustomEvent(contextEvent, { detail: config }));
}

export function bindTrainingTime(initial: TrainingTimeConfig | null, win: Window = window) {
  const doc = win.document;
  let closed = false;
  let pageHidden = false;
  const initialPath = win.location.pathname;
  const embedding = win.frameElement as HTMLElement | null;
  const frame = embedding?.matches('iframe[data-platform-page]') ? embedding : null;
  const shell = frame?.ownerDocument;
  // Scrolling between the chat and the visible problem does not transfer
  // keyboard focus. Remember which document received the actual gesture.
  let scrollDocument: Document | null = null;
  function isForeground() {
    if (closed || pageHidden || doc.visibilityState !== 'visible' || win.location.pathname !== initialPath) return false;
    if (!frame || !shell) return doc.hasFocus();
    if (!frame.isConnected || frame.inert || frame.hasAttribute('inert') || frame.hidden || frame.style.visibility === 'hidden'
      || shell.visibilityState !== 'visible' || !shell.hasFocus()) return false;
    // Closing the chat explicitly restores keyboard focus to its launcher. The
    // learner can then read and wheel the visible problem without clicking it.
    if (scrollDocument) return scrollDocument === doc;
    const active = shell.activeElement;
    return active === frame || active === shell.body || active === shell.documentElement
      || !!active?.matches('[data-class-chat] .class-chat__launcher[aria-expanded="false"]');
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
      if (!/^application\/json/i.test(response.headers.get('Content-Type') || '')) return null;
      if (response.status === 403) {
        // Hydro reports both authorization denials and temporary operation
        // quotas as 403. Only the latter can recover without another action.
        const body = await response.json().catch(() => null);
        if (body?.error?.name === 'OpcountExceededError') throw new Error('Training clock rate limited');
        return null;
      }
      return response.ok ? await response.json() : null;
    } finally {
      win.clearTimeout(timeout);
    }
  }
  // Swapping problem frames in the platform shell shares one live host.
  // A full document navigation hands its order across on pagehide only: a tab
  // opened/duplicated while this document is active gets its own random stream.
  const host = (shell?.defaultView || win) as TrainingWindow;
  let restoreOrder = true;
  function saveOrder() {
    const order = host.__trainingTimeRequestOrder;
    if (!order) return;
    try {
      host.sessionStorage.setItem(orderHandoff, JSON.stringify({ ...order, savedAt: Date.now() }));
    } catch { /* Storage is optional. Server ordering still applies. */ }
  }
  function readOrder(account: string) {
    try {
      const value = host.sessionStorage.getItem(orderHandoff);
      if (!value) return;
      host.sessionStorage.removeItem(orderHandoff);
      const past = JSON.parse(value);
      const age = Date.now() - past.savedAt;
      if (past.account === account && /^[a-f0-9]{32}$/.test(past.prefix)
        && Number.isSafeInteger(past.number) && past.number > 0 && past.number < 9999999999 && age >= 0 && age <= 90000) {
        const current = host.__trainingTimeRequestOrder;
        const number = current?.prefix === past.prefix ? Math.max(current.number, past.number) : past.number;
        host.__trainingTimeRequestOrder = { account, prefix: past.prefix, number };
      }
    } catch { /* A malformed or unavailable handoff starts an independent stream. */ }
  }
  const onHostRestore = (event: PageTransitionEvent) => { if (event.persisted) restoreOrder = true; };
  host.addEventListener('pagehide', saveOrder);
  host.addEventListener('pageshow', onHostRestore);
  const controller = createTrainingTimeCollector({
    now: () => ({ monotonic: win.performance.now(), wall: Date.now() }),
    isForeground,
    isOnline: () => win.navigator.onLine !== false,
    requestId: (context) => {
      const account = (context.scope || '').split(':', 1)[0];
      if (restoreOrder) { restoreOrder = false; readOrder(account); }
      let order = host.__trainingTimeRequestOrder;
      if (!order || order.account !== account) {
        const bytes = new Uint8Array(16);
        win.crypto.getRandomValues(bytes);
        const prefix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        order = { account, prefix, number: 0 };
        host.__trainingTimeRequestOrder = order;
      }
      return `${order.prefix}_${String(++order.number).padStart(10, '0')}`;
    },
    refreshSource: async (context) => {
      if (win.location.pathname !== initialPath) return null;
      const daily = doc.documentElement.dataset.page === 'daily_quiz';
      if (daily && !context.refreshUrl) return null;
      const url = daily ? new URL(context.refreshUrl, win.location.href) : new URL(win.location.href);
      if (!daily) url.searchParams.set('__trainingTimeGrant', '1');
      const result = await fetchJson(url, {
        method: 'GET', redirect: 'error', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      if (result?.trainingTime?.pendingSource) throw new Error('Training grant temporarily unavailable');
      return result?.trainingTime || null;
    },
    send: async (url, payload, keepalive = false) => await fetchJson(new URL(url, win.location.href), {
      method: 'POST', keepalive,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      body: JSON.stringify(payload),
    }) || { accepted: false },
  });
  let foreground = isForeground();
  function updateForeground(next: boolean) {
    if (next === foreground) return;
    foreground = next;
    if (next) controller.activity();
    else controller.pause();
  }
  const syncForeground = () => updateForeground(isForeground());
  const events = ['pointerdown', 'click', 'keydown', 'input', 'wheel', 'touchstart', 'touchmove'];
  function recordInput(event: Event, source: Document) {
    if (!event.isTrusted) return;
    scrollDocument = frame && (event.type === 'wheel' || event.type === 'touchmove') ? source : null;
    syncForeground();
    if (source === doc) {
      if (foreground) controller.activity();
      else scrollDocument = null;
    }
  }
  const onActivity = (event: Event) => recordInput(event, doc);
  const onShellActivity = (event: Event) => recordInput(event, shell!);
  const onFocusChange = () => {
    scrollDocument = null;
    syncForeground();
  };
  const onBlur = () => {
    scrollDocument = null;
    updateForeground(false);
  };
  const observer = frame ? new (win as Window & typeof globalThis).MutationObserver(syncForeground) : null;
  function watchShell() {
    if (!frame || !shell) return;
    observer?.observe(frame, { attributes: true, attributeFilter: ['hidden', 'inert', 'style'] });
    events.forEach((name) => shell.addEventListener(name, onShellActivity, { passive: true, capture: true }));
    shell.addEventListener('focusin', onFocusChange);
    shell.addEventListener('visibilitychange', syncForeground);
    shell.defaultView?.addEventListener('blur', onBlur);
    shell.defaultView?.addEventListener('focus', syncForeground);
  }
  function unwatchShell() {
    observer?.disconnect();
    events.forEach((name) => shell?.removeEventListener(name, onShellActivity, true));
    shell?.removeEventListener('focusin', onFocusChange);
    shell?.removeEventListener('visibilitychange', syncForeground);
    shell?.defaultView?.removeEventListener('blur', onBlur);
    shell?.defaultView?.removeEventListener('focus', syncForeground);
  }
  const onPageHide = () => {
    pageHidden = true;
    scrollDocument = null;
    unwatchShell();
    foreground = false;
    controller.pause();
  };
  const onPageShow = () => {
    pageHidden = false;
    watchShell();
    syncForeground();
  };
  const onOffline = () => controller.disconnected();
  const onOnline = () => controller.tick();
  const onContext = (event: Event) => {
    controller.setContext((event as CustomEvent).detail);
    syncForeground();
  };
  events.forEach((name) => doc.addEventListener(name, onActivity, { passive: true, capture: true }));
  watchShell();
  doc.addEventListener('visibilitychange', syncForeground);
  win.addEventListener('blur', onBlur);
  win.addEventListener('focus', onFocusChange);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('pageshow', onPageShow);
  win.addEventListener('offline', onOffline);
  win.addEventListener('online', onOnline);
  win.addEventListener(contextEvent, onContext);
  const timer = win.setInterval(() => {
    syncForeground();
    controller.tick();
  }, 5000);
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
      host.removeEventListener('pagehide', saveOrder);
      host.removeEventListener('pageshow', onHostRestore);
      events.forEach((name) => doc.removeEventListener(name, onActivity, true));
      unwatchShell();
      doc.removeEventListener('visibilitychange', syncForeground);
      win.removeEventListener('blur', onBlur);
      win.removeEventListener('focus', onFocusChange);
      win.removeEventListener('pagehide', onPageHide);
      win.removeEventListener('pageshow', onPageShow);
      win.removeEventListener('offline', onOffline);
      win.removeEventListener('online', onOnline);
      win.removeEventListener(contextEvent, onContext);
    },
  };
}
