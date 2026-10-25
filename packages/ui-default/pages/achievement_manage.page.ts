import { NamedPage } from 'vj/misc/Page';

function imageUrl(value: unknown) {
  if (!value) return '';
  const url = new URL(String(value), window.location.href);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('图片地址无法使用，请刷新页面后重试。');
  return url.href;
}

export function bindAchievementManage() {
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
  const dispose = () => { disposed = true; activeUploads.forEach((controller) => controller.abort()); };
  window.addEventListener('pagehide', dispose, { once: true });
  document.addEventListener('vjContentRemove', (event) => { if ((event.target as HTMLElement)?.contains(root)) dispose(); }, { once: true });
  filter();
}

export function bindAchievementWall() {
  const root = document.querySelector<HTMLElement>('[data-achievement-wall]');
  const tooltip = root?.querySelector<HTMLElement>('[data-achievement-tooltip]');
  if (!root || !tooltip || root.dataset.bound === 'true') return;
  root.dataset.bound = 'true';
  const tiles = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-achievement-tile]'));
  let active: HTMLButtonElement | null = null;
  let hideTimer: number | undefined;
  const hide = () => {
    clearTimeout(hideTimer); tooltip.hidden = true;
    active?.removeAttribute('aria-describedby'); active?.classList.remove('is-active'); active = null;
  };
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
    tile.addEventListener('pointerenter', (event) => { if (event.pointerType !== 'touch') show(tile); });
    tile.addEventListener('pointerleave', deferHide);
    tile.addEventListener('focus', () => show(tile));
    tile.addEventListener('blur', deferHide);
    tile.addEventListener('click', () => show(tile));
    const img = tile.querySelector('img');
    const imageFailed = () => {
      if (!img) return;
      img.hidden = true;
      if (tile.querySelector('.achievement-wall__placeholder')) return;
      tile.classList.add('achievement-wall__item--placeholder');
      const star = document.createElement('span');
      star.className = 'achievement-wall__placeholder'; star.textContent = '✦'; star.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'achievement-wall__fallback-name'; name.textContent = tile.dataset.name || ''; name.setAttribute('aria-hidden', 'true');
      tile.append(star, name);
    };
    img?.addEventListener('error', imageFailed);
    if (img?.complete && !img.naturalWidth) imageFailed();
  });
  tooltip.addEventListener('pointerenter', () => clearTimeout(hideTimer));
  tooltip.addEventListener('pointerleave', deferHide);
  const outside = (event: PointerEvent) => { if (!root.contains(event.target as Node)) hide(); };
  const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') hide(); };
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
  window.addEventListener('resize', position);
  window.addEventListener('scroll', position, true);
  const dispose = () => {
    hide(); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape);
    window.removeEventListener('resize', position); window.removeEventListener('scroll', position, true);
  };
  window.addEventListener('pagehide', dispose, { once: true });
  document.addEventListener('vjContentRemove', (event) => { if ((event.target as HTMLElement)?.contains(root)) dispose(); }, { once: true });
}

export default new NamedPage(['achievement_manage', 'domain_achievement_manage', 'user_detail'], () => {
  bindAchievementManage(); bindAchievementWall();
});
