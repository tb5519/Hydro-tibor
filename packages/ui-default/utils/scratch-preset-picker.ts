import { loadScratchSpritePreview } from './scratch-preset-preview';

type PresetKind = 'sprite' | 'costume' | 'sound' | 'backdrop';
interface PresetItem {
  id: string; title: string; kind: PresetKind; filename: string; mime: string;
  size: number; fileUrl: string; previewUrl?: string;
}
const kinds: Record<PresetKind, string> = { sprite: '角色', costume: '造型', sound: '声音', backdrop: '背景' };

export function createScratchPresetPicker(options: {
  libraryUrl: string;
  send: (type: string, payload?: object, transfer?: Transferable[]) => void;
  onBusy: (busy: boolean) => void;
  onStatus: (text: string, error?: boolean) => void;
}) {
  const dialog = document.createElement('dialog');
  dialog.className = 'scratch-preset-picker';
  dialog.setAttribute('aria-labelledby', 'scratch-preset-title');
  dialog.innerHTML = `<header><div><p>创作百宝箱</p><h2 id="scratch-preset-title">老师素材</h2></div><button type="button" data-close aria-label="关闭老师素材">×</button></header>
    <p class="scratch-preset-intro">挑一个喜欢的，放进你的作品里。</p>
    <div class="scratch-preset-controls"><div class="scratch-preset-tabs" role="group" aria-label="素材分类"></div><input type="search" placeholder="找一找素材" aria-label="搜索老师素材"></div>
    <div class="scratch-preset-feedback" role="status" aria-live="polite"></div>
    <div class="scratch-preset-grid"></div><footer><span data-count></span><button type="button" data-reload>刷新素材</button></footer>`;
  document.body.append(dialog);
  const grid = dialog.querySelector<HTMLElement>('.scratch-preset-grid')!;
  const feedback = dialog.querySelector<HTMLElement>('.scratch-preset-feedback')!;
  const search = dialog.querySelector<HTMLInputElement>('input')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-close]')!;
  const reload = dialog.querySelector<HTMLButtonElement>('[data-reload]')!;
  const count = dialog.querySelector<HTMLElement>('[data-count]')!;
  let items: PresetItem[] = [];
  let kind: PresetKind = 'sprite';
  let targetId: string | undefined;
  let busy = false;
  let loading = false;
  let pending: string | null = null;
  let importSent = false;
  let audio: HTMLAudioElement | null = null;
  let audioItem: string | null = null;
  let audioController: AbortController | null = null;
  let importTimer: ReturnType<typeof setTimeout>;
  let listController: AbortController | null = null;
  const objectUrls = new Map<string, string>();
  const spriteBlobs = new Map<string, Blob>();
  const spriteDownloads = new Map<string, { promise: Promise<Blob>; controller: AbortController }>();
  const importControllers = new Set<AbortController>();
  const previewControllers = new Set<AbortController>();
  const animations = new Map<HTMLImageElement, { frames: string[]; index: number }>();
  const previewDisposers = new Set<() => void>();
  const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let animationTimer: ReturnType<typeof setInterval> | undefined;
  let observer: IntersectionObserver | null = null;
  let fallbackVisibility: (() => void) | null = null;
  let stopped = false;
  let previewGeneration = 0;
  const tabs = new Map<PresetKind, HTMLButtonElement>();
  const sameOrigin = (value: string) => {
    const url = new URL(value, location.href);
    if (url.origin !== location.origin) throw new Error('素材地址无效，请刷新素材列表。');
    return url.href;
  };
  const tell = (message: string, error = false) => {
    feedback.textContent = message;
    feedback.dataset.error = String(error);
  };
  const animate = () => {
    if (animationTimer !== undefined) { clearInterval(animationTimer); animationTimer = undefined; }
    if (motion?.matches) {
      for (const [image, entry] of animations) { entry.index = 0; image.src = entry.frames[0]; }
    }
    if (!animations.size || motion?.matches || document.hidden || !dialog.open || busy || stopped) return;
    animationTimer = setInterval(() => {
      for (const [image, entry] of animations) {
        entry.index = (entry.index + 1) % entry.frames.length;
        image.src = entry.frames[entry.index];
      }
    }, 250);
  };
  const audioState = (button: HTMLButtonElement, playing = false, preparing = false) => {
    button.dataset.playing = String(playing);
    button.dataset.loading = String(preparing);
    button.setAttribute('aria-pressed', String(playing));
    const label = preparing ? '正在准备…' : playing ? '暂停声音' : '播放声音';
    button.querySelector('[data-listen-label]')!.textContent = label;
    button.setAttribute('aria-label', `${label}：${button.dataset.title}`);
    button.disabled = busy || preparing;
  };
  const stopAudio = () => {
    audioController?.abort();
    audioController = null;
    audio?.pause();
    audio?.removeAttribute('src');
    audio = null;
    audioItem = null;
    dialog.querySelectorAll<HTMLButtonElement>('[data-listen]').forEach((button) => {
      audioState(button);
    });
  };
  const clearPreviews = (revoke = false) => {
    observer?.disconnect();
    observer = null;
    previewGeneration += 1;
    for (const controller of previewControllers) if (stopped || !importControllers.has(controller)) controller.abort();
    previewControllers.clear();
    for (const dispose of previewDisposers) dispose();
    previewDisposers.clear();
    animations.clear();
    animate();
    if (fallbackVisibility) {
      grid.removeEventListener('scroll', fallbackVisibility);
      window.removeEventListener('resize', fallbackVisibility);
      fallbackVisibility = null;
    }
    stopAudio();
    if (revoke) {
      for (const url of objectUrls.values()) URL.revokeObjectURL(url);
      objectUrls.clear();
      spriteBlobs.clear();
    }
  };
  const controls = () => {
    close.disabled = busy;
    reload.disabled = busy || loading;
    search.disabled = busy;
    for (const button of tabs.values()) button.disabled = busy;
    grid.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = busy || button.dataset.loading === 'true'; });
    animate();
    options.onBusy(busy);
  };
  const readFile = async (item: PresetItem, controller: AbortController, preview = false) => {
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(sameOrigin(preview ? item.previewUrl || item.fileUrl : item.fileUrl), {
        credentials: 'same-origin', signal: controller.signal,
      });
      if (!response.ok) throw new Error('素材暂时打不开，可能已被老师移除。请刷新素材后重试。');
      if (response.headers.get('content-type')?.includes('text/html')) throw new Error('登录可能已失效，请重新登录后再打开素材。');
      if (Number(response.headers.get('content-length')) > 20 * 1024 * 1024) throw new Error('素材文件太大。');
      const blob = await response.blob();
      if (!blob.size || blob.size > 20 * 1024 * 1024) throw new Error('素材文件大小不符合要求。');
      return blob;
    } finally { clearTimeout(timeout); }
  };
  const objectUrl = async (item: PresetItem, controller: AbortController, preview = false) => {
    const key = `${preview ? 'preview' : 'file'}:${item.id}`;
    if (objectUrls.has(key)) return objectUrls.get(key)!;
    const generation = previewGeneration;
    const blob = await readFile(item, controller, preview);
    if (controller.signal.aborted || generation !== previewGeneration) throw new Error('Preview closed');
    const url = URL.createObjectURL(new Blob([blob], { type: item.mime }));
    objectUrls.set(key, url);
    return url;
  };
  const spriteBlob = (item: PresetItem, controller: AbortController, importing = false) => {
    sameOrigin(item.fileUrl);
    if (spriteBlobs.has(item.id)) return Promise.resolve(spriteBlobs.get(item.id)!);
    const current = spriteDownloads.get(item.id);
    if (current && !current.controller.signal.aborted) {
      if (importing) importControllers.add(current.controller);
      return current.promise;
    }
    const generation = previewGeneration;
    const download = { controller, promise: null as Promise<Blob> };
    download.promise = readFile(item, controller).then((blob) => {
      if (!controller.signal.aborted && generation === previewGeneration) spriteBlobs.set(item.id, blob);
      return blob;
    }).finally(() => {
      if (spriteDownloads.get(item.id) === download) spriteDownloads.delete(item.id);
      importControllers.delete(controller);
    });
    spriteDownloads.set(item.id, download);
    return download.promise;
  };
  const importItem = async (item: PresetItem) => {
    if (busy || !dialog.open) return;
    busy = true;
    pending = crypto.randomUUID();
    importSent = false;
    const requestId = pending;
    stopAudio();
    controls();
    tell(`正在添加「${item.title}」…`);
    const controller = new AbortController();
    importControllers.add(controller);
    try {
      const blob = item.kind === 'sprite' && item.filename.toLowerCase().endsWith('.sprite3')
        ? await spriteBlob(item, controller, true) : await readFile(item, controller);
      const file = await blob.arrayBuffer();
      if (pending !== requestId || stopped) return;
      importSent = true;
      options.send('importPreset', { id: requestId, kind: item.kind, title: item.title,
        filename: item.filename, mime: item.mime, file, targetId }, [file]);
      importTimer = setTimeout(() => tell('这个素材需要多一点时间，正在添加，请不要重复点击。'), 30000);
    } catch (error) {
      if (pending !== requestId || stopped) return;
      pending = null;
      importSent = false;
      busy = false;
      tell(error.name === 'AbortError' ? '下载有点慢，请检查网络后再试一次。' : error.message || '没有添加成功，请再试一次。', true);
      controls();
    } finally { importControllers.delete(controller); }
  };
  const render = () => {
    clearPreviews(true);
    grid.replaceChildren();
    for (const [key, button] of tabs) button.setAttribute('aria-pressed', String(key === kind));
    const query = search.value.trim().toLocaleLowerCase();
    const selected = items.filter((item) => item.kind === kind && (!query || item.title.toLocaleLowerCase().includes(query)));
    count.textContent = `共 ${selected.length} 个${kinds[kind]}`;
    if (!selected.length) {
      const empty = document.createElement('div');
      empty.className = 'scratch-preset-empty';
      const title = document.createElement('strong');
      title.textContent = query ? '没有找到这个素材' : `老师还没有放入${kinds[kind]}`;
      const hint = document.createElement('p');
      hint.textContent = query ? '换个名字找找看。' : '先用 Scratch 自带的素材，老师添加后会出现在这里。';
      empty.append(title, hint);
      grid.append(empty);
      return;
    }
    interface Preview {
      image: HTMLImageElement; item: PresetItem; card: HTMLElement; visible: boolean; queued: boolean;
      controller?: AbortController; release?: () => void; loaded?: boolean;
    }
    const previews = new Map<Element, Preview>();
    const queue: Preview[] = [];
    const generation = previewGeneration;
    let active = 0;
    const release = (entry: Preview) => {
      entry.visible = false;
      entry.queued = false;
      if (entry.controller && (stopped || !importControllers.has(entry.controller))) entry.controller.abort();
      entry.controller = undefined;
      entry.release?.();
      entry.release = undefined;
      entry.loaded = false;
      animations.delete(entry.image);
      entry.image.removeAttribute('src');
      spriteBlobs.delete(entry.item.id);
      const key = `preview:${entry.item.id}`;
      const url = objectUrls.get(key);
      if (url) { URL.revokeObjectURL(url); objectUrls.delete(key); }
      animate();
    };
    const pump = () => {
      if (generation !== previewGeneration || !dialog.open || document.hidden || stopped) return;
      while (active < 3 && queue.length) {
        const entry = queue.shift()!;
        if (!entry.visible || !entry.queued || entry.controller || entry.loaded) continue;
        entry.queued = false;
        const { image, item } = entry;
        const controller = new AbortController();
        entry.controller = controller;
        previewControllers.add(controller);
        active += 1;
        void (async () => {
          const current = () => generation === previewGeneration && entry.visible && entry.controller === controller
            && !controller.signal.aborted && !document.hidden && dialog.open;
          if (item.kind === 'sprite' && item.filename.toLowerCase().endsWith('.sprite3')) {
            const blob = await spriteBlob(item, controller);
            if (!current()) return;
            const preview = await loadScratchSpritePreview(blob, controller.signal);
            if (!current()) { preview.dispose(); return; }
            if (!preview.frames.length) { preview.dispose(); throw new Error('No costumes'); }
            entry.release = preview.dispose;
            image.src = preview.frames[0];
            if (preview.frames.length > 1) animations.set(image, { frames: preview.frames, index: 0 });
          } else {
            const url = await objectUrl(item, controller, true);
            if (!current()) return;
            image.src = url;
          }
          entry.loaded = true;
          image.alt = item.title;
          animate();
        })().catch(() => {
          if (generation === previewGeneration && entry.visible && !controller.signal.aborted) image.alt = '暂时没有预览';
        }).finally(() => {
          previewControllers.delete(controller);
          if (entry.controller === controller) entry.controller = undefined;
          active -= 1;
          pump();
        });
      }
    };
    const visible = (entry: Preview, showing: boolean) => {
      if (!showing) { release(entry); return; }
      entry.visible = true;
      if (!entry.loaded && !entry.controller && !entry.queued) { entry.queued = true; queue.push(entry); }
    };
    if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver((entries) => {
      if (generation !== previewGeneration) return;
      for (const entry of entries) if (previews.has(entry.target)) visible(previews.get(entry.target)!, entry.isIntersecting);
      pump();
    }, { root: grid, threshold: 0.01 });
    for (const item of selected) {
      const card = document.createElement('article');
      card.className = 'scratch-preset-card';
      card.dataset.presetId = item.id;
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'scratch-preset-add';
      add.setAttribute('aria-label', `添加${kinds[kind]}：${item.title}`);
      const picture = document.createElement(item.kind === 'sound' ? 'button' : 'span');
      picture.className = 'scratch-preset-picture';
      if (item.mime.startsWith('image/') || (item.kind === 'sprite' && item.filename.toLowerCase().endsWith('.sprite3'))) {
        const img = document.createElement('img');
        img.alt = item.title;
        picture.append(img);
        const entry: Preview = { image: img, item, card, visible: false, queued: false };
        previews.set(card, entry);
        previewDisposers.add(() => release(entry));
        if (observer) observer.observe(card);
      } else {
        picture.textContent = item.kind === 'sound' ? '♫' : '✦';
        picture.setAttribute('aria-hidden', 'true');
      }
      const title = document.createElement('strong');
      title.className = 'scratch-preset-title';
      title.textContent = item.title;
      title.title = item.title;
      const label = document.createElement('span');
      label.className = 'scratch-preset-add-label';
      label.textContent = '+ 加入作品';
      add.append(label);
      add.addEventListener('click', () => importItem(item));
      card.append(picture, title, add);
      if (item.kind === 'sound') {
        const listen = picture as HTMLButtonElement;
        listen.type = 'button';
        listen.dataset.listen = '';
        listen.dataset.title = item.title;
        listen.classList.add('scratch-preset-listen');
        listen.removeAttribute('aria-hidden');
        listen.innerHTML = '<span class="scratch-preset-sound-icon" aria-hidden="true"><svg viewBox="0 0 32 32" fill="currentColor"><path class="scratch-preset-play-icon" d="M11 6.8a1 1 0 0 1 1.5-.86l15 9.2a1 1 0 0 1 0 1.72l-15 9.2a1 1 0 0 1-1.5-.86Z"/><path class="scratch-preset-pause-icon" d="M8 7h6v18H8zm10 0h6v18h-6z"/></svg></span><span data-listen-label>播放声音</span>';
        audioState(listen);
        listen.addEventListener('click', async () => {
          if (busy) return;
          if (audioItem === item.id && audio) {
            const playing = audio;
            if (!playing.paused) { playing.pause(); audioState(listen); return; }
            try {
              await playing.play();
              if (audio === playing) audioState(listen, true);
            } catch { if (audio === playing) tell('暂时不能试听，可以稍后再试。', true); }
            return;
          }
          stopAudio();
          const controller = new AbortController();
          audioController = controller;
          previewControllers.add(controller);
          const generationNow = previewGeneration;
          audioState(listen, false, true);
          try {
            const url = await objectUrl(item, controller);
            if (generationNow !== previewGeneration || busy || controller.signal.aborted) return;
            const playing = new Audio(url);
            audio = playing;
            audioItem = item.id;
            await playing.play();
            if (audio !== playing || controller.signal.aborted) { playing.pause(); return; }
            audioState(listen, true);
            playing.onended = () => {
              if (audio === playing) { playing.currentTime = 0; audioState(listen); }
            };
          } catch (error) {
            if (!controller.signal.aborted) { tell('暂时不能试听，可以稍后再试。', true); audioState(listen); }
          } finally { previewControllers.delete(controller); listen.disabled = busy || listen.dataset.loading === 'true'; }
        });
      }
      grid.append(card);
    }
    if (!observer) {
      fallbackVisibility = () => {
        const bounds = grid.getBoundingClientRect();
        for (const entry of previews.values()) {
          const rect = entry.card.getBoundingClientRect();
          visible(entry, dialog.open && !document.hidden && rect.bottom > bounds.top && rect.top < bounds.bottom
            && rect.right > bounds.left && rect.left < bounds.right);
        }
        pump();
      };
      grid.addEventListener('scroll', fallbackVisibility, { passive: true });
      window.addEventListener('resize', fallbackVisibility);
      fallbackVisibility();
    }
    pump();
    controls();
  };
  const load = async () => {
    listController?.abort();
    const controller = new AbortController();
    listController = controller;
    loading = true;
    tell('正在打开老师的百宝箱…');
    controls();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(sameOrigin(options.libraryUrl), { credentials: 'same-origin',
        headers: { Accept: 'application/json' }, signal: controller.signal });
      if (!response.ok) throw new Error('素材列表没有打开，请检查是否仍在这个课堂。');
      const data = await response.json();
      if (!Array.isArray(data.items)) throw new Error('素材列表没有打开，请刷新重试。');
      if (listController !== controller || !dialog.open) return;
      items = data.items.filter((item: PresetItem) => item && Object.hasOwn(kinds, item.kind)
        && typeof item.id === 'string' && typeof item.title === 'string'
        && typeof item.fileUrl === 'string' && typeof item.mime === 'string' && typeof item.filename === 'string');
      tell('');
      render();
    } catch (error) {
      if (listController === controller && dialog.open) tell(error.name === 'AbortError'
        ? '网络有点慢，点右下角「刷新素材」再试一次。' : error.message, true);
    } finally {
      clearTimeout(timer);
      if (listController === controller) { loading = false; controls(); }
    }
  };
  for (const [key, label] of Object.entries(kinds)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => { kind = key as PresetKind; tell(''); render(); });
    dialog.querySelector('.scratch-preset-tabs')!.append(button);
    tabs.set(key as PresetKind, button);
  }
  search.addEventListener('input', render);
  reload.addEventListener('click', load);
  close.addEventListener('click', () => { if (!busy) dialog.close(); });
  dialog.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  dialog.addEventListener('close', () => { listController?.abort(); clearPreviews(true); });
  motion?.addEventListener('change', animate);
  document.addEventListener('visibilitychange', () => {
    if (!dialog.open) return;
    if (document.hidden) clearPreviews(true);
    else render();
  });
  window.addEventListener('pagehide', () => {
    stopped = true;
    listController?.abort();
    for (const controller of importControllers) controller.abort();
    importControllers.clear();
    clearTimeout(importTimer);
    // A download can be cancelled. Once the VM has received an import, retain
    // its request lock across BFCache until that exact acknowledgement arrives.
    if (!importSent) { pending = null; busy = false; }
    controls();
    clearPreviews(true);
    if (dialog.open) dialog.close();
  });
  window.addEventListener('pageshow', () => {
    stopped = false;
    if (pending && importSent) {
      if (!dialog.open) dialog.showModal();
      tell('正在完成素材添加，请稍等…');
      importTimer = setTimeout(() => tell('这个素材需要多一点时间，正在添加，请不要重复点击。'), 30000);
    }
    controls();
  });
  return {
    receive(message: { type: string; kind?: PresetKind; targetId?: string; id?: string; message?: string }) {
      if (message.type === 'openPresetLibrary') {
        if (busy || stopped) return true;
        kind = message.kind && Object.hasOwn(kinds, message.kind) ? message.kind : 'sprite';
        targetId = typeof message.targetId === 'string' ? message.targetId : undefined;
        search.value = '';
        render();
        if (!dialog.open) dialog.showModal();
        load();
        return true;
      }
      if (!['presetImported', 'presetImportError'].includes(message.type)) return false;
      if (!pending || message.id !== pending) return true;
      clearTimeout(importTimer);
      pending = null;
      importSent = false;
      busy = false;
      controls();
      if (message.type === 'presetImported') {
        dialog.close();
        options.onStatus('素材已加入，记得点「保存作品」');
      } else tell(message.message || '这个素材没有添加成功，请再试一次。', true);
      return true;
    },
  };
}
