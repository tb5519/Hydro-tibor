const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const POSTER_MAX_EDGE = 1920;
const bindings = new WeakMap<Element, { dispose: () => void }>();

type MediaWindow = Window & typeof globalThis;
export interface BackgroundBinding { dispose: () => void }
export interface BackgroundUploadServices {
  capture?: typeof captureBackgroundPoster;
  navigate?: (url: string) => void;
}

function httpUrl(value: string, win: Window, sameOrigin = false) {
  try {
    const url = new URL(value, win.location.href);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || (sameOrigin && url.origin !== win.location.origin)) return null;
    return url.href;
  } catch { return null; }
}

/** Keep the still image in place until the browser has actually displayed a video frame. */
export function bindLoopBackground(root: HTMLElement, win = root.ownerDocument.defaultView as MediaWindow): BackgroundBinding {
  const source = httpUrl(root.dataset.backgroundVideoSrc || '', win);
  if (!root.dataset.backgroundVideoSrc || !source) return { dispose() {} };
  const doc = root.ownerDocument;
  const video = doc.createElement('video');
  video.className = 'loop-background__video';
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.controls = false;
  video.preload = 'none';
  video.tabIndex = -1;
  video.setAttribute('aria-hidden', 'true');
  video.setAttribute('muted', '');
  video.setAttribute('playsinline', '');
  video.setAttribute('disablepictureinpicture', '');
  video.setAttribute('disableremoteplayback', '');
  root.append(video);
  const motion = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let visible = !win.IntersectionObserver;
  let disposed = false;
  let failed = false;
  let loaded = false;
  let ready = false;
  let starting = false;
  let frameCallback = 0;
  let animationFrame = 0;
  const active = () => !disposed && !failed && visible && doc.visibilityState !== 'hidden' && !motion?.matches;
  const cancelReveal = () => {
    if (frameCallback && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(frameCallback);
    if (animationFrame) win.cancelAnimationFrame(animationFrame);
    frameCallback = 0;
    animationFrame = 0;
  };
  const hide = () => { cancelReveal(); root.classList.remove('is-video-playing'); };
  const reveal = () => {
    cancelReveal();
    const show = () => {
      if (active() && !video.paused && video.readyState >= 2) root.classList.add('is-video-playing');
    };
    if (video.requestVideoFrameCallback) frameCallback = video.requestVideoFrameCallback(show);
    else animationFrame = win.requestAnimationFrame(() => { animationFrame = win.requestAnimationFrame(show); });
  };
  const update = () => {
    if (!active()) {
      video.pause();
      cancelReveal();
      if (motion?.matches) hide();
      return;
    }
    if (!loaded) {
      loaded = true;
      video.preload = 'auto';
      video.src = source;
      video.load();
    }
    if (!ready || starting || !video.paused) return;
    starting = true;
    try {
      Promise.resolve(video.play()).catch(() => { hide(); }).finally(() => { starting = false; });
    } catch {
      starting = false;
      hide();
    }
  };
  const onReady = () => { ready = true; update(); };
  const onError = () => { failed = true; video.pause(); hide(); };
  video.addEventListener('canplaythrough', onReady);
  video.addEventListener('playing', reveal);
  video.addEventListener('error', onError);
  doc.addEventListener('visibilitychange', update);
  // A blocked autoplay is retried on an ordinary interaction without adding player controls.
  doc.addEventListener('pointerdown', update, { passive: true });
  doc.addEventListener('keydown', update);
  motion?.addEventListener?.('change', update);
  const observer = win.IntersectionObserver && new win.IntersectionObserver((entries) => {
    const entry = entries.find((item) => item.target === root);
    if (entry) { visible = entry.isIntersecting; update(); }
  }, { rootMargin: '100px', threshold: 0 });
  observer?.observe(root);
  update();
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      observer?.disconnect();
      doc.removeEventListener('visibilitychange', update);
      doc.removeEventListener('pointerdown', update);
      doc.removeEventListener('keydown', update);
      motion?.removeEventListener?.('change', update);
      video.removeEventListener('canplaythrough', onReady);
      video.removeEventListener('playing', reveal);
      video.removeEventListener('error', onError);
      hide();
      video.pause();
      video.removeAttribute('src');
      video.load();
      video.remove();
    },
  };
}

