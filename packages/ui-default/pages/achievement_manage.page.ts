import $ from 'jquery';
import { prepareAchievementWall } from 'vj/components/achievement_wall';
import { NamedPage } from 'vj/misc/Page';

function imageUrl(value: unknown) {
  if (!value) return '';
  const url = new URL(String(value), window.location.href);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('图片地址无法使用，请刷新页面后重试。');
  return url.href;
}

function bindAchievementSound(root: HTMLElement, endpoint: URL) {
  const panel = root.querySelector<HTMLElement>('[data-achievement-sound]');
  if (!panel) return () => {};
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => panel.querySelector<T>(selector)!;
  const file = find<HTMLInputElement>('[data-achievement-sound-file]');
  const enabled = find<HTMLInputElement>('[data-achievement-sound-enabled]');
  const volume = find<HTMLInputElement>('[data-achievement-sound-volume]');
  const preview = find<HTMLButtonElement>('[data-achievement-sound-preview]');
  const saveButton = find<HTMLButtonElement>('[data-achievement-sound-save]');
  const removeForm = find<HTMLFormElement>('[data-achievement-sound-remove-form]');
  const uploadForm = find<HTMLFormElement>('[data-achievement-sound-upload-form]');
  const settingsForm = find<HTMLFormElement>('[data-achievement-sound-settings]');
  const status = find('[data-achievement-sound-status]');
  const maxSize = Number(root.dataset.maxSoundSize) || 8 * 1024 * 1024;
  let saved = { enabled: enabled.checked, volume: Number(volume.value) };
  let soundUrl = panel.dataset.soundUrl || '';
  let audio: HTMLAudioElement | null = null;
  let request: AbortController | null = null;
  let busy = false;
  let disposed = false;
  const message = (text: string, error = false) => {
    status.textContent = text; status.hidden = !text;
    status.classList.toggle('is-error', error); status.setAttribute('role', error ? 'alert' : 'status');
  };
  const dirty = () => saved.enabled !== enabled.checked || saved.volume !== Number(volume.value);
  const refresh = () => {
    panel.setAttribute('aria-busy', String(busy));
    panel.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach((input) => { input.disabled = busy; });
    saveButton.disabled = busy || !dirty();
    preview.disabled = busy || !soundUrl;
    preview.textContent = audio ? '停止试听' : '试听';
    preview.setAttribute('aria-pressed', String(!!audio));
    find('[data-achievement-sound-save-state]').textContent = dirty() ? '有未保存的设置' : '设置已保存';
    find('[data-achievement-sound-volume-value]').textContent = `${volume.value}%`;
    find('[data-achievement-sound-upload-label]').textContent = soundUrl ? '替换音效' : '上传音效';
    removeForm.hidden = !soundUrl;
  };
  const stop = () => {
    if (!audio) return;
    const current = audio; audio = null;
    current.onended = null; current.onerror = null; current.pause(); current.removeAttribute('src'); current.load();
    if (!disposed) refresh();
  };
  preview.addEventListener('click', () => {
    if (audio) { stop(); message('试听已停止。'); return; }
    if (!soundUrl || busy) return;
    if (!Number(volume.value)) { message('音量为 0，请调高音量后试听。'); return; }
    try {
      const url = new URL(soundUrl, window.location.href);
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error('音效地址无法使用，请重新上传。');
      const current = new Audio(url.href);
      audio = current; current.volume = Number(volume.value) / 100; current.loop = false;
      current.onended = () => { if (audio === current) { stop(); message('试听结束。'); } };
      const failed = () => {
        if (disposed || audio !== current) return;
        stop(); message('音效暂时无法播放，请检查文件或重新上传后重试。', true);
      };
      current.onerror = failed;
      refresh(); message('正在试听当前音量…');
      void current.play().catch(failed);
    } catch (error) { stop(); message(error.message || '音效暂时无法播放，请稍后重试。', true); }
  });
  enabled.addEventListener('change', refresh);
  volume.addEventListener('input', () => { if (audio) audio.volume = Number(volume.value) / 100; refresh(); });
  const save = async (form: HTMLFormElement, operation: 'upload_sound' | 'remove_sound' | 'save_sound') => {
    if (busy) return;
    const body = new FormData(form);
    if (operation === 'upload_sound' && file.files?.[0]) body.set('sound', file.files[0]);
    if (operation === 'save_sound') {
      body.set('enabled', String(enabled.checked)); body.set('volume', volume.value);
    }
    const preserveDraft = operation !== 'save_sound' && dirty();
    const controller = new AbortController(); request = controller;
    const timeout = window.setTimeout(() => controller.abort(), 120000);
    stop(); busy = true; refresh();
    message(operation === 'upload_sound' ? '正在保存音效…' : operation === 'remove_sound' ? '正在移除音效…' : '正在保存设置…');
    try {
      const response = await fetch(endpoint.href, {
        method: 'POST', credentials: 'same-origin', body, signal: controller.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
      });
      const result = await response.json();
      if (disposed) return;
      if (!response.ok || result.error || result.ok === false) {
        const detail = result?.error?.params?.[2] || result?.error?.message || result?.message;
        throw new Error(typeof detail === 'string' && !/\{\d+\}/.test(detail) ? detail : '保存未完成，请稍后重试。');
      }
      const value = result.achievementSound;
      if (!value || typeof value.soundUrl !== 'string' || typeof value.enabled !== 'boolean'
        || !Number.isInteger(value.volume) || value.volume < 0 || value.volume > 100) {
        throw new Error('保存结果未能确认，请刷新页面检查。');
      }
      if (value.soundUrl && !['http:', 'https:'].includes(new URL(value.soundUrl, window.location.href).protocol)) {
        throw new Error('音效地址无法使用，请刷新页面检查。');
      }
      soundUrl = value.soundUrl; panel.dataset.soundUrl = soundUrl;
      saved = { enabled: value.enabled, volume: value.volume };
      if (!preserveDraft) { enabled.checked = saved.enabled; volume.value = String(saved.volume); }
      find('[data-achievement-sound-filename]').textContent = soundUrl ? value.filename || '已上传音效' : '还未上传音效';
      message(`${operation === 'upload_sound' ? '音效已保存' : operation === 'remove_sound' ? '音效已移除' : '设置已保存'}。${dirty() ? '音量和开关的修改尚未保存。' : ''}`);
    } catch (error) {
      if (!disposed) message(error.name === 'AbortError' ? '保存超时，请刷新页面确认结果后再试。' : error.message || '保存未完成，请稍后重试。', true);
    } finally {
      clearTimeout(timeout); request = null; busy = false;
      if (!disposed) { file.value = ''; refresh(); }
    }
  };
  const upload = () => {
    const selected = file.files?.[0];
    if (!selected || busy) return;
    if (!/\.(mp3|ogg|wav|m4a)$/i.test(selected.name)
      || (selected.type && !/^(audio\/(mpeg|mp3|ogg|x-ogg|wav|wave|x-wav|mp4|x-m4a|aac)|application\/octet-stream)$/i.test(selected.type))) {
      message('请选择 MP3、OGG、WAV 或 M4A 音频。', true); file.value = ''; return;
    }
    if (!selected.size || selected.size > maxSize) {
      message(`请选择不超过 ${Math.round(maxSize / 1024 / 1024)} MB 的有效音频。`, true); file.value = ''; return;
    }
    void save(uploadForm, 'upload_sound');
  };
  file.addEventListener('change', upload);
  uploadForm.addEventListener('submit', (event) => { event.preventDefault(); upload(); });
  settingsForm.addEventListener('submit', (event) => { event.preventDefault(); if (dirty()) void save(settingsForm, 'save_sound'); });
  removeForm.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!busy && window.confirm('移除解锁音效？成就图片和已获得的成就会保留。')) void save(removeForm, 'remove_sound');
  });
  refresh();
  return () => { disposed = true; request?.abort(); stop(); };
}

