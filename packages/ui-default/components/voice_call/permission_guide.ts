export interface VoicePermissionGuideOptions {
  onCancel(): void;
  onRetry(): void;
}

let guideId = 0;

// Browser permission prompts belong to browser chrome, not the page. This
// guide points towards that area without pretending to locate its Allow button.
export function mountVoicePermissionGuide(ownerDocument: Document, options: VoicePermissionGuideOptions) {
  const view = ownerDocument.defaultView!;
  const prefix = `voice-permission-guide-${++guideId}`;
  const node = <T extends keyof HTMLElementTagNameMap>(tag: T, className: string, text = '') => {
    const element = ownerDocument.createElement(tag);
    element.className = className; element.textContent = text; return element;
  };
  const root = node('div', 'voice-permission-guide');
  root.hidden = true; root.dataset.voicePermissionGuide = ''; root.dataset.state = 'idle';
  root.setAttribute('data-live-share-private', ''); root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', `${prefix}-title`);
  root.setAttribute('aria-describedby', `${prefix}-copy`);
  const browserArrow = ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
  browserArrow.classList.add('voice-permission-guide__browser-arrow');
  browserArrow.setAttribute('viewBox', '0 0 140 144'); browserArrow.setAttribute('aria-hidden', 'true');
  const arrowPath = ownerDocument.createElementNS(browserArrow.namespaceURI, 'path');
  arrowPath.setAttribute('d', 'M112 126C50 123 46 81 46 16M20 43L46 16L73 43'); browserArrow.append(arrowPath);
  const card = node('div', 'voice-permission-guide__card');
  const eyebrow = node('p', 'voice-permission-guide__eyebrow', '和老师说话，只差一步');
  const title = node('h2', 'voice-permission-guide__title'); title.id = `${prefix}-title`;
  const copy = node('p', 'voice-permission-guide__copy'); copy.id = `${prefix}-copy`;
  const hint = node('p', 'voice-permission-guide__hint');
  const playbackArrow = node('span', 'voice-permission-guide__playback-arrow', '↓');
  playbackArrow.setAttribute('aria-hidden', 'true'); playbackArrow.hidden = true;
  const retry = node('button', 'voice-permission-guide__retry'); retry.type = 'button'; retry.hidden = true;
  retry.dataset.voicePermissionRetry = '';
  const cancel = node('button', 'voice-permission-guide__cancel', '取消接听'); cancel.type = 'button';
  cancel.dataset.voicePermissionCancel = '';
  card.append(eyebrow, title, copy, hint, playbackArrow, retry, cancel); root.append(browserArrow, card);
  ownerDocument.body.append(root);

  let disposed = false;
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
    // Do not steal focus from browser chrome while its permission prompt is up.
    if (root.contains(ownerDocument.activeElement) && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    previousFocus = null;
  }
  function show(state: 'pending' | 'blocked' | 'playback') {
    if (disposed) return;
    rememberFocus(); root.dataset.state = state; root.hidden = false;
    browserArrow.toggleAttribute('hidden', state === 'playback'); playbackArrow.hidden = state !== 'playback';
    retry.hidden = state === 'pending';
    if (state === 'pending') {
      title.textContent = '点一下“允许”，开启麦克风';
      copy.textContent = permissionState === 'prompt'
        ? '在浏览器上方的麦克风提示里，点击“允许”。'
        : '如果浏览器弹出麦克风提示，请点击“允许”。';
      hint.textContent = '提示可能出现在地址栏附近；箭头表示大致位置。';
    } else if (state === 'blocked') {
      title.textContent = '麦克风还没有打开';
      copy.textContent = '点击地址栏旁的权限图标，把麦克风改成“允许”，再回来重试。';
      hint.textContent = '如果仍然打不开，请让家长帮忙检查电脑的麦克风权限。';
      retry.textContent = '我已允许，重新连接';
    } else {
      title.textContent = '点一下，听到老师的声音';
      copy.textContent = '浏览器暂停了声音，点击下面的按钮继续通话。';
      hint.textContent = '这一步在页面里完成。';
      retry.textContent = '点击开启声音';
    }
    // Focus only after a resolved permission error or a playback failure, never
    // while a native prompt may be waiting for the child's choice.
    if (state !== 'pending') retry.focus({ preventScroll: true });
  }
  function blocked() { if (!disposed) { clearPending(); show('blocked'); } }
  function playbackBlocked() { if (!disposed) { clearPending(); show('playback'); } }
  function begin() {
    if (disposed) return;
    hide(); rememberFocus(); pending = true; permissionState = 'unknown';
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
      void permissions.query({ name: 'microphone' as PermissionName }).then((result) => {
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
  const onCancel = () => { hide(); options.onCancel(); };
  const onRetry = () => { hide(); options.onRetry(); };
  cancel.addEventListener('click', onCancel); retry.addEventListener('click', onRetry);
  const onKeyDown = (event: KeyboardEvent) => {
    if (root.hidden || disposed) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onCancel(); }
    else if (event.key === 'Tab') {
      const buttons = [retry, cancel].filter((button) => !button.hidden);
      const current = buttons.indexOf(ownerDocument.activeElement as HTMLButtonElement);
      const next = current < 0 ? (event.shiftKey ? buttons.length - 1 : 0)
        : (current + (event.shiftKey ? buttons.length - 1 : 1)) % buttons.length;
      event.preventDefault(); buttons[next].focus({ preventScroll: true });
    }
  };
  ownerDocument.addEventListener('keydown', onKeyDown, true);
  return {
    begin, microphoneGranted: hide, blocked, playbackBlocked, hide,
    dispose() {
      if (disposed) return;
      hide(); disposed = true; ownerDocument.removeEventListener('keydown', onKeyDown, true);
      cancel.removeEventListener('click', onCancel); retry.removeEventListener('click', onRetry); root.remove();
    },
  };
}