function validateVideo(file: File) {
  if (!file.size || file.size > MAX_VIDEO_BYTES) throw new Error('请选择不超过 40 MB 的视频。');
  if (!/\.(mp4|webm)$/i.test(file.name) || (file.type && !['video/mp4', 'video/webm'].includes(file.type))) {
    throw new Error('请选择 MP4 或 WebM 视频。');
  }
}

/** Decode the uploaded file locally; neither the original video nor its frames leave the browser until upload. */
export async function captureBackgroundPoster(file: File, win: MediaWindow, signal?: AbortSignal): Promise<Blob> {
  validateVideo(file);
  if (signal?.aborted) throw new win.DOMException('已取消', 'AbortError');
  const video = win.document.createElement('video');
  const source = win.URL.createObjectURL(file);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0;pointer-events:none;';
  video.setAttribute('aria-hidden', 'true');
  win.document.body.append(video);
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => {
        win.clearTimeout(timer);
        video.removeEventListener('loadeddata', loaded);
        video.removeEventListener('error', failed);
        signal?.removeEventListener('abort', aborted);
        if (error) reject(error); else resolve();
      };
      const loaded = () => {
        if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
        finish();
      };
      const failed = () => finish(new Error('无法读取这个视频，请使用浏览器可播放的 MP4 或 WebM。'));
      const aborted = () => finish(new win.DOMException('已取消', 'AbortError'));
      const timer = win.setTimeout(() => finish(new Error('视频首帧读取超时，请重新选择视频。')), 30000);
      video.addEventListener('loadeddata', loaded);
      video.addEventListener('error', failed);
      signal?.addEventListener('abort', aborted, { once: true });
      video.src = source;
      video.load();
    });
    if (signal?.aborted) throw new win.DOMException('已取消', 'AbortError');
    const scale = Math.min(1, POSTER_MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = win.document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前浏览器无法生成视频封面，请换一个浏览器重试。');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
    if (!blob?.size) throw new Error('视频封面生成失败，请重新选择视频。');
    return blob;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
    win.URL.revokeObjectURL(source);
  }
}