export function bindAchievementManage(reload = () => window.location.reload()) {
  const root = document.querySelector<HTMLElement>('[data-achievement-manage]');
  if (!root || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';
  const find = <T extends HTMLElement = HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-achievement-card]'));
  const search = find<HTMLInputElement>('[data-achievement-search]');
  const imageFilter = find<HTMLSelectElement>('[data-achievement-image-filter]');
  const dialog = find<HTMLDialogElement>('[data-achievement-preview-dialog]');
  const endpoint = new URL(root.dataset.endpoint || window.location.href, window.location.href);
  if (endpoint.origin !== window.location.origin) return;
  const maxSize = Number(root.dataset.maxImageSize) || 8 * 1024 * 1024;
  const disposeSound = bindAchievementSound(root, endpoint);
  const activeUploads = new Set<AbortController>();
  let category = 'all';
  let previewTrigger: HTMLElement | null = null;
  let disposed = false;
  const filter = () => {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const hasImage = !!card.dataset.image;
      card.hidden = (category !== 'all' && card.dataset.category !== category)
        || (imageFilter.value === 'ready' && !hasImage) || (imageFilter.value === 'missing' && hasImage)
        || (!!query && !`${card.dataset.name} ${card.dataset.description}`.toLocaleLowerCase().includes(query));
      if (!card.hidden) visible++;
    });
    root.querySelectorAll<HTMLElement>('[data-achievement-group]').forEach((group) => {
      group.hidden = !group.querySelector('[data-achievement-card]:not([hidden])');
    });
    root.querySelectorAll<HTMLElement>('[data-achievement-category]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.achievementCategory === category));
    });
    find('[data-achievement-result-count]').textContent = `共 ${visible} 项成就`;
    find('[data-achievement-ready-count]').textContent = `${cards.filter((card) => !!card.dataset.image).length} / ${cards.length} 已配图`;
    find('[data-achievement-empty]').hidden = visible > 0;
  };
  search.addEventListener('input', filter);
  imageFilter.addEventListener('change', filter);
  root.querySelectorAll<HTMLElement>('[data-achievement-category]').forEach((button) => {
    button.addEventListener('click', () => { category = button.dataset.achievementCategory || 'all'; filter(); });
  });
  find('[data-achievement-reset]').addEventListener('click', () => {
    category = 'all'; search.value = ''; imageFilter.value = 'all'; filter(); search.focus();
  });
  const message = (node: HTMLElement, text: string, error = false) => {
    node.textContent = text;
    node.hidden = !text;
    node.classList.toggle('is-error', error);
    node.setAttribute('role', error ? 'alert' : 'status');
  };
  const closePreview = () => { dialog.close(); previewTrigger?.focus(); };
  find('[data-achievement-preview-close]').addEventListener('click', closePreview);
  dialog.addEventListener('click', (event) => { if (event.target === dialog) closePreview(); });
  dialog.addEventListener('close', () => {
    find<HTMLImageElement>('[data-achievement-preview-image]').removeAttribute('src');
    previewTrigger?.focus();
  });
  const responseError = (result: any) => {
    const text = result?.error?.params?.[2] || result?.error?.message || result?.message;
    return typeof text === 'string' && !/\{\d+\}/.test(text) ? text : '保存未完成，请稍后重试。';
  };
  cards.forEach((card) => {
    const cardFind = <T extends HTMLElement = HTMLElement>(selector: string) => card.querySelector<T>(selector)!;
    const file = cardFind<HTMLInputElement>('[data-achievement-file]');
    const image = cardFind<HTMLImageElement>('[data-achievement-image]');
    const placeholder = cardFind('[data-achievement-placeholder]');
    const preview = cardFind<HTMLButtonElement>('[data-achievement-preview]');
    const status = cardFind('[data-achievement-card-status]');
    const uploadForm = cardFind<HTMLFormElement>('[data-achievement-upload-form]');
    const removeForm = cardFind<HTMLFormElement>('[data-achievement-remove-form]');
    let busy = false;
    const imageFailed = () => {
      image.hidden = true; placeholder.hidden = false;
      if (card.dataset.image) message(status, '图片暂未加载，可预览原图或重新上传。');
    };
    image.addEventListener('error', imageFailed);
    image.addEventListener('load', () => { image.hidden = false; placeholder.hidden = true; });
    if (image.hasAttribute('src') && image.complete && !image.naturalWidth) imageFailed();
    const update = (item: any) => {
      if (!item || item.id !== card.dataset.id) throw new Error('保存结果未能确认，请刷新页面检查。');
      const full = imageUrl(item.imageUrl);
      const thumb = imageUrl(item.thumbnailUrl || item.imageUrl);
      card.dataset.image = full;
      card.classList.toggle('has-image', !!full);
      image.hidden = !thumb;
      placeholder.hidden = !!thumb;
      if (thumb) image.src = thumb;
      else image.removeAttribute('src');
      preview.hidden = !full;
      removeForm.hidden = !full;
      cardFind('[data-achievement-upload-label]').textContent = full ? '替换图片' : '上传图片';
      cardFind('[data-achievement-image-state]').textContent = full ? '已上传' : '待上传图片';
      filter();
    };
    const save = async (form: HTMLFormElement, removing = false) => {
      if (busy) return;
      const body = new FormData(form);
      if (!removing && file.files?.[0]) body.set('image', file.files[0]);
      const controller = new AbortController();
      activeUploads.add(controller);
      const timeout = window.setTimeout(() => controller.abort(), 120000);
      busy = true;
      card.setAttribute('aria-busy', 'true');
      card.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach((node) => { node.disabled = true; });
      message(status, removing ? '正在移除图片…' : '正在保存图片与缩略图…');
      try {
        const response = await fetch(endpoint.href, {
          method: 'POST', credentials: 'same-origin', body, signal: controller.signal,
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
        });
        const result = await response.json();
        if (disposed) return;
        if (!response.ok || result.error || result.ok === false) throw new Error(responseError(result));
        update(result.achievement);
        message(status, removing ? '图片已移除，成就记录保留。' : '图片已保存。');
        message(find('[data-achievement-status]'), `「${card.dataset.name}」${removing ? '的图片已移除' : '的图片已保存'}。`);
      } catch (error) {
        if (!disposed) message(status, error.name === 'AbortError' ? '保存超时，请刷新页面确认结果后再试。' : error.message || '保存未完成，请稍后重试。', true);
      } finally {
        clearTimeout(timeout); activeUploads.delete(controller); busy = false;
        if (!disposed) {
          card.setAttribute('aria-busy', 'false');
          card.querySelectorAll<HTMLInputElement | HTMLButtonElement>('input,button').forEach((node) => { node.disabled = false; });
          file.value = '';
        }
      }
    };
    const upload = () => {
      const selected = file.files?.[0];
      if (!selected || busy) return;
      if (!/\.png$/i.test(selected.name) || (selected.type && selected.type !== 'image/png')) {
        message(status, '请选择 PNG 图片，透明背景的图片展示效果更好。', true); file.value = ''; return;
      }
      if (selected.size > maxSize || !selected.size) {
        message(status, `请选择不超过 ${Math.round(maxSize / 1024 / 1024)} MB 的有效图片。`, true); file.value = ''; return;
      }
      void save(uploadForm);
    };
    file.addEventListener('change', upload);
    uploadForm.addEventListener('submit', (event) => { event.preventDefault(); upload(); });
    removeForm.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!busy && window.confirm(`移除「${card.dataset.name}」的图片？已获得的成就会保留，之后可以重新配图。`)) void save(removeForm, true);
    });
    preview.addEventListener('click', () => {
      if (!card.dataset.image) return;
      previewTrigger = preview;
      const full = find<HTMLImageElement>('[data-achievement-preview-image]');
      full.src = imageUrl(card.dataset.image);
      full.alt = card.dataset.name || '';
      find('[data-achievement-preview-title]').textContent = card.dataset.name || '';
      find('[data-achievement-preview-description]').textContent = card.dataset.description || '';
      dialog.showModal();
    });
  });
  const dispose = () => { disposed = true; activeUploads.forEach((controller) => controller.abort()); disposeSound(); };
  window.addEventListener('pagehide', dispose, { once: true });
  // A cached page retains disposed handlers; reload to reconcile any interrupted save.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && disposed && root.isConnected) reload();
  });
  document.addEventListener('vjContentRemove', (event) => { if ((event.target as HTMLElement)?.contains(root)) dispose(); }, { once: true });
  filter();
}

