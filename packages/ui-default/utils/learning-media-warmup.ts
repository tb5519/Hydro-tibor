import { prepareScratchpadThemeAssets } from '../components/scratchpad/themeAssets';

interface Config { url: string; scope: string }
const bindings = new WeakMap<Document, { dispose(): void }>();

/** Prepare only selected media while the learner reads/answers the quiz.
 * Native image/audio loads warm the ordinary browser cache without autoplay. */
export function startLearningMediaWarmup(config: Config, win: any = window) {
  const doc: Document = win.document;
  const noop = { dispose() {} };
  if (!doc || !config?.url || !config.scope || !win.fetch || !win.AbortController) return noop;
  const existing = bindings.get(doc);
  if (existing) return existing;
  const connection = win.navigator?.connection;
  if (connection?.saveData || /^(slow-2g|2g|3g)$/.test(connection?.effectiveType || '')) return noop;
  let url: URL;
  try { url = new URL(config.url, win.location.href); } catch { return noop; }
  if (url.origin !== win.location.origin) return noop;
  const controller = new win.AbortController();
  const retained: (HTMLImageElement | HTMLAudioElement)[] = [];
  let idle: number | undefined;
  let timer: number | undefined;
  let deadline: number | undefined;
  let started = false;
  let stopped = false;
  const source = (value: unknown) => {
    if (typeof value !== 'string' || !value) return '';
    try {
      const parsed = new URL(value, win.location.href);
      return parsed.origin === win.location.origin && /^https?:$/.test(parsed.protocol) ? parsed.href : '';
    } catch { return ''; }
  };
  const run = async () => {
    if (stopped || started || doc.hidden) return;
    started = true;
    deadline = win.setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await win.fetch(url.href, {
        credentials: 'same-origin', priority: 'low', cache: 'no-store',
        headers: { Accept: 'application/json' }, signal: controller.signal,
      });
      if (stopped || !response.ok || !/^application\/json/i.test(response.headers.get('Content-Type') || '')) return;
      const data = await response.json();
      if (stopped || data.scope !== config.scope) return;
      if (doc.hidden) { started = false; return; }
      const acImage = source(data.acTheme?.acImage);
      if (acImage && win.Image) {
        const image: HTMLImageElement = new win.Image();
        image.decoding = 'async';
        image.setAttribute('fetchpriority', 'low');
        image.onload = () => { void image.decode?.().catch(() => {}); };
        retained.push(image);
        image.src = acImage;
      }
      const sound = source(data.acTheme?.themeSound);
      if (sound && win.Audio) {
        const audio: HTMLAudioElement = new win.Audio();
        audio.preload = 'auto';
        audio.autoplay = false;
        retained.push(audio);
        audio.src = sound;
        audio.load();
      }
      const theme = data.editorTheme;
      if (!theme?.badgeId || !Array.isArray(theme.assets)) return;
      // Server selected an authorized, versioned theme. Reject foreign source
      // URLs so a malformed catalog cannot turn this into an arbitrary fetcher.
      if (theme.assets.some((asset) => !source(asset.url))) return;
      const reduced = win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      await prepareScratchpadThemeAssets(theme, { includeVideo: !reduced });
    } catch { /* Decoration never interrupts answering or produces a toast. */ }
    finally { if (deadline !== undefined) win.clearTimeout(deadline); }
  };
  const schedule = () => {
    if (stopped || started || doc.hidden || doc.readyState !== 'complete' || idle !== undefined || timer !== undefined) return;
    const launch = () => { idle = undefined; timer = undefined; void run(); };
    if (win.requestIdleCallback) idle = win.requestIdleCallback(launch, { timeout: 2000 });
    else timer = win.setTimeout(launch, 350);
  };
  const binding = {
    dispose(event?: PageTransitionEvent) {
      if (stopped) return;
      stopped = true;
      controller.abort();
      if (idle !== undefined) win.cancelIdleCallback?.(idle);
      if (timer !== undefined) win.clearTimeout(timer);
      if (deadline !== undefined) win.clearTimeout(deadline);
      win.removeEventListener('load', schedule);
      win.removeEventListener('pagehide', binding.dispose);
      doc.removeEventListener('visibilitychange', schedule);
      for (const media of retained) {
        media.onload = null;
        if ('pause' in media) media.pause();
        media.removeAttribute('src');
      }
      retained.length = 0;
      bindings.delete(doc);
      if (event?.persisted) win.addEventListener('pageshow', (shown: PageTransitionEvent) => {
        if (shown.persisted) startLearningMediaWarmup(config, win);
      }, { once: true });
    },
  };
  bindings.set(doc, binding);
  win.addEventListener('load', schedule, { once: true });
  win.addEventListener('pagehide', binding.dispose, { once: true });
  doc.addEventListener('visibilitychange', schedule);
  schedule();
  return binding;
}
