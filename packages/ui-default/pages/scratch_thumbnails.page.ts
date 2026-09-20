import { NamedPage } from 'vj/misc/Page';

interface CoverConfig {
  title: string;
  revision: number;
  thumbnailUrl: string | null;
  projectUrl: string | null;
  canCache: boolean;
  maxFileSize: number;
}

// Existing covers are plain lazy images. Only missing visible covers need a VM;
// share one isolated, read-only instance and never run project scripts for this.
export default new NamedPage(['scratch_main', 'scratch_works', 'scratch_assignment'], () => {
  const cards = [...document.querySelectorAll<HTMLElement>('[data-scratch-thumbnail]')];
  if (!cards.length) return;
  const controller = new AbortController();
  const queue: HTMLElement[] = [];
  let stopped = false;
  let running = false;
  let frame: HTMLIFrameElement | null = null;
  let channel = '';
  let initialized = false;
  let ready: Promise<void> | null = null;
  let readyResolve: (() => void) | null = null;
  let readyReject: ((error: Error) => void) | null = null;
  let readyTimer: ReturnType<typeof setTimeout>;
  let releaseTimer: ReturnType<typeof setTimeout>;
  let pending: { id: string; resolve: (data: string) => void; reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout> } | null = null;
  const localUrl = (value: string) => {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin) throw new Error('封面地址无效');
    return url.href;
  };
  const readResponse = async <T,>(url: string, options: RequestInit, read: (response: Response) => Promise<T>) => {
    if (stopped) throw new Error('页面已离开');
    const request = new AbortController();
    const abort = () => request.abort();
    controller.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 45000);
    try {
      const response = await fetch(localUrl(url), { ...options, credentials: 'same-origin', signal: request.signal });
      if (!response.ok) throw new Error('无法读取封面');
      return await read(response);
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener('abort', abort);
    }
  };
  const release = () => {
    clearTimeout(readyTimer);
    clearTimeout(releaseTimer);
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error('封面生成已结束'));
      pending = null;
    }
    readyReject?.(new Error('封面准备已结束'));
    readyResolve = null;
    readyReject = null;
    frame?.remove();
    frame = null;
    ready = null;
    initialized = false;
  };
  const onMessage = (event: MessageEvent) => {
    if (!frame || event.source !== frame.contentWindow || event.origin !== 'null' || event.data?.channel !== channel) return;
    const message = event.data;
    if (message.type === 'ready') {
      clearTimeout(readyTimer);
      readyResolve?.();
      readyResolve = null;
      readyReject = null;
    } else if (pending && message.id === pending.id && ['thumbnail', 'error'].includes(message.type)) {
      clearTimeout(pending.timer);
      if (message.type === 'thumbnail' && typeof message.thumbnail === 'string'
        && message.thumbnail.length < 2 * 1024 * 1024 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(message.thumbnail)) {
        pending.resolve(message.thumbnail);
      } else pending.reject(new Error('暂时无法生成封面'));
      pending = null;
    }
  };
  window.addEventListener('message', onMessage);
  const prepareFrame = () => {
    if (stopped) return Promise.reject(new Error('页面已离开'));
    clearTimeout(releaseTimer);
    if (ready) return ready;
    ready = new Promise<void>((resolve, reject) => {
      readyResolve = resolve;
      readyReject = reject;
      channel = crypto.randomUUID();
      frame = document.createElement('iframe');
      frame.title = '作品封面生成';
      frame.setAttribute('sandbox', 'allow-scripts');
      frame.setAttribute('aria-hidden', 'true');
      frame.tabIndex = -1;
      frame.referrerPolicy = 'no-referrer';
      frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:480px;height:400px;border:0;pointer-events:none;';
      frame.src = `/scratch-editor/editor.html?lang=zh-cn#channel=${encodeURIComponent(channel)}`;
      document.body.appendChild(frame);
      readyTimer = setTimeout(() => reject(new Error('封面加载超时')), 45000);
    });
    return ready;
  };
  const showImage = (card: HTMLElement, source: string) => {
    const img = card.querySelector<HTMLImageElement>('[data-scratch-thumbnail-image]');
    const placeholder = card.querySelector<HTMLElement>('[data-scratch-thumbnail-placeholder]');
    if (!img) return;
    img.src = source;
    img.hidden = false;
    if (placeholder) placeholder.hidden = true;
  };
  const generate = async (config: CoverConfig) => {
    const project = await Promise.all([prepareFrame(), (async () => {
      if (!config.projectUrl) return undefined;
      const blob = await readResponse(config.projectUrl, {}, (response) => response.blob());
      if (blob.size > config.maxFileSize) throw new Error('作品文件过大');
      return blob.arrayBuffer();
    })()]).then((values) => values[1]);
    if (stopped || !frame) throw new Error('页面已离开');
    return new Promise<string>((resolve, reject) => {
      const id = crypto.randomUUID();
      pending = { id, resolve, reject, timer: setTimeout(() => reject(new Error('封面生成超时')), 30000) };
      frame!.contentWindow?.postMessage({ channel, type: initialized ? 'preview' : 'init',
        id, project, title: config.title, mode: 'thumbnail', readOnly: true }, '*', project ? [project] : []);
      initialized = true;
    });
  };
  const drain = async () => {
    if (running || stopped) return;
    running = true;
    while (queue.length && !stopped) {
      const card = queue.shift()!;
      if (!card.isConnected) continue;
      try {
        const endpoint = localUrl(card.dataset.scratchThumbnail!);
        const config: CoverConfig = await readResponse(endpoint, { headers: { Accept: 'application/json' } }, (response) => response.json());
        if (stopped) break;
        if (config.thumbnailUrl) showImage(card, localUrl(config.thumbnailUrl));
        else {
          const preview = await generate(config);
          if (stopped) break;
          showImage(card, preview);
          if (config.canCache) {
            // A stale/failed cache write never blocks playback or changes a work.
            await readResponse(endpoint, { method: 'POST',
              headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
              body: new URLSearchParams({ revision: String(config.revision), thumbnail: preview }) }, (response) => response.json()).catch(() => {});
          }
        }
      } catch {
        release();
        const placeholder = card.querySelector<HTMLElement>('[data-scratch-thumbnail-placeholder]');
        if (placeholder) placeholder.textContent = '打开作品，看看里面的小世界';
      }
    }
    running = false;
    releaseTimer = setTimeout(release, 15000);
  };
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      observer.unobserve(entry.target);
      queue.push(entry.target as HTMLElement);
    }
    void drain();
  }, { rootMargin: '100px' });
  cards.forEach((card) => observer.observe(card));
  window.addEventListener('pagehide', () => {
    stopped = true;
    observer.disconnect();
    controller.abort();
    release();
    window.removeEventListener('message', onMessage);
  }, { once: true });
});
