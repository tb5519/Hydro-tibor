export interface VoicePermissionGuideOptions {
  container?: HTMLElement;
  device?: 'microphone' | 'camera';
  cancelLabel?(): string;
  onCancel?(): void;
  onRetry(): void;
}

let guideId = 0;

// The lesson panel moves between the lesson tab and a document picture-in-picture
// window. Keep these scoped styles with the instructions in both documents.
export function mountLessonDeviceGuides(container: HTMLElement, retryAudio: () => void, retryCamera: () => void) {
  const doc = container.ownerDocument;
  const style = doc.createElement('style');
  style.textContent = `
    .lesson-device-guide[hidden],.lesson-device-guide [hidden]{display:none!important}
    .lesson-device-guide{position:relative;margin:6px 8px;padding:10px 10px 10px 32px;border:1px solid #6b829c;border-radius:8px;background:#edf5ff;color:#172e49}
    .lesson-device-guide__browser-arrow{position:absolute;left:7px;top:11px;width:19px;height:21px;fill:none;stroke:#315f92;stroke-width:11;stroke-linecap:round;stroke-linejoin:round}
    .lesson-device-guide__title{margin:0 0 4px;font:700 14px/1.4 system-ui,sans-serif;color:#172e49}
    .lesson-device-guide__copy,.lesson-device-guide__hint{margin:3px 0;font:400 13px/1.55 system-ui,sans-serif;color:#263f5d}
    .lesson-device-guide button{margin:5px 6px 0 0;padding:5px 8px;min-height:30px;border:1px solid #7291ad;border-radius:5px;background:white;color:#173751;font:600 12px/1.4 system-ui,sans-serif;cursor:pointer}
    .lesson-device-guide .lesson-device-guide__retry{background:#204f7d;border-color:#204f7d;color:white}
    .lesson-device-guide button:focus-visible{outline:2px solid #1d4f82;outline-offset:2px}
  `;
  container.append(style);
  const microphone = mountVoicePermissionGuide(doc, { container, device: 'microphone', onRetry: retryAudio });
  const camera = mountVoicePermissionGuide(doc, { container, device: 'camera', onRetry: retryCamera });
  return { microphone, camera };
}

export function permissionDenied(error: any) {
  return error?.name === 'NotAllowedError' || error?.name === 'PermissionDeniedError';
}

