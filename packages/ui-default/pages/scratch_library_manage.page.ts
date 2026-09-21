import { NamedPage } from 'vj/misc/Page';
import { loadScratchSpritePreview } from '../utils/scratch-preset-preview';

type Kind = 'sprite' | 'costume' | 'sound' | 'backdrop';
interface Preset {
  id: string; title: string; kind: Kind; filename: string; mime: string; size: number;
  fileUrl: string; previewUrl?: string;
}
interface Upload {
  file: File | null; title: string; kind: Kind; row: HTMLElement;
  state: 'pending' | 'uploading' | 'success' | 'error' | 'unknown' | 'invalid';
}
const labels: Record<Kind, string> = { sprite: '角色', costume: '造型', sound: '声音', backdrop: '背景' };
const images = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
const extensions: Record<Kind, string[]> = { sprite: ['sprite3', ...images], costume: images, sound: ['mp3', 'wav'], backdrop: images };
const previewMimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'audio/mpeg', 'audio/wav', 'audio/x-wav']);
const fileSize = (size: number) => size < 1024 * 1024 ? `${Math.max(0.1, size / 1024).toFixed(1)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

export default new NamedPage('scratch_library_manage', () => {
  const root = document.querySelector<HTMLElement>('[data-scratch-library-manage]');
  if (!root || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';
  const find = <T extends HTMLElement,>(selector: string) => root.querySelector<T>(selector)!;
  const grid = find<HTMLElement>('[data-library-grid]');
  const template = find<HTMLTemplateElement>('[data-library-card-template]');
  const search = find<HTMLInputElement>('[data-library-search]');
  const uploadDialog = find<HTMLDialogElement>('[data-library-upload-dialog]');
  const editDialog = find<HTMLDialogElement>('[data-library-edit-dialog]');
  const picker = find<HTMLInputElement>('[data-library-files]');
  const uploadKind = find<HTMLSelectElement>('[data-library-upload-kind]');
  const uploadStart = find<HTMLButtonElement>('[data-library-upload-start]');
  const editForm = find<HTMLFormElement>('[data-library-edit-form]');
  const editName = find<HTMLInputElement>('[data-library-edit-name]');
  const editSubmit = find<HTMLButtonElement>('[data-library-edit-submit]');
  const maxSize = Math.min(Number(root.dataset.maxFileSize) || 20971520, 20971520);
  const items = new Map<string, { item: Preset; card: HTMLElement }>();
  const uploads: Upload[] = [];
  const controllers = new Set<AbortController>();
  const previewQueue: string[] = [];
  const previews = new Map<string, { state: string; url?: string; frames?: string[]; frame?: number; dispose?: () => void; controller?: AbortController }>();
  const visiblePreviews = new Set<string>();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let animation: number | undefined;
  let selected: Kind = 'sprite';
  let uploading = false;
  let currentUpload: XMLHttpRequest | null = null;
  let stopped = false;
  let previewCount = 0;
  let refreshing = false;
  let editing: { id: string; operation: 'rename' | 'delete'; trigger: HTMLElement } | null = null;
  let saving = false;
  let uploadTrigger: HTMLElement | null = null;
  let mutations = 0;

  const localUrl = (value: string) => {
    const url = new URL(value, location.href);
    if (!value || url.origin !== location.origin || !['http:', 'https:'].includes(url.protocol)) throw new Error('素材地址无效，请刷新页面。');
    return url.href;
  };
  const uploadUrl = localUrl(root.dataset.uploadUrl || '');
  const listUrl = localUrl(root.dataset.listUrl || '');
  const message = (node: HTMLElement, value: string, error = false) => {
    node.textContent = value;
    node.hidden = !value;
    node.dataset.error = String(error);
  };
  const pageMessage = (value: string, error = false) => message(find('[data-library-status]'), value, error);
  const responseError = (result: any) => {
    // Hydro sends a message format plus params; validation's third param is
    // the actionable reason (for example a corrupt PNG), not an interpolated message.
    if (typeof result?.error?.params?.[2] === 'string' && result.error.params[2].trim()) return result.error.params[2];
    const text = result?.error?.message || result?.message;
    return typeof text === 'string' && !/\{\d+\}/.test(text) ? text : '操作没有完成，请检查文件和权限后重试。';
  };
  const normalize = (raw: any): Preset => {
    if (!raw || typeof raw.id !== 'string' || !raw.id || typeof raw.title !== 'string' || !Object.hasOwn(labels, raw.kind)
      || typeof raw.filename !== 'string' || typeof raw.mime !== 'string' || !Number.isFinite(Number(raw.size)) || Number(raw.size) < 0) {
      throw new Error('素材信息不完整，请刷新素材库。');
    }
    return { ...raw, size: Number(raw.size), fileUrl: localUrl(raw.fileUrl), previewUrl: raw.previewUrl ? localUrl(raw.previewUrl) : undefined };
  };
  const request = async (url: string, body?: URLSearchParams) => {
    const controller = new AbortController();
    controllers.add(controller);
    const timer = window.setTimeout(() => controller.abort(), 45000);
    try {
      const response = await fetch(localUrl(url), {
        method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, ...(body ? { body } : {}),
      });
      const result = await response.json();
      if (!response.ok || result.ok === false) throw new Error(responseError(result));
      return result;
    } finally { clearTimeout(timer); controllers.delete(controller); }
  };
  const discardPreview = (id: string) => {
    const preview = previews.get(id);
    preview?.controller?.abort();
    preview?.dispose?.();
    if (preview?.url) URL.revokeObjectURL(preview.url);
    previews.delete(id);
    const card = items.get(id)?.card;
    card?.querySelectorAll<HTMLMediaElement | HTMLImageElement>('audio, img').forEach((media) => {
      if (media instanceof HTMLMediaElement) media.pause();
      media.removeAttribute('src');
      media.hidden = true;
    });
    if (card) card.querySelector<HTMLElement>('[data-library-placeholder]')!.hidden = false;
  };
  const animatePreviews = () => {
    if (animation !== undefined) window.clearInterval(animation);
    animation = undefined;
    if (stopped || document.hidden || reducedMotion?.matches) return;
    if (![...visiblePreviews].some((id) => (previews.get(id)?.frames?.length || 0) > 1)) return;
    animation = window.setInterval(() => {
      for (const id of visiblePreviews) {
        const preview = previews.get(id);
        const card = items.get(id)?.card;
        if (!card || card.hidden || !preview?.frames || preview.frames.length < 2) continue;
        preview.frame = ((preview.frame || 0) + 1) % preview.frames.length;
        card.querySelector<HTMLImageElement>('img')!.src = preview.frames[preview.frame];
      }
    }, 250);
  };
  const setCard = (item: Preset) => {
    const previous = items.get(item.id);
    const card = previous?.card || template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    if (previous && previous.item.fileUrl !== item.fileUrl) discardPreview(item.id);
    Object.assign(card.dataset, {
      id: item.id, title: item.title, kind: item.kind, filename: item.filename,
      mime: item.mime, size: String(item.size), fileUrl: item.fileUrl, previewUrl: item.previewUrl || '',
    });
    card.querySelector('[data-library-title]')!.textContent = item.title;
    const filename = card.querySelector<HTMLElement>('[data-library-filename]')!;
    filename.textContent = item.filename;
    filename.title = item.filename;
    card.querySelector('[data-library-size]')!.textContent = fileSize(item.size);
    card.querySelector('use')?.setAttribute('href', `#scl-icon-${item.kind}`);
    card.querySelector('[data-library-preview-label]')!.textContent = item.kind === 'sound' ? '点击试听'
      : item.filename.toLowerCase().endsWith('.sprite3') ? 'Scratch 角色包' : '素材预览';
    const image = card.querySelector<HTMLImageElement>('[data-library-image]')!;
    image.alt = item.title;
    card.querySelector('audio')!.setAttribute('aria-label', item.title);
    const previewButton = card.querySelector<HTMLButtonElement>('[data-library-action=preview]')!;
    if (!previews.has(item.id)) previewButton.hidden = item.kind !== 'sound';
    card.querySelector('[data-library-action=rename]')!.setAttribute('aria-label', `重命名 ${item.title}`);
    card.querySelector('[data-library-action=delete]')!.setAttribute('aria-label', `删除 ${item.title}`);
    items.set(item.id, previous ? Object.assign(previous, { item }) : { item, card });
    if (!previous) grid.append(card);
  };

  const loadPreview = async (id: string) => {
    const entry = items.get(id);
    if (!entry || stopped) return;
    const { item, card } = entry;
    const controller = new AbortController();
    controllers.add(controller);
    const timer = window.setTimeout(() => controller.abort(), 180000);
    const button = card.querySelector<HTMLButtonElement>('[data-library-action=preview]')!;
    button.disabled = true;
    const pending = { state: 'loading', controller };
    previews.set(id, pending);
    card.querySelector('[data-library-preview-label]')!.textContent = '正在加载预览…';
    try {
      const sprite = item.kind === 'sprite' && item.filename.toLowerCase().endsWith('.sprite3');
      if ((!sprite && !previewMimes.has(item.mime)) || item.size > maxSize) throw new Error('无法预览此文件');
      const response = await fetch(localUrl(item.previewUrl || item.fileUrl), { credentials: 'same-origin', signal: controller.signal });
      if (!response.ok || /text\/html/i.test(response.headers.get('Content-Type') || '')) throw new Error('预览暂时无法加载');
      const blob = await response.blob();
      if (blob.size > maxSize || !blob.size) throw new Error('预览文件过大或为空');
      if (stopped || previews.get(id) !== pending || items.get(id) !== entry) return;
      const preview = sprite ? await loadScratchSpritePreview(blob, controller.signal) : null;
      if (stopped || previews.get(id) !== pending || items.get(id) !== entry) { preview?.dispose(); return; }
      const url = preview?.frames[0] || URL.createObjectURL(new Blob([blob], { type: item.mime }));
      previews.set(id, preview ? { state: 'ready', ...preview, frame: 0 } : { state: 'ready', url });
      if (item.kind === 'sound') {
        const audio = card.querySelector<HTMLAudioElement>('audio')!;
        audio.src = url;
        audio.hidden = false;
        card.querySelector('[data-library-preview-label]')!.textContent = '准备好试听了';
      } else {
        const image = card.querySelector<HTMLImageElement>('img')!;
        image.src = url;
        image.hidden = false;
        card.querySelector<HTMLElement>('[data-library-placeholder]')!.hidden = true;
      }
      button.hidden = true;
      animatePreviews();
    } catch {
      if (stopped || previews.get(id) !== pending || items.get(id) !== entry) return;
      previews.set(id, { state: 'error' });
      card.querySelector('[data-library-preview-label]')!.textContent = '预览未加载，可重试';
      button.textContent = item.kind === 'sound' ? '重新加载声音' : '重新加载预览';
      button.hidden = false;
    } finally { button.disabled = false; clearTimeout(timer); controllers.delete(controller); }
  };
  const pumpPreviews = () => {
    if (stopped) return;
    while (previewCount < 2 && previewQueue.length) {
      const id = previewQueue.shift()!;
      const entry = items.get(id);
      if (previews.get(id)?.state !== 'queued') continue;
      if (!entry || entry.card.hidden) { previews.delete(id); continue; }
      previewCount++;
      void loadPreview(id).finally(() => { previewCount--; pumpPreviews(); });
    }
  };
  const queuePreview = (id: string) => {
    if (previews.has(id) || stopped) return;
    previews.set(id, { state: 'queued' });
    previewQueue.push(id);
    pumpPreviews();
  };
  const observer = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const id = (entry.target as HTMLElement).dataset.id!;
      if (entry.isIntersecting) { visiblePreviews.add(id); queuePreview(id); }
      else {
        visiblePreviews.delete(id);
        if (items.get(id)?.item.filename.toLowerCase().endsWith('.sprite3')) discardPreview(id);
      }
    });
    animatePreviews();
  }) : null;
  const render = () => {
    const term = search.value.trim().toLocaleLowerCase();
    const counts = { sprite: 0, costume: 0, sound: 0, backdrop: 0 };
    let shown = 0;
    for (const { item, card } of items.values()) {
      counts[item.kind]++;
      card.hidden = item.kind !== selected || !`${item.title}\n${item.filename}`.toLocaleLowerCase().includes(term);
      observer?.unobserve(card);
      if (!card.hidden) {
        shown++;
        if (item.kind !== 'sound' && (item.mime.startsWith('image/') || item.filename.toLowerCase().endsWith('.sprite3'))) {
          if (observer) observer.observe(card);
          else {
            visiblePreviews.add(item.id);
            const button = card.querySelector<HTMLButtonElement>('[data-library-action=preview]')!;
            if (!previews.has(item.id)) { button.hidden = false; button.textContent = '查看预览'; }
          }
        }
      } else {
        visiblePreviews.delete(item.id);
        card.querySelector<HTMLAudioElement>('audio')?.pause();
        if (item.filename.toLowerCase().endsWith('.sprite3')) discardPreview(item.id);
      }
    }
    root.querySelectorAll<HTMLElement>('[data-library-count]').forEach((node) => { node.textContent = String(counts[node.dataset.libraryCount!]); });
    root.querySelectorAll<HTMLElement>('[data-library-kind]').forEach((node) => node.setAttribute('aria-pressed', String(node.dataset.libraryKind === selected)));
    find('[data-library-results]').textContent = `${labels[selected]} · ${shown} 个素材${term ? `（共 ${counts[selected]} 个）` : ''}`;
    find('[data-library-empty]').hidden = shown > 0;
    find('[data-library-empty-title]').textContent = term ? '没有找到匹配的素材' : `还没有${labels[selected]}素材`;
    find('[data-library-empty-message]').textContent = term ? '换个名称或文件名再试试，也可以查看其他分类。' : `上传${labels[selected]}，孩子们就能在编辑器里选用啦。`;
    find('[data-library-clear-search]').hidden = !term;
    pumpPreviews();
    animatePreviews();
  };
  for (const card of grid.querySelectorAll<HTMLElement>('[data-library-card]')) {
    try {
      const item = normalize({ ...card.dataset, fileUrl: card.dataset.fileUrl, previewUrl: card.dataset.previewUrl });
      items.set(item.id, { item, card });
      setCard(item);
    } catch { card.remove(); pageMessage('部分素材信息无法读取，请刷新素材库。', true); }
  }
  const refresh = async () => {
    if (refreshing || stopped) return;
    refreshing = true;
    const button = find<HTMLButtonElement>('[data-library-refresh]');
    button.disabled = true;
    pageMessage('正在刷新素材库…');
    const revision = mutations;
    try {
      const result = await request(listUrl);
      if (!Array.isArray(result.items)) throw new Error('素材列表未能读取，请刷新页面后重试。');
      const fresh = result.items.map(normalize);
      if (stopped) return;
      if (revision !== mutations) { pageMessage('素材已有新改动，请再次刷新以查看最新列表。'); return; }
      const ids = new Set(fresh.map((item: Preset) => item.id));
      for (const [id, { card }] of items) if (!ids.has(id)) { discardPreview(id); observer?.unobserve(card); card.remove(); items.delete(id); }
      fresh.forEach(setCard);
      render();
      pageMessage('素材库已刷新。');
    } catch (error) { if (!stopped) pageMessage(error.message || '暂时无法刷新，请重试。', true); }
    finally { refreshing = false; button.disabled = false; }
  };

  const updateUploads = () => {
    find('[data-library-queue-count]').textContent = String(uploads.length);
    find('[data-library-queue-empty]').hidden = uploads.length > 0;
    find('[data-library-clear-completed]').hidden = !uploads.some((item) => item.state === 'success');
    uploadStart.disabled = uploading || !uploads.some((item) => item.state === 'pending');
    uploadStart.textContent = uploading ? '正在逐个上传…' : uploads.some((item) => item.state === 'success') ? '上传待处理素材' : '开始上传';
    picker.disabled = uploading;
    uploadKind.disabled = uploading;
  };
  const setUpload = (entry: Upload, state: Upload['state'], text: string) => {
    entry.state = state;
    entry.row.dataset.state = state;
    const status = entry.row.querySelector<HTMLElement>('[data-upload-result]')!;
    status.textContent = text;
    entry.row.querySelector<HTMLInputElement>('input')!.disabled = ['uploading', 'success', 'unknown', 'invalid'].includes(state);
    entry.row.querySelector<HTMLElement>('[data-upload-retry]')!.hidden = state !== 'error';
    entry.row.querySelector<HTMLElement>('[data-upload-remove]')!.hidden = state === 'uploading';
    entry.row.querySelector<HTMLElement>('progress')!.hidden = state !== 'uploading';
    updateUploads();
  };
  const uploadOne = (entry: Upload) => new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    currentUpload = xhr;
    let settled = false;
    const finish = (state: Upload['state'], text: string) => {
      if (settled) return;
      settled = true;
      if (currentUpload === xhr) currentUpload = null;
      setUpload(entry, state, text);
      if (state === 'success') entry.file = null;
      resolve();
    };
    const unknown = () => finish('unknown', '结果待确认：请刷新素材库核实是否已上传，避免重复添加。');
    xhr.open('POST', uploadUrl);
    xhr.timeout = 10 * 60 * 1000;
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable || settled) return;
      const percent = Math.min(100, Math.round(event.loaded / event.total * 100));
      entry.row.querySelector<HTMLProgressElement>('progress')!.value = percent;
      entry.row.querySelector('[data-upload-result]')!.textContent = percent === 100 ? '文件已发送，正在保存…' : `正在上传 ${percent}%`;
    };
    xhr.onload = () => {
      let result: any;
      try { result = JSON.parse(xhr.responseText); } catch { unknown(); return; }
      if (xhr.status >= 200 && xhr.status < 300 && result.ok === true) {
        try {
          setCard(normalize(result.item));
          mutations++;
          render();
          finish('success', '上传成功');
        } catch { unknown(); }
      } else if (xhr.status >= 400 && xhr.status < 500) finish('error', responseError(result));
      else unknown();
    };
    xhr.onerror = unknown;
    xhr.ontimeout = unknown;
    xhr.onabort = unknown;
    const form = new FormData();
    form.append('kind', entry.kind);
    form.append('title', entry.title);
    form.append('file', entry.file!);
    try { xhr.send(form); } catch { unknown(); }
  });
  const runUploads = async () => {
    if (uploading || stopped) return;
    uploading = true;
    updateUploads();
    message(find('[data-library-upload-status]'), '正在逐个上传。可以关闭这个窗口，但请保持当前页面打开。');
    try {
      let entry = uploads.find((item) => item.state === 'pending');
      while (entry && !stopped) {
        const name = entry.row.querySelector<HTMLInputElement>('input')!;
        entry.title = name.value.trim();
        name.value = entry.title;
        if (!entry.title || entry.title.length > 120) {
          setUpload(entry, 'error', '请填写 1～120 字的素材名称，再重试。');
        } else {
          setUpload(entry, 'uploading', '正在上传…');
          pageMessage(`正在上传「${entry.title}」…`);
          await uploadOne(entry);
        }
        entry = uploads.find((item) => item.state === 'pending');
      }
    } finally {
      uploading = false;
      updateUploads();
      if (!stopped) {
        const success = uploads.filter((item) => item.state === 'success').length;
        const issues = uploads.filter((item) => ['error', 'invalid', 'unknown'].includes(item.state)).length;
        const text = `本次上传：${success} 个成功${issues ? `，${issues} 个需要查看结果` : ''}。`;
        message(find('[data-library-upload-status]'), text, issues > 0);
        pageMessage(text, issues > 0);
      }
    }
  };
  const fileHelp = () => {
    const kind = uploadKind.value as Kind;
    picker.accept = extensions[kind].map((ext) => `.${ext}`).join(',');
    find('[data-library-file-help]').textContent = kind === 'sound' ? '支持 MP3、WAV 声音，单个不超过 20MB。'
      : `${kind === 'sprite' ? '支持 .sprite3 角色包和 ' : '支持 '}PNG、JPG、WebP、SVG 图片，单个不超过 20MB。`;
  };
  picker.addEventListener('change', () => {
    for (const file of Array.from(picker.files || [])) {
      const kind = uploadKind.value as Kind;
      const row = document.createElement('li');
      row.className = 'scl-upload-row';
      row.innerHTML = '<label class="scl-field"><span data-upload-file></span><input maxlength="120" required autocomplete="off"></label><div class="scl-upload-row__result"><span data-upload-result role="status"></span><progress max="100" value="0" hidden aria-label="上传进度"></progress><div><button class="scl-button scl-button--quiet" type="button" data-upload-retry hidden>重试此项</button><button class="scl-button scl-button--quiet" type="button" data-upload-remove>移除</button></div></div>';
      row.querySelector('[data-upload-file]')!.textContent = `${labels[kind]} · ${file.name} · ${fileSize(file.size)}`;
      const title = (file.name.replace(/\.[^.]+$/, '') || file.name).slice(0, 120);
      const input = row.querySelector('input')!;
      input.value = title;
      input.setAttribute('aria-label', `${file.name} 的素材名称`);
      const entry: Upload = { file, title, kind, row, state: 'pending' };
      uploads.push(entry);
      find('[data-library-queue]').append(row);
      const ext = file.name.split('.').pop()!.toLowerCase();
      if (!extensions[kind].includes(ext)) setUpload(entry, 'invalid', `这种文件不能添加到${labels[kind]}，请换一个文件或分类。`);
      else if (!file.size || file.size > maxSize) setUpload(entry, 'invalid', !file.size ? '文件为空，请重新选择。' : '文件超过 20MB，请缩小后再上传。');
      else setUpload(entry, 'pending', '等待上传');
      row.querySelector('[data-upload-remove]')!.addEventListener('click', () => {
        if (entry.state === 'uploading') return;
        uploads.splice(uploads.indexOf(entry), 1);
        entry.file = null;
        row.remove();
        updateUploads();
      });
      row.querySelector('[data-upload-retry]')!.addEventListener('click', () => {
        if (entry.state !== 'error' || stopped) return;
        setUpload(entry, 'pending', '等待重试');
        void runUploads();
      });
    }
    picker.value = '';
    updateUploads();
  });
  uploadKind.addEventListener('change', fileHelp);
  uploadStart.addEventListener('click', () => { void runUploads(); });
  find('[data-library-clear-completed]').addEventListener('click', () => {
    for (let index = uploads.length - 1; index >= 0; index--) if (uploads[index].state === 'success') {
      uploads[index].row.remove();
      uploads.splice(index, 1);
    }
    updateUploads();
  });
  root.querySelectorAll<HTMLElement>('[data-library-upload-open]').forEach((button) => button.addEventListener('click', () => {
    uploadTrigger = button;
    if (!uploading) { uploadKind.value = selected; fileHelp(); }
    uploadDialog.showModal();
  }));
  for (const dialog of [uploadDialog, editDialog]) {
    dialog.querySelectorAll<HTMLElement>('[data-library-dialog-close]').forEach((button) => button.addEventListener('click', () => { if (dialog !== editDialog || !saving) dialog.close(); }));
    dialog.addEventListener('cancel', (event) => { if (dialog === editDialog && saving) event.preventDefault(); });
    dialog.addEventListener('close', () => { (dialog === uploadDialog ? uploadTrigger : editing?.trigger)?.focus(); });
  }
  grid.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-library-action]');
    const card = button?.closest<HTMLElement>('[data-library-card]');
    const entry = card && items.get(card.dataset.id!);
    if (!button || !entry || saving) return;
    const operation = button.dataset.libraryAction;
    if (operation === 'preview') { discardPreview(entry.item.id); queuePreview(entry.item.id); return; }
    if (operation !== 'rename' && operation !== 'delete') return;
    editing = { id: entry.item.id, operation, trigger: button };
    find('[data-library-edit-heading]').textContent = operation === 'delete' ? '删除这个素材？' : '重命名素材';
    find('[data-library-edit-description]').textContent = operation === 'delete'
      ? `「${entry.item.title}」将从本域素材库移除。已经加入学生作品的内容不受影响。` : '修改显示名称，原文件内容保持不变。';
    find('[data-library-edit-field]').hidden = operation === 'delete';
    editName.disabled = operation === 'delete';
    editName.value = entry.item.title;
    editName.setCustomValidity('');
    editSubmit.textContent = operation === 'delete' ? '确认删除' : '保存名称';
    editSubmit.classList.toggle('scl-button--delete', operation === 'delete');
    message(find('[data-library-edit-status]'), '');
    editDialog.showModal();
    if (operation === 'rename') { editName.focus(); editName.select(); }
  });
  editName.addEventListener('input', () => editName.setCustomValidity(''));
  // This reusable async dialog has its own in-flight lock. The legacy document
  // submit-click throttle would also block a different action opened within 5s.
  editSubmit.addEventListener('click', (event) => event.stopPropagation());
  editForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editing || saving || stopped) return;
    const { id, operation } = editing;
    const title = editName.value.trim();
    if (operation === 'rename' && (!title || title.length > 120)) {
      editName.setCustomValidity('请填写 1～120 字的素材名称。');
      editName.reportValidity();
      return;
    }
    saving = true;
    editDialog.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = true; });
    message(find('[data-library-edit-status]'), operation === 'delete' ? '正在删除…' : '正在保存…');
    try {
      const result = await request(`${uploadUrl.replace(/\/$/, '')}/${encodeURIComponent(id)}`, new URLSearchParams({ operation, ...(operation === 'rename' ? { title } : {}) }));
      if (stopped) return;
      if (operation === 'delete') {
        const entry = items.get(id);
        discardPreview(id);
        if (entry) { observer?.unobserve(entry.card); entry.card.remove(); items.delete(id); }
      } else setCard(normalize(result.item));
      mutations++;
      render();
      editDialog.close();
      if (operation === 'delete') search.focus();
      pageMessage(operation === 'delete' ? '素材已删除。' : '素材名称已更新。');
    } catch (error) { if (!stopped) message(find('[data-library-edit-status]'), `${error.message || '操作未完成。'} 如结果不确定，请刷新素材库核实。`, true); }
    finally { saving = false; editDialog.querySelectorAll<HTMLButtonElement>('button').forEach((button) => { button.disabled = false; }); }
  });
  root.querySelectorAll<HTMLElement>('[data-library-kind]').forEach((button) => button.addEventListener('click', () => {
    selected = button.dataset.libraryKind as Kind;
    render();
  }));
  search.addEventListener('input', render);
  find('[data-library-clear-search]').addEventListener('click', () => { search.value = ''; render(); search.focus(); });
  find('[data-library-refresh]').addEventListener('click', () => { void refresh(); });
  window.addEventListener('beforeunload', (event) => { if (uploading || saving) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => {
    stopped = true;
    visiblePreviews.clear();
    animatePreviews();
    currentUpload?.abort();
    controllers.forEach((controller) => controller.abort());
    observer?.disconnect();
    previewQueue.length = 0;
    for (const id of previews.keys()) discardPreview(id);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) grid.querySelectorAll<HTMLAudioElement>('audio').forEach((audio) => audio.pause());
    animatePreviews();
  });
  reducedMotion?.addEventListener('change', animatePreviews);
  window.addEventListener('pageshow', (event) => {
    stopped = false;
    if (event.persisted) {
      for (const { item, card } of items.values()) {
        card.querySelector<HTMLElement>('[data-library-placeholder]')!.hidden = false;
        setCard(item);
      }
      render();
    }
  });
  render();
  updateUploads();
});
