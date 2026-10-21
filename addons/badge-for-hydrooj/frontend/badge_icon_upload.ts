/** Local preview only; the normal form performs the authenticated upload and save. */
export function bindBadgeIconUpload(root: ParentNode = document) {
  const section = root.querySelector<HTMLElement>('[data-badge-icon-upload]');
  const input = section?.querySelector<HTMLInputElement>('[name="iconImage"]');
  const preview = section?.querySelector<HTMLElement>('[data-badge-icon-preview]');
  const status = section?.querySelector<HTMLElement>('[data-badge-icon-upload-status]');
  if (!section || !input || !preview || !status) return () => {};
  const form = section.closest('form');
  const remove = section.querySelector<HTMLInputElement>('[name="removeIconImage"]');
  const short = form?.querySelector<HTMLInputElement>('[name="short"]');
  const title = form?.querySelector<HTMLInputElement>('[name="title"]');
  const background = form?.querySelector<HTMLInputElement>('[name="backgroundColor"]');
  const foreground = form?.querySelector<HTMLInputElement>('[name="fontColor"]');
  let localUrl = '';
  let disposed = false;
  const safeColor = (value: string) => (/^#?(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i.test(value) ? `#${value.replace(/^#/, '')}` : '');
  const refresh = () => {
    if (disposed) return;
    const file = input.files?.[0];
    status.classList.remove('is-error');
    if (localUrl) URL.revokeObjectURL(localUrl);
    localUrl = '';
    let source = remove?.checked ? '' : section.dataset.savedIcon || '';
    if (file?.size) {
      if (!['image/png', 'image/webp', 'image/jpeg', 'image/gif'].includes(file.type) || file.size > 2 * 1024 * 1024) {
        input.value = '';
        status.textContent = '请选择 2 MB 以内的 PNG、WebP、JPG 或 GIF 图片。';
        status.classList.add('is-error');
      } else {
        localUrl = URL.createObjectURL(file);
        source = localUrl;
        if (remove) remove.checked = false;
        status.textContent = '已更新预览，保存徽章后生效。';
      }
    } else status.textContent = remove?.checked ? '保存后将恢复原来的文字样式。' : '';
    const label = short?.value.trim() || title?.value.trim() || '';
    preview.title = title?.value.trim() || label;
    preview.style.backgroundColor = safeColor(background?.value || '') || '#345477';
    preview.style.color = safeColor(foreground?.value || '') || '#ffffff';
    preview.dataset.badgeIconState = source ? 'loading' : 'fallback';
    delete preview.dataset.badgeIconReveal;
    const fallback = document.createElement('span');
    fallback.dataset.badgeIconFallback = '';
    fallback.textContent = label;
    preview.replaceChildren(fallback);
    if (source) {
      const image = document.createElement('img');
      image.alt = label;
      image.hidden = true;
      image.dataset.badgeIcon = '';
      image.decoding = 'async';
      image.loading = 'eager';
      image.setAttribute('fetchpriority', 'high');
      fallback.setAttribute('aria-hidden', 'true');
      image.addEventListener('load', () => {
        if (disposed || image.parentElement !== preview || !image.naturalWidth || !image.naturalHeight) return;
        // The shared installer owns decode/reveal when present. Its capture
        // listener runs first; this local preview must not reveal ahead of it.
        if (image.hasAttribute('data-badge-icon-managed')) return;
        preview.dataset.badgeIconState = 'ready';
        image.hidden = false;
        fallback.setAttribute('aria-hidden', 'true');
      });
      image.addEventListener('error', () => {
        if (disposed || image.parentElement !== preview) return;
        preview.dataset.badgeIconState = 'fallback';
        image.hidden = true;
        fallback.setAttribute('aria-hidden', 'false');
        status.textContent = '小图暂时无法显示，当前保留文字样式。';
      });
      preview.appendChild(image);
      image.src = source;
    }
  };
  const labelInputs = [short, title, background, foreground].filter(Boolean);
  input.addEventListener('change', refresh);
  const changeRemove = () => {
    if (remove?.checked) input.value = '';
    refresh();
  };
  remove?.addEventListener('change', changeRemove);
  labelInputs.forEach((field) => field.addEventListener('input', refresh));
  refresh();
  return () => {
    disposed = true;
    if (localUrl) URL.revokeObjectURL(localUrl);
    input.removeEventListener('change', refresh);
    remove?.removeEventListener('change', changeRemove);
    labelInputs.forEach((field) => field.removeEventListener('input', refresh));
  };
}
