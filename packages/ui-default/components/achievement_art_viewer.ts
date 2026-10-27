export interface AchievementArtwork {
  imageUrl: string;
  name: string;
  description: string;
  unlockedAt?: string | Date;
}

interface ArtworkEntry {
  promise: Promise<HTMLImageElement | null>;
  cancel: () => void;
}

const activeViewers = new WeakMap<Document, (restoreFocus: boolean) => void>();
const CACHE_LIMIT = 6;
const LOAD_TIMEOUT_MS = 20_000;
const STATUS_DELAY_MS = 180;
const EXIT_MS = 280;
let nextId = 0;

/** A manual artwork viewer. It never reads, awards or acknowledges achievements. */
export function createAchievementArtworkViewer(doc: Document = document) {
  const win = doc.defaultView!;
  const cache = new Map<string, ArtworkEntry>();
  let disposed = false;
  let current: { url: string; close: (restoreFocus: boolean) => void; leaving: () => boolean } | undefined;

  function imageUrl(value: string) {
    try {
      const url = new URL(value, doc.baseURI);
      return value.trim() && ['http:', 'https:'].includes(url.protocol) ? url.href : '';
    } catch { return ''; }
  }

  function load(url: string) {
    const existing = cache.get(url);
    if (existing) {
      cache.delete(url);
      cache.set(url, existing);
      return existing.promise;
    }
    const image = doc.createElement('img');
    image.className = 'achievement-art-viewer__image';
    image.decoding = 'async';
    image.draggable = false;
    let settled = false;
    let decoding = false;
    let resolve!: (value: HTMLImageElement | null) => void;
    const promise = new Promise<HTMLImageElement | null>((done) => { resolve = done; });
    const usable = () => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
    const finish = (success: boolean) => {
      if (settled) return;
      settled = true;
      win.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
      if (!success) {
        image.removeAttribute('src');
        if (cache.get(url) === entry) cache.delete(url);
      }
      resolve(success ? image : null);
    };
    const timer = win.setTimeout(() => finish(false), LOAD_TIMEOUT_MS);
    const entry: ArtworkEntry = {
      promise,
      cancel: () => { finish(false); image.removeAttribute('src'); },
    };
    const loaded = () => {
      if (settled || decoding) return;
      if (!usable()) { finish(false); return; }
      decoding = true;
      try {
        if (image.decode) void image.decode().then(() => finish(usable()), () => finish(false));
        else finish(true);
      } catch { finish(false); }
    };
    image.onload = loaded;
    image.onerror = () => finish(false);
    cache.set(url, entry);
    while (cache.size > CACHE_LIMIT) {
      const oldest = [...cache.keys()].find((key) => key !== current?.url && key !== url);
      if (!oldest) break;
      const removed = cache.get(oldest)!;
      cache.delete(oldest);
      removed.cancel();
    }
    image.src = url;
    if (image.complete) loaded();
    return promise;
  }

  function preload(value: string) {
    if (disposed) return;
    const url = imageUrl(value);
    if (url) void load(url);
  }

  function open(artwork: AchievementArtwork, trigger?: HTMLElement) {
    if (disposed || doc.querySelector('.achievement-reveal')) return;
    const url = imageUrl(artwork.imageUrl);
    if (current?.url === url && !current.leaving()) return;
    activeViewers.get(doc)?.(false);
    const previousFocus = trigger || doc.activeElement as HTMLElement | null;
    const bodyOverflow = doc.body.style.overflow;
    const htmlOverflow = doc.documentElement.style.overflow;
    const reducedMotion = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const dialog = doc.createElement('dialog');
    dialog.className = 'achievement-art-viewer is-loading';
    dialog.tabIndex = -1;
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-busy', 'true');
    const id = `achievement-artwork-${++nextId}`;
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-description ${id}-hint`);
    const element = <K extends keyof HTMLElementTagNameMap>(tag: K, suffix: string, text?: string) => {
      const node = doc.createElement(tag);
      node.className = `achievement-art-viewer__${suffix}`;
      if (text) node.textContent = text;
      return node;
    };
    const ambient = element('div', 'ambient');
    ambient.setAttribute('aria-hidden', 'true');
    const content = element('div', 'content');
    const art = element('div', 'art');
    const status = element('span', 'status');
    status.hidden = true;
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    art.append(status);
    const copy = element('div', 'copy');
    const title = element('h2', 'title', artwork.name);
    title.id = `${id}-title`;
    const description = element('p', 'description', artwork.description);
    description.id = `${id}-description`;
    const date = element('p', 'date');
    const timestamp = artwork.unlockedAt ? new Date(artwork.unlockedAt) : undefined;
    date.hidden = !timestamp || !Number.isFinite(timestamp.getTime());
    if (!date.hidden) date.textContent = `点亮于 ${timestamp!.toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
    })}`;
    copy.append(element('span', 'eyebrow', 'ACHIEVEMENT'), title, description, date);
    const hint = element('p', 'hint', '点击任意处，或按任意键收起');
    hint.id = `${id}-hint`;
    content.append(art, copy, hint);
    dialog.append(ambient, content);
    doc.body.append(dialog);

    let finished = false;
    let leaving = false;
    let armed = false;
    let exitTimer: number | undefined;
    let artworkFrame: number | undefined;
    const background: Array<{ node: HTMLElement; inert: boolean; hidden: string | null }> = [];
    // Native modal dialogs provide the top layer and platform inert handling.
    // The fallback also traps input/focus when a browser lacks inert support.
    try {
      if (typeof dialog.showModal !== 'function') throw new Error('Modal dialogs unavailable');
      dialog.showModal();
    } catch {
      dialog.setAttribute('open', '');
      dialog.setAttribute('role', 'dialog');
      dialog.setAttribute('data-fallback', '');
      for (const child of Array.from(doc.body.children)) {
        if (child === dialog) continue;
        const node = child as HTMLElement;
        background.push({ node, inert: node.inert, hidden: node.getAttribute('aria-hidden') });
        node.inert = true;
        node.setAttribute('aria-hidden', 'true');
      }
    }
    doc.body.style.overflow = 'hidden';
    doc.documentElement.style.overflow = 'hidden';
    dialog.focus({ preventScroll: true });

    const statusTimer = win.setTimeout(() => {
      if (finished || leaving || !dialog.classList.contains('is-loading')) return;
      status.textContent = '正在载入高清原图…';
      status.hidden = false;
    }, STATUS_DELAY_MS);
    const frame = win.requestAnimationFrame(() => {
      if (!finished && !leaving) dialog.classList.add('is-visible');
    });
    const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const cleanup = (restoreFocus: boolean) => {
      if (finished) return;
      finished = true;
      win.clearTimeout(statusTimer);
      win.clearTimeout(exitTimer);
      win.cancelAnimationFrame(frame);
      if (artworkFrame !== undefined) win.cancelAnimationFrame(artworkFrame);
      doc.removeEventListener('click', onClick, true);
      doc.removeEventListener('auxclick', onClick, true);
      doc.removeEventListener('contextmenu', onClick, true);
      doc.removeEventListener('keydown', onKey, true);
      doc.removeEventListener('keyup', block, true);
      doc.removeEventListener('pointerdown', block, true);
      doc.removeEventListener('pointerup', block, true);
      doc.removeEventListener('focusin', onFocus, true);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClose);
      if (typeof dialog.close === 'function' && dialog.open) {
        try { dialog.close(); } catch { /* A fallback dialog need not be registered as modal. */ }
      }
      dialog.remove();
      for (const { node, inert, hidden } of background) {
        node.inert = inert;
        if (hidden === null) node.removeAttribute('aria-hidden');
        else node.setAttribute('aria-hidden', hidden);
      }
      doc.body.style.overflow = bodyOverflow;
      doc.documentElement.style.overflow = htmlOverflow;
      if (current?.close === cleanup) current = undefined;
      if (activeViewers.get(doc) === cleanup) activeViewers.delete(doc);
      if (restoreFocus && previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    };
    const dismiss = () => {
      if (!armed || finished || leaving) return;
      leaving = true;
      win.clearTimeout(statusTimer);
      if (artworkFrame !== undefined) win.cancelAnimationFrame(artworkFrame);
      dialog.classList.add('is-leaving');
      exitTimer = win.setTimeout(() => cleanup(true), reducedMotion ? 60 : EXIT_MS);
    };
    const onClick = (event: Event) => { block(event); dismiss(); };
    const onKey = (event: KeyboardEvent) => {
      block(event);
      if (!event.repeat && !event.isComposing && !['Shift', 'Control', 'Alt', 'Meta', 'AltGraph'].includes(event.key)) dismiss();
    };
    const onFocus = (event: FocusEvent) => {
      if (!dialog.contains(event.target as Node)) dialog.focus({ preventScroll: true });
    };
    const onCancel = (event: Event) => { block(event); dismiss(); };
    const onClose = () => cleanup(true);
    doc.addEventListener('click', onClick, true);
    doc.addEventListener('auxclick', onClick, true);
    doc.addEventListener('contextmenu', onClick, true);
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('keyup', block, true);
    doc.addEventListener('pointerdown', block, true);
    doc.addEventListener('pointerup', block, true);
    doc.addEventListener('focusin', onFocus, true);
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClose);
    current = { url, close: cleanup, leaving: () => leaving };
    activeViewers.set(doc, cleanup);
    // Ignore the event that opened the layer, even if open() was called from
    // an ancestor's capture listener. Subsequent input can close while loading.
    void Promise.resolve().then(() => { armed = true; });
    void (url ? load(url) : Promise.resolve(null)).then((image) => {
      if (finished || leaving) return;
      win.clearTimeout(statusTimer);
      dialog.classList.remove('is-loading');
      dialog.setAttribute('aria-busy', 'false');
      if (image) {
        image.alt = artwork.name;
        status.hidden = true;
        art.append(image);
        // Let the inserted image paint in its initial state before transitioning
        // to ready. Cached artwork follows the same two frames without a spinner.
        artworkFrame = win.requestAnimationFrame(() => {
          if (finished || leaving) return;
          artworkFrame = win.requestAnimationFrame(() => {
            artworkFrame = undefined;
            if (!finished && !leaving) dialog.classList.add('is-ready');
          });
        });
      } else {
        dialog.classList.add('is-error');
        status.textContent = '高清图片暂时无法加载';
        status.hidden = false;
        hint.textContent = '点击或按键收起，重新点开即可重试';
      }
    });
  }

  function onPageHide() {
    current?.close(false);
    for (const entry of cache.values()) entry.cancel();
    cache.clear();
  }
  win.addEventListener('pagehide', onPageHide);
  function dispose() {
    if (disposed) return;
    disposed = true;
    onPageHide();
    win.removeEventListener('pagehide', onPageHide);
  }
  return { preload, open, dispose };
}
