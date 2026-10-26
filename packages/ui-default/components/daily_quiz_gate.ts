export interface DailyQuizGateContext {
  dailyQuizGate?: { statusUrl: string; serverNow?: number };
}

type GateWindow = Window & typeof globalThis;
interface GateBinding {
  update: (context: DailyQuizGateContext) => void;
  dispose: () => void;
}
export interface DailyQuizRedirectDetail {
  url: string;
  /** Editors may finish saving their current draft before navigation. */
  waitUntil: (promise: Promise<unknown>) => void;
}

const bindings = new WeakMap<Window, GateBinding>();
const redirects = new WeakMap<Window, { timer?: number }>();
const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 3_600_000;
const POLL_MS = 60_000;
const THROTTLE_MS = 5_000;
const REQUEST_TIMEOUT_MS = 10_000;
const NOTICE_ID = 'hydro-daily-quiz-gate-notice';

function quizUrl(value: unknown, status: boolean, win: GateWindow) {
  if (typeof value !== 'string' || value.length > 2048) return undefined;
  try {
    const url = new URL(value, win.location.href);
    const path = status ? /^\/(?:d\/[^/]+\/)?daily-quiz\/status$/ : /^\/(?:d\/[^/]+\/)?daily-quiz\/?$/;
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== win.location.origin
      || url.username || url.password || !path.test(url.pathname)) return undefined;
    url.search = ''; url.hash = '';
    return url;
  } catch { return undefined; }
}

function exemptPage(win: GateWindow) {
  const path = win.location.pathname.replace(/^\/d\/[^/]+(?=\/)/, '');
  return /^\/(?:daily-quiz|login|logout|oauth|lostpass|user\/(?:sudo|tfa)|home\/security)(?:\/|$)/.test(path);
}

function notice(text: string, win: GateWindow, link?: string) {
  const doc = win.document;
  const display = () => {
    if (!doc.body) return;
    let element = doc.getElementById(NOTICE_ID);
    if (!element) {
      element = doc.createElement('div');
      element.id = NOTICE_ID;
      element.setAttribute('role', 'status');
      element.setAttribute('aria-live', 'polite');
      element.style.cssText = 'position:fixed;top:28px;left:50%;transform:translateX(-50%);z-index:100000;'
        + 'box-sizing:border-box;max-width:calc(100% - 32px);width:max-content;padding:16px 22px;'
        + 'border:1px solid #c9dcff;border-radius:14px;background:#fff;color:#203b66;'
        + 'box-shadow:0 8px 32px #16366b26;font-size:15px;line-height:1.7;pointer-events:none;';
      doc.body.appendChild(element);
    }
    element.textContent = text;
    if (link) {
      const anchor = doc.createElement('a');
      anchor.href = link;
      anchor.target = '_blank';
      anchor.rel = 'noopener';
      anchor.textContent = '前往每日一练';
      anchor.style.cssText = 'display:inline-block;margin-left:10px;color:#245dcc;text-decoration:underline;pointer-events:auto;';
      element.appendChild(anchor);
    }
  };
  if (doc.body) display();
  else doc.addEventListener('DOMContentLoaded', display, { once: true });
}

/** Also used when a submission from an old tab receives daily_quiz_required. */
export function redirectToDailyQuiz(dailyQuizUrl = '/daily-quiz', win: GateWindow = window): boolean {
  const url = quizUrl(dailyQuizUrl, false, win);
  if (!url || exemptPage(win)) return false;
  if (redirects.has(win)) return true;
  url.searchParams.set('return', win.location.pathname + win.location.search + win.location.hash);
  const pending: Promise<unknown>[] = [];
  const state: { timer?: number } = {};
  redirects.set(win, state);
  const onPageHide = () => {
    win.clearTimeout(state.timer);
    if (redirects.get(win) === state) redirects.delete(win);
    win.document.getElementById(NOTICE_ID)?.remove();
  };
  win.addEventListener('pagehide', onPageHide, { once: true });
  const failed = () => {
    win.removeEventListener('pagehide', onPageHide);
    if (redirects.get(win) !== state) return;
    redirects.delete(win);
    notice('今天的每日一练还没完成。请先保存当前作品，或在新页面完成练习后回来继续。', win, url.href);
  };
  notice('今天的每日一练还没完成，正在带你去练习…', win);
  // The short explanation comes before saving so edits made while it is visible
  // are included. Once all draft writes finish, navigate without another delay.
  state.timer = win.setTimeout(() => {
    if (redirects.get(win) !== state) return;
    if (exemptPage(win)) { onPageHide(); win.removeEventListener('pagehide', onPageHide); return; }
    url.searchParams.set('return', win.location.pathname + win.location.search + win.location.hash);
    const event = new win.CustomEvent<DailyQuizRedirectDetail>('hydro:daily-quiz-redirect', {
      cancelable: true,
      detail: { url: url.href, waitUntil: (promise) => pending.push(Promise.resolve(promise)) },
    });
    if (!win.dispatchEvent(event)) { failed(); return; }
    Promise.all(pending).then(() => {
      // The editor may have navigated while an asynchronous draft save finished.
      if (redirects.get(win) === state && !exemptPage(win)) {
        url.searchParams.set('return', win.location.pathname + win.location.search + win.location.hash);
        win.location.assign(url.href);
      }
    }, failed);
  }, 650);
  return true;
}