const wallDisposers = new WeakMap<HTMLElement, () => void>();

function wallsIn(scope: Document | HTMLElement) {
  const walls = Array.from(scope.querySelectorAll<HTMLElement>('[data-achievement-wall]'));
  if ((scope as HTMLElement).matches?.('[data-achievement-wall]')) walls.unshift(scope as HTMLElement);
  return walls;
}

function bindWall(root: HTMLElement) {
  if (wallDisposers.has(root)) return;
  root.dataset.bound = 'true';
  const disposeLoading = prepareAchievementWall(root);
  const controller = new AbortController();
  const options = { signal: controller.signal };
  const tooltip = root.querySelector<HTMLElement>('[data-achievement-tooltip]');
  const tiles = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-achievement-tile]'));
  let active: HTMLButtonElement | null = null;
  let hideTimer: number | undefined;
  const hide = () => {
    clearTimeout(hideTimer); if (tooltip) tooltip.hidden = true;
    active?.removeAttribute('aria-describedby'); active?.classList.remove('is-active'); active = null;
  };
  const dispose = () => {
    hide(); controller.abort(); disposeLoading();
    wallDisposers.delete(root); delete root.dataset.bound;
  };
  wallDisposers.set(root, dispose);
  window.addEventListener('pagehide', (event) => { hide(); if (!event.persisted) dispose(); }, options);
  if (!tooltip) return;
  const position = () => {
    if (!active) return;
    const rect = active.getBoundingClientRect();
    const grid = root.querySelector<HTMLElement>('.achievement-wall__grid')!.getBoundingClientRect();
    if (grid.height && (rect.bottom <= grid.top || rect.top >= grid.bottom)) { hide(); return; }
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(12, Math.min(rect.left + rect.width / 2 - width / 2, window.innerWidth - width - 12))}px`;
    tooltip.style.top = `${Math.max(12, Math.min(rect.bottom + 10 + height > window.innerHeight - 12 ? rect.top - height - 10 : rect.bottom + 10, window.innerHeight - height - 12))}px`;
  };
  const show = (tile: HTMLButtonElement) => {
    clearTimeout(hideTimer);
    if (active !== tile) hide();
    active = tile;
    tile.classList.add('is-active'); tile.setAttribute('aria-describedby', tooltip.id);
    tooltip.querySelector<HTMLElement>('[data-achievement-tooltip-name]')!.textContent = tile.dataset.name || '';
    tooltip.querySelector<HTMLElement>('[data-achievement-tooltip-description]')!.textContent = tile.dataset.description || '';
    const date = tooltip.querySelector<HTMLElement>('[data-achievement-tooltip-date]')!;
    date.textContent = tile.dataset.unlockedAt ? `${tile.dataset.unlockedAt} 解锁` : '';
    date.hidden = !tile.dataset.unlockedAt;
    tooltip.hidden = false; position();
  };
  const deferHide = () => { clearTimeout(hideTimer); hideTimer = window.setTimeout(hide, 120); };
  tiles.forEach((tile) => {
    tile.removeAttribute('title'); tile.removeAttribute('aria-describedby');
    tile.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'touch') show(tile); }, options);
    tile.addEventListener('pointerleave', deferHide, options);
    tile.addEventListener('focus', () => show(tile), options);
    tile.addEventListener('blur', deferHide, options);
    tile.addEventListener('click', () => show(tile), options);
  });
  tooltip.addEventListener('pointerenter', () => clearTimeout(hideTimer), options);
  tooltip.addEventListener('pointerleave', deferHide, options);
  const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node)) hide(); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
  document.addEventListener('pointerdown', outside, options);
  document.addEventListener('keydown', escape, options);
  window.addEventListener('resize', position, options);
  window.addEventListener('scroll', position, { ...options, capture: true });
}

export function bindAchievementWall(scope: Document | HTMLElement = document) {
  wallsIn(scope).forEach(bindWall);
}

export function disposeAchievementWall(scope: Document | HTMLElement = document) {
  wallsIn(scope).forEach((root) => wallDisposers.get(root)?.());
}

export default new NamedPage(['achievement_manage', 'domain_achievement_manage', 'user_detail', 'homepage'], () => {
  bindAchievementManage(); bindAchievementWall();
  $(document).off('.achievementWall')
    .on('vjContentNew.achievementWall', (event) => bindAchievementWall(event.target as HTMLElement))
    .on('vjContentRemove.achievementWall', (event) => disposeAchievementWall(event.target as HTMLElement));
});