export function bindBackgroundVideoUpload(
  form: HTMLFormElement,
  win = form.ownerDocument.defaultView as MediaWindow,
  services: BackgroundUploadServices = {},
): BackgroundBinding {
  const input = form.querySelector<HTMLInputElement>('input[type="file"][name="file"]');
  if (!input) return { dispose() {} };
  let status = form.querySelector<HTMLElement>('[data-video-upload-status]');
  if (!status) {
    status = form.ownerDocument.createElement('p');
    status.dataset.videoUploadStatus = '';
    form.append(status);
  }
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  let request: AbortController | null = null;
  let disposed = false;
  const controls = [...form.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select')];
  const disabled = new Map(controls.map((control) => [control, control.disabled]));
  const watchedForm = form.dataset.backgroundVideoWatchForm
    ? form.ownerDocument.querySelector<HTMLFormElement>(form.dataset.backgroundVideoWatchForm) : null;
  const originalSelections = new Map([...watchedForm?.querySelectorAll('select') || []].map((select) => [select, [...select.options].map((option) => option.selected)]));
  const otherEditsPending = () => watchedForm && [...watchedForm.elements].some((element) => {
    if (element instanceof win.HTMLInputElement) {
      if (element.type === 'file') return !!element.files?.length;
      if (['checkbox', 'radio'].includes(element.type)) return element.checked !== element.defaultChecked;
      return !['hidden', 'submit', 'button'].includes(element.type) && element.value !== element.defaultValue;
    }
    if (element instanceof win.HTMLTextAreaElement) return element.value !== element.defaultValue;
    if (element instanceof win.HTMLSelectElement) return [...element.options].some((option, index) => option.selected !== originalSelections.get(element)?.[index]);
    return false;
  });
  const unlock = () => {
    for (const control of controls) control.disabled = disabled.get(control);
    form.removeAttribute('aria-busy');
  };
  const showStatus = (message: string, error = false) => {
    status.textContent = message;
    status.classList.toggle('is-error', error);
  };
  const onSubmit = async (event: SubmitEvent) => {
    event.preventDefault();
    if (request || disposed) return;
    if (otherEditsPending()) {
      showStatus('上方徽章信息还有未保存的修改，请先保存，再上传视频。', true);
      return;
    }
    const file = input.files?.[0];
    if (!file) { showStatus('请先选择一个视频。', true); input.focus(); return; }
    const endpoint = httpUrl(form.action || win.location.href, win, true);
    if (!endpoint) { showStatus('上传地址无效，请刷新页面后重试。', true); return; }
    try { validateVideo(file); } catch (error) { showStatus(error.message, true); return; }
    const controller = new win.AbortController();
    request = controller;
    const data = new win.FormData(form);
    data.set('file', file, file.name);
    const submitter = event.submitter as HTMLButtonElement | null;
    if (submitter?.name) data.set(submitter.name, submitter.value);
    for (const control of controls) control.disabled = true;
    form.setAttribute('aria-busy', 'true');
    showStatus('正在读取视频首帧…');
    try {
      const poster = await (services.capture || captureBackgroundPoster)(file, win, controller.signal);
      if (disposed || controller.signal.aborted) return;
      data.set('poster', poster, 'video-poster.jpg');
      showStatus('正在上传视频与封面，请稍候…');
      const response = await win.fetch(endpoint, {
        method: 'POST', credentials: 'same-origin', signal: controller.signal,
        headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: data,
      });
      if (disposed || controller.signal.aborted) return;
      if ([401, 403].includes(response.status)) throw new Error('登录验证已过期，请刷新页面并重新验证后上传。');
      if (!response.ok) throw new Error('上传失败，原来的背景仍然保留，请稍后重试。');
      const result = await response.json().catch(() => { throw new Error('未收到保存结果，请刷新页面并确认登录状态。'); });
      if (result?.error) throw new Error('上传失败，原来的背景仍然保留，请检查文件后重试。');
      if (disposed || controller.signal.aborted) return;
      const redirect = typeof result?.url === 'string' ? httpUrl(result.url, win, true) : null;
      if (!redirect && result?.saved !== true) throw new Error('未收到保存结果，请刷新页面后重试。');
      showStatus('视频已保存。');
      (services.navigate || ((url) => win.location.assign(url)))(redirect || win.location.href);
    } catch (error) {
      if (!disposed && !controller.signal.aborted) showStatus(error.message || '上传失败，请重试。', true);
    } finally {
      if (request === controller) request = null;
      if (!disposed) unlock();
    }
  };
  form.addEventListener('submit', onSubmit);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      request?.abort();
      request = null;
      form.removeEventListener('submit', onSubmit);
      unlock();
    },
  };
}

function matching(root: ParentNode, selector: string): Element[] {
  return [...((root as Node).nodeType === 1 && (root as Element).matches(selector) ? [root as Element] : []),
    ...root.querySelectorAll(selector)];
}

export function bindBackgroundMedia(root: ParentNode = document) {
  for (const node of matching(root, '[data-loop-background], form[data-background-video-upload]')) {
    if (bindings.has(node)) continue;
    bindings.set(node, node.matches('form')
      ? bindBackgroundVideoUpload(node as HTMLFormElement)
      : bindLoopBackground(node as HTMLElement));
  }
}

export function disposeBackgroundMedia(root: ParentNode = document) {
  for (const node of matching(root, '[data-loop-background], form[data-background-video-upload]')) {
    bindings.get(node)?.dispose();
    bindings.delete(node);
  }
}