export function macBrowser(nav: Navigator) {
  if (!/Mac/.test(nav.platform || nav.userAgent) || nav.maxTouchPoints > 1) return '';
  const ua = nav.userAgent;
  if (/Edg\//.test(ua)) return 'Microsoft Edge';
  if (/Chrome\/|Chromium\//.test(ua)) return 'Chrome';
  if (/Firefox\//.test(ua)) return 'Firefox';
  if (/Safari\//.test(ua)) return 'Safari';
  return '当前浏览器';
}

export function macSystemPermission(browser: string, device: '麦克风' | '摄像头' | '屏幕录制') {
  const pane = device === '屏幕录制' ? '录屏与系统录音（或「屏幕录制」）' : device;
  return `苹果菜单 → 系统设置 → 隐私与安全性（或「隐私与安全」）→ ${pane}，为 ${browser} 打开开关。`;
}

// Browser permission prompts belong to browser chrome, not the page. This
// guide points towards that area without pretending to locate its Allow button.
export function mountVoicePermissionGuide(ownerDocument: Document, options: VoicePermissionGuideOptions) {
  const view = ownerDocument.defaultView!;
  const inline = !!options.container;
  const device = options.device || 'microphone';
  const label = device === 'camera' ? '摄像头' : '麦克风';
  const browser = macBrowser(view.navigator);
  const className = inline ? 'lesson-device-guide' : 'voice-permission-guide';
  const prefix = `${className}-${++guideId}`;
  const node = <T extends keyof HTMLElementTagNameMap>(tag: T, cssClass: string, text = '') => {
    const element = ownerDocument.createElement(tag);
    element.className = cssClass; element.textContent = text; return element;
  };
  const root = node('div', className);
  root.hidden = true; root.dataset.state = 'idle';
  if (inline) root.dataset.lessonDevicePermission = device; else root.dataset.voicePermissionGuide = '';
  root.setAttribute('data-live-share-private', ''); root.setAttribute('role', inline ? 'group' : 'dialog');
  if (inline) root.setAttribute('aria-live', 'polite'); else root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', `${prefix}-title`);
  root.setAttribute('aria-describedby', `${prefix}-copy`);
  const browserArrow = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  browserArrow.classList.add(`${className}__browser-arrow`);
  browserArrow.setAttribute('viewBox', '0 0 140 144'); browserArrow.setAttribute('aria-hidden', 'true');
  const arrowPath = ownerDocument.createElementNS(browserArrow.namespaceURI, 'path');
  arrowPath.setAttribute('d', 'M112 126C50 123 46 81 46 16M20 43L46 16L73 43'); browserArrow.append(arrowPath);
  const card = node('div', `${className}__card`);
  const title = node('h2', `${className}__title`); title.id = `${prefix}-title`;
  const copy = node('p', `${className}__copy`); copy.id = `${prefix}-copy`;
  const hint = node('p', `${className}__hint`);
  const macHelp = node('details', `${className}__hint`);
  macHelp.hidden = true;
  if (browser) macHelp.append(node('summary', '', '在 Mac 系统设置里检查权限'), node('p', '', macSystemPermission(browser, label)));
  const playbackArrow = node('span', `${className}__playback-arrow`, '↓');
  playbackArrow.setAttribute('aria-hidden', 'true'); playbackArrow.hidden = true;
  const retry = node('button', `${className}__retry`); retry.type = 'button'; retry.hidden = true;
  retry.dataset.voicePermissionRetry = '';
  const cancel = node('button', `${className}__cancel`, inline ? '收起提示' : '取消接听'); cancel.type = 'button';
  cancel.dataset.voicePermissionCancel = '';
  if (!inline) card.append(node('p', `${className}__eyebrow`, '语音通话'));
  card.append(title, copy, hint, playbackArrow, retry, cancel); root.append(browserArrow, card);
  if (browser) hint.after(macHelp);
  (options.container || ownerDocument.body).append(root);

  let disposed = false;
  let dismissed = false;
  let generation = 0;
  let pending = false;
  let timer = 0;
  let permission: PermissionStatus | null = null;
  let permissionChange: (() => void) | null = null;
  let permissionState: PermissionState | 'unknown' = 'unknown';
  let previousFocus: HTMLElement | null = null;

  function rememberFocus() {
    const active = ownerDocument.activeElement as HTMLElement | null;
    if (!previousFocus && active && !root.contains(active) && typeof active.focus === 'function') previousFocus = active;
  }
  function clearPending() {
    generation++; pending = false; view.clearTimeout(timer); timer = 0;
    if (permission && permissionChange) permission.removeEventListener?.('change', permissionChange);
    permission = null; permissionChange = null;
  }
  function hide() {
    clearPending(); root.hidden = true; root.dataset.state = 'idle';
    macHelp.open = false;
    // Do not steal focus from browser chrome while its permission prompt is up.
    if (root.contains(ownerDocument.activeElement) && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function show(state: 'pending' | 'blocked' | 'playback') {
    if (disposed) return;
    rememberFocus(); root.dataset.state = state; root.hidden = false;
    if (options.cancelLabel) cancel.textContent = options.cancelLabel();
    macHelp.hidden = state !== 'blocked';
    browserArrow.toggleAttribute('hidden', state === 'playback'); playbackArrow.hidden = state !== 'playback';
    retry.hidden = state === 'pending';
    if (state === 'pending') {
      title.textContent = `点一下“允许”，开启${label}`;
      copy.textContent = permissionState === 'prompt'
        ? `在浏览器上方的${label}提示里，点击“允许”或“本次允许”。`
        : `如果浏览器弹出${label}提示，请点击“允许”或“本次允许”。`;
      hint.textContent = device === 'camera' ? '想只用语音上课，也可以在浏览器里选“暂不允许”。'
        : '在网页上方的地址栏旁找找看。手机上也可能在屏幕下方。';
    } else if (state === 'blocked') {
      title.textContent = `${label}还没有打开`;
      copy.textContent = `点击地址栏旁的权限图标，找到“${label}”，选“允许”，再回到这里重试。`;
      hint.textContent = device === 'camera' ? '不开摄像头也可以继续上课。若已经允许，请家长帮你检查设备的相机设置。'
        : '如果网站已经显示“允许”，请家长帮你在设备设置里打开浏览器的麦克风。';
      if (browser) {
        if (browser === 'Safari') {
          const item = device === 'camera' ? '相机（摄像头）' : label;
          copy.textContent = `在「Safari 浏览器 → 设置 → 网站 → ${item}」中，找到课堂网站，选「允许」，再回来重试。`;
        } else if (browser === 'Chrome' || browser === 'Microsoft Edge') {
          copy.textContent = `点 ${browser} 地址栏左侧的网站信息图标，找到「${label}」，为课堂网站选「允许」，再回来重试。`;
        }
        hint.textContent = device === 'camera' ? '不开摄像头也可以继续上课。' : '如果网站已经允许，可以检查下面的 Mac 系统权限。';
      }
      retry.textContent = inline ? `重试${label}` : '我已允许，重新连接';
    } else {
      title.textContent = '点一下，听到对方的声音';
      copy.textContent = '浏览器暂停了声音，点击下面的按钮继续通话。';
      hint.textContent = '这一步在页面里完成。';
      retry.textContent = '点击开启声音';
    }
    if (state !== 'playback' && root.ownerDocument !== ownerDocument) copy.prepend('先回到上课网页。');
    // Focus only after a resolved permission error or a playback failure, never
    // while a native prompt may be waiting for the child's choice.
    if (!inline && state !== 'pending') retry.focus({ preventScroll: true });
  }
  function blocked() { if (!disposed && !dismissed) { clearPending(); show('blocked'); } }
  function playbackBlocked() { if (!disposed) { clearPending(); show('playback'); } }
  function begin() {
    if (disposed) return;
    hide(); rememberFocus(); pending = true; dismissed = false; permissionState = 'unknown';
    const attempt = generation;
    timer = view.setTimeout(() => {
      timer = 0;
      if (!disposed && pending && attempt === generation && permissionState !== 'granted' && permissionState !== 'denied') show('pending');
    }, 500);
    const permissions = view.navigator.permissions;
    if (!permissions?.query) return;
    try {
      // This observation is deliberately not awaited: getUserMedia/resume must
      // still start synchronously in the original Accept click.
      void permissions.query({ name: device as PermissionName }).then((result) => {
        if (disposed || !pending || attempt !== generation) return;
        permission = result;
        permissionChange = () => {
          if (disposed || !pending || attempt !== generation) return;
          permissionState = result.state;
          if (result.state === 'granted') hide();
          else if (result.state === 'denied') blocked();
          else if (!root.hidden) show('pending');
        };
        result.addEventListener?.('change', permissionChange);
        permissionChange();
      }).catch(() => { /* Unsupported permission names use the generic guide. */ });
    } catch { /* Some browsers throw synchronously for microphone queries. */ }
  }
  const onCancel = () => { dismissed = true; hide(); options.onCancel?.(); };
  const onRetry = () => { hide(); options.onRetry(); };
  cancel.addEventListener('click', onCancel); retry.addEventListener('click', onRetry);
  const onKeyDown = (event: KeyboardEvent) => {
    if (root.hidden || disposed) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
    else if (event.key === 'Tab') {
      const buttons: HTMLElement[] = [retry, cancel].filter((button) => !button.hidden);
      if (browser && !macHelp.hidden) buttons.unshift(macHelp.querySelector('summary')!);
      const current = buttons.indexOf(ownerDocument.activeElement as HTMLButtonElement);
      const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
        : (current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length;
      event.preventDefault(); buttons[next].focus({ preventScroll: true });
    }
  };
  if (!inline) ownerDocument.addEventListener('keydown', onKeyDown, true);
  return {
    begin, granted: hide, blocked, playbackBlocked, hide,
    dispose() {
      if (disposed) return;
      hide(); disposed = true; ownerDocument.removeEventListener('keydown', onKeyDown, true);
      cancel.removeEventListener('click', onCancel); retry.removeEventListener('click', onRetry); root.remove();
    },
  };
}