/** Small bootstrap: starts before the main UI chunk, and survives PJAX / BFCache. */
export function startDailyQuizGate(context: DailyQuizGateContext, win: GateWindow = window) {
  if (!win.document || !win.fetch) return undefined;
  const existing = bindings.get(win);
  if (existing) { existing.update(context); return existing; }
  if (!quizUrl(context?.dailyQuizGate?.statusUrl, true, win)) return undefined;
  const doc = win.document;
  let statusUrl = '';
  let offset = 0;
  let stopped = false;
  let suspended = false;
  let timer: number | undefined;
  let lastAttempt = -Infinity;
  let lastDay = -Infinity;
  let generation = 0;
  let configTime: number | undefined;
  let request: { cancel: () => void } | undefined;
  const day = () => Math.floor((win.Date.now() + offset + BEIJING_OFFSET_MS) / DAY_MS);
  const visible = () => !stopped && !suspended && doc.visibilityState !== 'hidden'
    && win.navigator.onLine !== false && !exemptPage(win) && !!statusUrl;
  const clearTimer = () => { win.clearTimeout(timer); timer = undefined; };
  const setServerTime = (value: unknown) => {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) offset = value - win.Date.now();
  };
  const schedule = () => {
    clearTimer();
    if (!visible() || redirects.has(win)) return;
    const serverNow = win.Date.now() + offset;
    const untilMidnight = DAY_MS - ((serverNow + BEIJING_OFFSET_MS) % DAY_MS) + 50;
    timer = win.setTimeout(() => { timer = undefined; void check(); }, Math.min(POLL_MS, untilMidnight));
  };
  const pause = () => {
    clearTimer(); generation++;
    request?.cancel(); request = undefined;
  };
  const check = async (force = false) => {
    if (!visible() || request || redirects.has(win)) return;
    if (!force && lastDay === day() && win.Date.now() - lastAttempt < THROTTLE_MS) { schedule(); return; }
    lastAttempt = win.Date.now(); lastDay = day();
    const epoch = generation;
    const controller = new win.AbortController();
    let timeout: number;
    let cancel: () => void;
    const interrupted = new Promise<never>((resolve, reject) => {
      cancel = () => { controller.abort(); reject(new Error('Daily quiz status cancelled')); };
      timeout = win.setTimeout(cancel, REQUEST_TIMEOUT_MS);
    });
    request = { cancel: cancel! };
    try {
      const result = await Promise.race([
        win.fetch(statusUrl, {
          credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: { Accept: 'application/json' }, signal: controller.signal,
        }).then((response) => {
          if (!response.ok) throw new Error('Daily quiz status unavailable');
          return response.json();
        }),
        interrupted,
      ]);
      if (epoch !== generation || !visible()) return;
      setServerTime(result?.serverNow);
      const state = result?.state;
      if (state?.teacherPreview === true) { statusUrl = ''; return; }
      if (state?.required === true && state?.enabled !== false) {
        redirectToDailyQuiz(statusUrl.replace(/\/status$/, ''), win);
      }
    } catch { /* Offline, expired login or a temporary error must leave the current work intact. */ }
    finally {
      win.clearTimeout(timeout!);
      if (epoch === generation) { request = undefined; schedule(); }
    }
  };
  const onResume = () => { if (visible()) void check(); };
  const onVisibility = () => { if (doc.visibilityState === 'hidden') pause(); else onResume(); };
  const onPageShow = (event: PageTransitionEvent) => {
    suspended = false;
    if (visible()) void check(!!event.persisted);
  };
  const onPageHide = (event: PageTransitionEvent) => {
    win.clearTimeout(redirects.get(win)?.timer);
    redirects.delete(win);
    doc.getElementById(NOTICE_ID)?.remove();
    if (!event.persisted) { dispose(); return; }
    suspended = true; pause();
  };
  const update = (next: DailyQuizGateContext) => {
    const nextUrl = quizUrl(next?.dailyQuizGate?.statusUrl, true, win)?.href || '';
    if (nextUrl !== statusUrl) { pause(); lastAttempt = -Infinity; statusUrl = nextUrl; }
    if (next?.dailyQuizGate?.serverNow !== configTime) {
      configTime = next?.dailyQuizGate?.serverNow;
      setServerTime(configTime);
    }
    if (visible()) void check();
    else clearTimer();
  };
  const dispose = () => {
    if (stopped) return;
    stopped = true; pause();
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('focus', onResume);
    win.removeEventListener('online', onResume);
    win.removeEventListener('pageshow', onPageShow);
    win.removeEventListener('pagehide', onPageHide);
    bindings.delete(win);
  };
  const binding = { update, dispose };
  bindings.set(win, binding);
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('focus', onResume);
  win.addEventListener('online', onResume);
  win.addEventListener('pageshow', onPageShow);
  win.addEventListener('pagehide', onPageHide);
  update(context);
  return binding;
}
