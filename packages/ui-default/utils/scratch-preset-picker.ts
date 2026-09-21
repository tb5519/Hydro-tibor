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
  let audio: HTMLAudioElement | null = null;
  let audioController: AbortController | null = null;
  let importTimer: ReturnType<typeof setTimeout>;
  let listController: AbortController | null = null;
  const objectUrls = new Map<string, string>();
  const previewControllers = new Set<AbortController>();
  let observer: IntersectionObserver | null = null;
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
  const stopAudio = () => {
    audioController?.abort();
    audioController = null;
    audio?.pause();
    audio = null;
    dialog.querySelectorAll<HTMLButtonElement>('[data-listen]').forEach((button) => {
      button.textContent = '试听';
      button.dataset.playing = 'false';
    });
  };
  const clearPreviews = (revoke = false) => {
    observer?.disconnect();
    observer = null;
    previewGeneration += 1;
    for (const controller of previewControllers) controller.abort();
    previewControllers.clear();
    stopAudio();
    if (revoke) {
      for (const url of objectUrls.values()) URL.revokeObjectURL(url);
      objectUrls.clear();
    }
  };
  const controls = () => {
    close.disabled = busy;
    reload.disabled = busy || loading;
    search.disabled = busy;
    for (const button of tabs.values()) button.disabled = busy;
    grid.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = busy; });
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
  const importItem = async (item: PresetItem) => {
    if (busy || !dialog.open) return;
    busy = true;
    pending = crypto.randomUUID();
    const requestId = pending;
    stopAudio();
    controls();
    tell(`正在添加「${item.title}」…`);
    try {
      const controller = new AbortController();
      const blob = await readFile(item, controller);
      const file = await blob.arrayBuffer();
      if (pending !== requestId) return;
      options.send('importPreset', { id: requestId, kind: item.kind, title: item.title,
        filename: item.filename, mime: item.mime, file, targetId }, [file]);
      importTimer = setTimeout(() => tell('这个素材需要多一点时间，正在添加，请不要重复点击。'), 30000);
    } catch (error) {
      pending = null;
      busy = false;
      tell(error.name === 'AbortError' ? '下载有点慢，请检查网络后再试一次。' : error.message || '没有添加成功，请再试一次。', true);
      controls();
    }
  };
  const render = () => {
    clearPreviews();
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
    const previews = new Map<Element, { image: HTMLImageElement; item: PresetItem }>();
    const queue: Array<{ image: HTMLImageElement; item: PresetItem }> = [];
    const generation = previewGeneration;
    let active = 0;
    const pump = () => {
      if (generation !== previewGeneration) return;
      while (active < 3 && queue.length) {
        const { image, item } = queue.shift()!;
        const controller = new AbortController();
        previewControllers.add(controller);
        active += 1;
        objectUrl(item, controller, true).then((url) => {
          if (generation === previewGeneration) image.src = url;
        }).catch(() => { image.alt = '暂时没有预览'; }).finally(() => {
          previewControllers.delete(controller);
          active -= 1;
          pump();
        });
      }
    };
    if (typeof IntersectionObserver !== 'undefined') observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting && previews.has(entry.target)) {
        queue.push(previews.get(entry.target)!);
        previews.delete(entry.target);
        observer?.unobserve(entry.target);
      }
      pump();
    }, { root: grid, rootMargin: '100px' });
    for (const item of selected) {
      const card = document.createElement('article');
      card.className = 'scratch-preset-card';
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'scratch-preset-add';
      add.setAttribute('aria-label', `添加${kinds[kind]}：${item.title}`);
      const picture = document.createElement('span');
      picture.className = 'scratch-preset-picture';
      if (item.mime.startsWith('image/')) {
        const img = document.createElement('img');
        img.alt = item.title;
        picture.append(img);
        previews.set(img, { image: img, item });
        if (observer) observer.observe(img);
        else queue.push({ image: img, item });
      } else {
        picture.textContent = item.kind === 'sound' ? '♫' : '✦';
        picture.setAttribute('aria-hidden', 'true');
      }
      const title = document.createElement('strong');
      title.textContent = item.title;
      title.title = item.title;
      const label = document.createElement('span');
      label.className = 'scratch-preset-add-label';
      label.textContent = '+ 加入作品';
      add.append(picture, title, label);
      add.addEventListener('click', () => importItem(item));
      card.append(add);
      if (item.kind === 'sound') {
        const listen = document.createElement('button');
        listen.type = 'button';
        listen.dataset.listen = '';
        listen.className = 'scratch-preset-listen';
        listen.textContent = '试听';
        listen.setAttribute('aria-label', `试听：${item.title}`);
        listen.addEventListener('click', async () => {
          if (busy) return;
          if (listen.dataset.playing === 'true') { stopAudio(); listen.dataset.playing = 'false'; return; }
          stopAudio();
          const controller = new AbortController();
          audioController = controller;
          previewControllers.add(controller);
          const generationNow = previewGeneration;
          listen.disabled = true;
          listen.textContent = '正在准备…';
          try {
            const url = await objectUrl(item, controller);
            if (generationNow !== previewGeneration || busy || controller.signal.aborted) return;
            const playing = new Audio(url);
            audio = playing;
            await playing.play();
            if (audio !== playing || controller.signal.aborted) { playing.pause(); return; }
            listen.textContent = '停止试听';
            listen.dataset.playing = 'true';
            playing.onended = () => { if (audio === playing) stopAudio(); };
          } catch (error) {
            if (!controller.signal.aborted) tell('暂时不能试听，可以稍后再试。', true);
            listen.textContent = '试听';
          } finally { previewControllers.delete(controller); listen.disabled = busy; }
        });
        card.append(listen);
      }
      grid.append(card);
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
        && typeof item.fileUrl === 'string' && typeof item.mime === 'string');
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
  return {
    receive(message: { type: string; kind?: PresetKind; targetId?: string; id?: string; message?: string }) {
      if (message.type === 'openPresetLibrary') {
        if (busy) return true;
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
