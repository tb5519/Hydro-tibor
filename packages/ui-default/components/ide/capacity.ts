import { request } from 'vj/utils';
import { getActiveIdeRuntime } from './runtime';

export interface IdeCapacity {
  capacity: number;
  used: number;
  available: number;
  compilerBusy: boolean;
  ownRunning: boolean;
  canRelease: boolean;
  resetting: boolean;
}
export interface CapacityState {
  data: IdeCapacity | null;
  status: 'checking' | 'ready' | 'offline';
  releasing: boolean;
  feedback: string;
  error: string;
}
function parseCapacity(value: any): IdeCapacity {
  if (!value || !Number.isInteger(value.capacity) || value.capacity < 1 || value.capacity > 16
    || !Number.isInteger(value.used) || value.used < 0 || value.used > 16
    || !Number.isInteger(value.available) || value.available < 0 || value.available > value.capacity
    || ['compilerBusy', 'ownRunning', 'canRelease', 'resetting'].some((key) => typeof value[key] !== 'boolean')) {
    throw new Error('运行状态暂时不可用');
  }
  return value;
}
function endpoints() {
  // In a shared view this is the teacher's page context, never the replayed HTML.
  const context = typeof UiContext === 'undefined' ? {} : UiContext;
  const prefix = window.location.pathname.match(/^\/d\/[^/]+/)?.[0] || '';
  return { capacity: context.ideCapacityUrl || `${prefix}/ide/capacity`, release: context.ideReleaseUrl || `${prefix}/ide/release` };
}
export function createIdeCapacityStore(urls = endpoints()) {
  let state: CapacityState = { data: null, status: 'checking', releasing: false, feedback: '', error: '' };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
  let active = false; let loading = false; let generation = 0; let awaitingRelease = false;
  let runtimeDispose: (() => void) | undefined;
  let runtimeSignature = '';
  function update(patch: Partial<CapacityState>) { state = { ...state, ...patch }; listeners.forEach((listener) => listener()); }
  function schedule(delay?: number) {
    clearTimeout(timer);
    if (!active || document.visibilityState === 'hidden') return;
    const next = delay ?? (state.data?.resetting ? 1000 : state.status === 'offline' || !state.data?.available || state.data?.compilerBusy ? 3000 : 10000);
    timer = setTimeout(() => { void refresh(); }, next);
  }
  function finishRelease() {
    if (!awaitingRelease || state.data?.resetting) return;
    awaitingRelease = false;
    update({ feedback: '已停止全部程序' });
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => update({ feedback: '' }), 3000);
  }
  async function refresh(invalidate = false) {
    if (!active || document.visibilityState === 'hidden' || state.releasing || loading) return;
    loading = true;
    const current = generation;
    if (invalidate) update({ data: null, status: 'checking', error: '', feedback: '' });
    try {
      const data = parseCapacity(await request.get(urls.capacity, {}, { cache: false, timeout: 8000 }));
      if (!active || current !== generation) return;
      update({ data, status: 'ready', error: '' }); finishRelease();
    } catch (error) {
      if (active && current === generation) update({ data: null, status: 'offline', feedback: '', error: String(error?.message || '无法获取运行状态').slice(0, 160) });
    } finally {
      if (current === generation) { loading = false; if (active) schedule(); }
    }
  }
  async function release() {
    if (!active || state.status !== 'ready' || !state.data?.canRelease || state.releasing || state.data.resetting) return;
    const current = ++generation; loading = false;
    clearTimeout(timer); clearTimeout(feedbackTimer);
    update({ releasing: true, feedback: '', error: '' });
    try {
      const data = parseCapacity(await request.post(urls.release, {}, { timeout: 15000 }));
      if (!active || current !== generation) return;
      awaitingRelease = true;
      update({ data, releasing: false, status: 'ready' }); finishRelease(); schedule(data.resetting ? 1000 : undefined);
    } catch (error) {
      if (!active || current !== generation) return;
      update({ releasing: false, feedback: '操作未成功', error: String(error?.message || '停止失败，请稍后重试').slice(0, 160) });
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => update({ feedback: '', error: '' }), 3000);
      schedule(3000);
    }
  }
  const resume = () => { if (document.visibilityState !== 'hidden') { void refresh(true); } else clearTimeout(timer); };
  const online = () => { void refresh(true); };
  const offline = () => { ++generation; loading = false; clearTimeout(timer); update({ data: null, status: 'offline', releasing: false, feedback: '', error: '网络已断开' }); };
  function bindRuntime() {
    runtimeDispose?.(); runtimeSignature = '';
    runtimeDispose = getActiveIdeRuntime()?.subscribe((snapshot) => {
      const next = `${snapshot.runId}:${snapshot.state}`;
      if (runtimeSignature && next !== runtimeSignature) schedule(200);
      runtimeSignature = next;
    });
  }
  function start() {
    active = true;
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('focus', online); window.addEventListener('online', online); window.addEventListener('offline', offline);
    window.addEventListener('hydro:ide-runtime-ready', bindRuntime); bindRuntime(); void refresh(true);
  }
  function stop() {
    active = false; ++generation; loading = false;
    state = { ...state, data: null, releasing: false, status: 'checking', feedback: '', error: '' };
    clearTimeout(timer); clearTimeout(feedbackTimer); runtimeDispose?.();
    document.removeEventListener('visibilitychange', resume);
    window.removeEventListener('focus', online); window.removeEventListener('online', online); window.removeEventListener('offline', offline);
    window.removeEventListener('hydro:ide-runtime-ready', bindRuntime);
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener); if (listeners.size === 1) start();
      return () => { listeners.delete(listener); if (!listeners.size) stop(); };
    },
    refresh, release,
  };
}
let sharedStore: ReturnType<typeof createIdeCapacityStore>;
export function getIdeCapacityStore() { return sharedStore ||= createIdeCapacityStore(); }
