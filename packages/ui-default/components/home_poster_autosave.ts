const MAX_IMAGE_SIZE = 8 * 1024 * 1024;
const IMAGE_EXTENSION = /\.(?:jpe?g|png|webp)$/i;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Progressive enhancement: ordinary forms remain usable before JavaScript loads. */
export function bindHomePosterAutosave(root: HTMLElement | null, env: any = window) {
  if (!root || root.dataset.posterBound || !env.fetch || !env.FormData || !env.AbortController) return;
  root.dataset.posterBound = 'true';
  root.classList.add('is-enhanced');
  let busy = false;
  const scrollKey = `onebyone-home-poster-scroll:${new URL(env.location.href).pathname}`;
  try {
    const saved = JSON.parse(env.sessionStorage?.getItem(scrollKey) || 'null');
    env.sessionStorage?.removeItem(scrollKey);
    if (saved && Date.now() - saved.at < 60_000 && ['layout', 'image'].includes(saved.kind)
      && Number.isFinite(saved.top) && env.scrollTo) {
      const anchor = root.querySelector<HTMLElement>(`[data-poster-autosave="${saved.kind}"]`);
      const restore = () => {
        if (anchor) env.scrollTo({ top: Math.max(0, (env.scrollY || 0) + anchor.getBoundingClientRect().top - saved.top), behavior: 'instant' });
      };
      // Restore the same card position after the new preview has entered layout.
      const frame = env.requestAnimationFrame?.bind(env) || ((callback: () => void) => env.setTimeout(callback, 0));
      frame(() => frame(restore));
    }
  } catch { /* Scroll restoration is optional when session storage is unavailable. */ }
  const setStatus = (form: HTMLFormElement, text: string, state = '') => {
    const status = form.querySelector<HTMLElement>('[data-poster-status]');
    if (status) { status.textContent = text; status.dataset.state = state; }
  };
  const retry = (form: HTMLFormElement, visible: boolean) => {
    const button = form.querySelector<HTMLButtonElement>('[data-poster-submit]');
    if (!button) return;
    button.toggleAttribute('data-retry', visible);
    if (visible) button.textContent = '重试保存';
  };
  const showLayout = () => {
    const layout = root.querySelector<HTMLInputElement>('input[name="layout"]:checked')?.value || 'banner';
    root.querySelectorAll<HTMLElement>('[data-poster-layout]').forEach((element) => {
      element.hidden = element.dataset.posterLayout !== layout;
    });
  };
  const save = async (form: HTMLFormElement) => {
    if (busy) return;
    const fileInput = form.querySelector<HTMLInputElement>('input[type="file"]');
    if (fileInput) {
      const file = fileInput.files?.[0];
      if (!file) { setStatus(form, '请先选择图片。', 'error'); return; }
      if (!IMAGE_EXTENSION.test(file.name) || (file.type && !IMAGE_TYPES.includes(file.type))) {
        setStatus(form, '请选择 JPG、PNG 或 WebP 图片。', 'error'); retry(form, false); return;
      }
      if (!file.size || file.size > MAX_IMAGE_SIZE) {
        setStatus(form, '请选择不超过 8MB 的非空图片。', 'error'); retry(form, false); return;
      }
    }
    // Build the payload before disabling controls: disabled fields are omitted by FormData.
    const data = new env.FormData(form);
    const controls = [...root.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')];
    const disabled = controls.map((control) => control.disabled);
    const controller = new env.AbortController();
    const timeout = env.setTimeout(() => controller.abort(), 120_000);
    busy = true;
    form.setAttribute('aria-busy', 'true');
    controls.forEach((control) => { control.disabled = true; });
    retry(form, false);
    setStatus(form, fileInput ? '正在上传并保存图片…' : '正在保存展示方式…');
    try {
      const response = await env.fetch(form.action || env.location.href, {
        method: 'POST', credentials: 'same-origin', headers: { Accept: 'application/json' }, body: data, signal: controller.signal,
      });
      if (!response.ok || !/^application\/json/i.test(response.headers.get('Content-Type') || '')) throw new Error('save');
      const result = await response.json();
      if (!result?.success || !result.url) throw new Error('save');
      const destination = new URL(result.url, env.location.href);
      if (destination.origin !== env.location.origin) throw new Error('save');
      setStatus(form, '已保存，正在更新预览…', 'success');
      try {
        env.sessionStorage?.setItem(scrollKey, JSON.stringify({
          kind: form.dataset.posterAutosave, top: form.getBoundingClientRect().top, at: Date.now(),
        }));
      } catch { /* Saving remains usable with storage disabled. */ }
      env.location.assign(destination.href);
      // Keep controls locked until navigation completes, avoiding duplicate uploads.
    } catch {
      busy = false;
      controls.forEach((control, index) => { control.disabled = disabled[index]; });
      form.removeAttribute('aria-busy');
      setStatus(form, '未确认保存成功，请重试。当前预览保留原素材。', 'error');
      retry(form, true);
    } finally { env.clearTimeout(timeout); }
  };
  root.querySelectorAll<HTMLFormElement>('[data-poster-autosave]').forEach((form) => {
    form.addEventListener('submit', (event) => { event.preventDefault(); void save(form); });
    form.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement;
      if (!target?.matches('input[type="file"], input[name="layout"]')) return;
      if (target.name === 'layout') showLayout();
      if (target.type === 'file' && !target.files?.length) return;
      void save(form);
    });
  });
  showLayout();
}
