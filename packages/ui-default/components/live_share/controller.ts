import { installBroadcastController } from './broadcast_controller';
import { clearSessionAnnotations } from './annotation_cache';
import { createTeacherShareControls } from './share_controls';
import type { DrawingAnchor, DrawingGeometry, DrawingNodeIdentity } from './drawing_anchor';

export interface LiveShareConfig {
  enabled: boolean; uid: number; canTeach: boolean; socketUrl: string; pageGrant?: string; domainId?: string;
}
type Controllers<Identity = number> = {
  dispose(): void; setConnected(connected: boolean): void; snapshot?(): void; getPendingDrafts?(): any[];
  receive?(data: any): void; receiveCommand?(data: any): any;
  getEditorRect?(id: string): { x: number; y: number; width: number; height: number } | null;
  getFrameRect?(id: string): { x: number; y: number; width: number; height: number } | null;
  getDrawingDocument?(frameId?: string): Document | null;
  getDrawingNodeId?(node: Element): Identity | null;
  getDrawingNode?(identity: Identity): Element | null;
  getDrawingGeometry?(anchor: DrawingAnchor): DrawingGeometry | null;
};
type Adapters = typeof import('./mirror') & typeof import('./editor') & typeof import('./frames') & typeof import('./drawing') & typeof import('./ide');
interface Student { uid: number; name: string; online: boolean; tabs?: { tabId: string; title: string; visible: boolean }[] }
interface Session { sessionId: string; connectionId?: string; pageId: string; pageUrl?: string; studentUid?: number; studentName?: string; teacherName?: string; tabId?: string }
let installed: (() => void) | undefined;

export function installLiveShare(config: LiveShareConfig, options: {
  loadAdapters?: () => Promise<Adapters>; socketFactory?: (url: string) => WebSocket;
  loadBroadcastAdapters?: () => Promise<typeof import('./broadcast_adapters')>;
} = {}) {
  if (installed || !config?.enabled || !config.uid || window.top !== window) return installed;
  // The first eligible page can start this service after the host booted. Never
  // clear/replace the child UiContext's grant while preparing our private state.
  config = { ...config };
  const platformShell = (window as any).__onebyonePlatformShell;
  const contentWindow = (): Window | null => platformShell ? platformShell.contentWindow() : window;
  let contentReady = !platformShell;
  let sourceDocument: Document | null = platformShell ? null : document;
  let currentPageUrl = location.pathname + location.search;
  let currentPageTitle = document.title.slice(0, 160);
  if (platformShell) config.pageGrant = undefined;
  const uid = config.uid;
  const randomId = () => Array.from(window.crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, '0')).join('');
  const identity = (storage: Storage | null, key: string) => {
    try {
      const old = storage?.getItem(key);
      if (old && /^[a-zA-Z0-9_-]{8,96}$/.test(old)) return old;
    } catch { /* Storage is optional; current-tab sharing still works. */ }
    const value = randomId();
    try { storage?.setItem(key, value); } catch { /* Keep in memory. */ }
    return value;
  };
  let sessionStorage: Storage | null = null;
  let localStorage: Storage | null = null;
  try { sessionStorage = window.sessionStorage; localStorage = window.localStorage; } catch { /* Private browser. */ }
  const tabKey = `onebyone.live-share.tab:${uid}`;
  let tabId = identity(sessionStorage, tabKey);
  const deviceKey = `onebyone.live-share.device:${uid}`;
  let deviceId = identity(localStorage, deviceKey);
  let pageId = randomId();
  let announcedPageId = '';
  let pendingPageUpdate: any = null;
  let helloPageUpdate: any = null;
  let pageRetryTimer = 0;
  let pageRetryAttempt = 0;
  const resumeKey = `onebyone.live-share.resume:${uid}`;
  const backupKey = `onebyone.live-share.unsynced:${uid}`;
  const closedSessions = new Set<string>();
  const switchedSessions = new Set<string>();
  const connectionVersions = new Map<string, number>();
  const pendingEdits = new Map<string, number>();
  let ending = false;
  let afterSync: (() => void) | null = null;
  let endTimer = 0;
  let backupNotice: HTMLElement | null = null;
  let backups: any[] = [];
  try { const saved = JSON.parse(sessionStorage?.getItem(backupKey) || '[]'); if (Array.isArray(saved)) backups = saved.slice(-10); } catch { /* Optional recovery. */ }
  let resume: { studentUid: number; tabId?: string; connectionId?: string } | null = null;
  try { resume = JSON.parse(sessionStorage?.getItem(resumeKey) || 'null'); } catch { /* Bad saved state is ignored. */ }
  if (!Number.isSafeInteger(resume?.studentUid) || resume.studentUid <= 0) resume = null;
  let socket: WebSocket | null = null;
  let ready = false;
  let disposed = false;
  let suspended = false;
  let authenticationRevoked = false;
  let identityReady = false;
  let shouldConnect = false;
  let tabChannel: BroadcastChannel | null = null;
  let reconnectTimer = 0;
  let reconnectDelay = 750;
  let pulseTimer = 0;
  let rosterTimer = 0;
  let generation = 0;
  let pendingStart = 0;
  let deferredStart: { studentUid: number; tabId?: string } | null = null;
  let lastPong = Date.now();
  let adaptersPromise: Promise<Adapters> | undefined;
  let source: Session | null = null;
  let viewing: Session | null = null;
  let broadcast: ReturnType<typeof installBroadcastController> | null = null;
  let switching: { requestId: string; sessionId: string; connectionId: string; mode: 'assist' | 'broadcast' } | null = null;
  let switchTimer = 0;
  let sourceMirror: Controllers | null = null;
  let sourceEditors: Controllers | null = null;
  let sourceFrames: Controllers<DrawingNodeIdentity> | null = null;
  let sourceDrawing: Controllers | null = null;
  let sourceIde: Controllers | null = null;
  let viewerIde: Controllers | null = null;
  let sourceDrawingRoot: HTMLElement | null = null;
  let viewerMirror: Controllers | null = null;
  let viewerEditors: Controllers | null = null;
  let viewerFrames: Controllers<DrawingNodeIdentity> | null = null;
  let viewerDrawing: Controllers | null = null;
  let localDrawing: Controllers | null = null;
  let localDrawingRoot: HTMLElement | null = null;
  let overlay: HTMLElement | null = null;
  let viewport: HTMLElement | null = null;
  let surface: HTMLElement | null = null;
  let stage: HTMLElement | null = null;
  let zoomControls: HTMLElement | null = null;
  let manualScale: number | null = null;
  let stageScale = 1;
  let panReady = false;
  let panGesture: { pointerId: number; x: number; y: number } | null = null;
  let pageStatus: HTMLElement | null = null;
  let statusMessage = '';
  let notice: HTMLElement | null = null;
  let roster: HTMLElement | null = null;
  let rosterList: HTMLElement | null = null;
  let search: HTMLInputElement | null = null;
  let students: Student[] = [];
  let studentWidth = 1440;
  let studentHeight = 900;
  let original: { focus: HTMLElement | null; x: number; y: number; overflow: string; inert: [HTMLElement, boolean][] } | null = null;
  const disposers: (() => void)[] = [];
  const buffered: any[] = [];
  let bufferedBytes = 0;
  function on(target: EventTarget, event: string, callback: any, opts?: AddEventListenerOptions) {
    target.addEventListener(event, callback, opts);
    disposers.push(() => target.removeEventListener(event, callback, opts));
  }
  const el = (tag: string, cls: string, text = '') => {
    const node = document.createElement(tag);
    node.className = cls;
    node.textContent = text;
    return node;
  };
  function button(text: string, cls: string, run: () => void) {
    const node = el('button', cls, text) as HTMLButtonElement;
    node.type = 'button'; node.addEventListener('click', run); return node;
  }
  function loadAdapters() {
    if (!adaptersPromise) {
      adaptersPromise = options.loadAdapters ? options.loadAdapters() : Promise.all([
        import(/* webpackChunkName: "live-share" */ './mirror'), import(/* webpackChunkName: "live-share" */ './editor'),
        import(/* webpackChunkName: "live-share" */ './frames'),
        import(/* webpackChunkName: "live-share-drawing" */ './drawing'),
        import(/* webpackChunkName: "live-share-ide" */ './ide'),
      ])
        .then(([mirror, editor, frames, drawing, ide]) => ({ ...mirror, ...editor, ...frames, ...drawing, ...ide }));
      adaptersPromise.catch(() => { adaptersPromise = undefined; });
    }
    return adaptersPromise;
  }
  function loadSourceAdapters(): Promise<Adapters> {
    if (!platformShell) return loadAdapters();
    const factories = (contentWindow() as any)?.__onebyoneLiveShareSources;
    return factories?.loadAdapters ? factories.loadAdapters() : Promise.reject(new Error('Page is loading'));
  }
  function send(payload: any) {
    // Never queue stale clicks/edits in a reconnecting socket.
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    if (socket.bufferedAmount > 2 * 1024 * 1024) {
      ready = false; connected(false); socket.close(); return false;
    }
    socket.send(JSON.stringify(payload)); return true;
  }
  function relay(session: Session, kind: string, data: any) {
    if (!ready || disposed || !session || (session !== viewing && session !== source)) return false;
    return send({ type: 'relay', sessionId: session.sessionId, pageId: session.pageId, kind, data });
  }
  function saveResume(value: typeof resume) {
    resume = value;
    try {
      if (value) sessionStorage?.setItem(resumeKey, JSON.stringify(value));
      else sessionStorage?.removeItem(resumeKey);
    } catch { /* Current page remains usable. */ }
  }
  function setStatus(text: string, blocking = false) {
    statusMessage = text;
    if (pageStatus) { pageStatus.textContent = text; pageStatus.hidden = !text; pageStatus.classList.toggle('is-blocking', blocking); }
    updateControls();
  }
  function connected(value: boolean) {
    broadcast?.setConnected(value);
    sourceMirror?.setConnected(value); sourceEditors?.setConnected(value);
    sourceFrames?.setConnected(value); sourceDrawing?.setConnected(value); sourceIde?.setConnected(value);
    viewerMirror?.setConnected(value); viewerEditors?.setConnected(value);
    viewerFrames?.setConnected(value); viewerDrawing?.setConnected(value); viewerIde?.setConnected(value);
    overlay?.classList.toggle('is-disconnected', !value);
    if (!value && viewing) setStatus('连接中断，正在重新连接…', true);
    if (notice && source) notice.querySelector('span')!.textContent = value
      ? `${source.teacherName || '老师'}正在协助` : '共享连接中断，正在重新连接…';
    updateControls();
  }
  function drawingRoot(doc = document) {
    const node = doc.createElement('div'); node.className = 'live-share-drawing-root';
    node.dataset.liveSharePrivate = ''; node.dataset.liveShareUi = '';
    node.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147482000';
    doc.body.append(node);
    return node;
  }
  function updateLocalDrawing() { localDrawing?.setConnected(contentReady && !disposed && !suspended && !viewing && !source && !broadcast?.active); }
  let localDrawingGeneration = 0;
  function installLocalDrawing() {
    const version = ++localDrawingGeneration;
    localDrawing?.dispose(); localDrawing = null; localDrawingRoot?.remove(); localDrawingRoot = null;
    if (!config.canTeach || !contentReady) return;
    const win = contentWindow();
    const drawing = platformShell ? (win as any)?.__onebyoneLiveShareSources?.loadDrawing?.()
      : options.loadAdapters ? options.loadAdapters() : import(/* webpackChunkName: "live-share-drawing" */ './drawing');
    drawing?.then((adapter) => {
      if (disposed || version !== localDrawingGeneration || !contentReady || win !== contentWindow() || !adapter.attachTemporaryDrawing) return;
      localDrawingRoot = drawingRoot(win!.document);
      localDrawing = adapter.attachTemporaryDrawing({ pageId, container: localDrawingRoot, teacher: true, scopeDocument: true });
      updateLocalDrawing();
    }).catch(() => { /* The local pen must not interrupt the page. */ });
  }
  function clearSource() {
    sourceMirror?.dispose(); sourceEditors?.dispose();
    sourceFrames?.dispose(); sourceFrames = null;
    sourceDrawing?.dispose(); sourceDrawing = null;
    sourceIde?.dispose(); sourceIde = null;
    sourceDrawingRoot?.remove(); sourceDrawingRoot = null;
    sourceMirror = null; sourceEditors = null; source = null;
    notice?.remove(); notice = null;
    updateLocalDrawing();
  }
  function clearViewAdapters() {
    viewerMirror?.dispose(); viewerEditors?.dispose(); viewerMirror = null; viewerEditors = null;
    viewerFrames?.dispose(); viewerFrames = null;
    viewerDrawing?.dispose(); viewerDrawing = null;
    viewerIde?.dispose(); viewerIde = null;
    stage?.replaceChildren(); buffered.length = 0; bufferedBytes = 0; pendingEdits.clear();
  }
  function closeView() {
    generation++; clearViewAdapters(); viewing = null;
    updateLocalDrawing();
    endViewPan(); manualScale = null; stageScale = 1;
    overlay?.remove(); overlay = null; viewport = null; surface = null; stage = null; zoomControls = null; pageStatus = null;
    document.body.classList.remove('live-share-viewing');
    if (original) {
      const saved = original; original = null;
      document.body.style.overflow = saved.overflow;
      for (const [node, inert] of saved.inert) if (node.isConnected) node.inert = inert;
      window.scrollTo(saved.x, saved.y);
      if (saved.focus?.isConnected) saved.focus.focus({ preventScroll: true });
    }
    updateControls();
    window.dispatchEvent(new Event('resize'));
  }
  function showBackups() {
    if (!backups.length || backupNotice) return;
    backupNotice = el('aside', 'live-share-backup'); backupNotice.dataset.liveSharePrivate = '';
    backupNotice.append(el('span', '', '有尚未同步的代码修改，已保留副本。'));
    backupNotice.append(button('下载副本', 'live-share-button', () => {
      const text = backups.map((item) => `${item.studentName || '学员'} · ${item.time}\n${item.value}\n`).join('\n--------------------\n\n');
      const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = '未同步的课堂代码.txt'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }), button('收起', 'live-share-button', () => { backupNotice?.remove(); backupNotice = null; }));
    document.body.append(backupNotice);
  }
  function preservePending() {
    const drafts = viewerEditors?.getPendingDrafts?.() || [];
    if (!drafts.length) return;
    backups = [...backups, ...drafts.filter((draft) => !backups.some((saved) => saved.studentUid === viewing?.studentUid
      && saved.editorId === draft.editorId && saved.value === draft.value)).map((draft) => ({ ...draft, studentUid: viewing?.studentUid,
      studentName: viewing?.studentName, time: new Date().toISOString() }))].slice(-10);
    try { sessionStorage?.setItem(backupKey, JSON.stringify(backups)); } catch { /* Keep a downloadable in-memory copy. */ }
  }
  function finishEnding() {
    clearTimeout(endTimer); ending = false; afterSync = null; preservePending();
    const current = viewing || source;
    if (current) { closedSessions.add(current.sessionId); send({ type: 'stop', sessionId: current.sessionId }); }
    saveResume(null); pendingStart = 0; deferredStart = null;
    closeView(); clearSource(); closeRoster();
    if (current) clearSessionAnnotations(current.connectionId || current.sessionId);
    showBackups();
  }
  function finishSync() {
    if (!ending) return;
    const action = afterSync;
    clearTimeout(endTimer); ending = false; afterSync = null;
    preservePending(); showBackups(); action?.();
  }
  function waitForEdits(action: () => void, message: string) {
    if (ending) return true;
    if (![...pendingEdits.values()].some((count) => count > 0)) return false;
    ending = true; afterSync = action; setStatus(message, true);
    const sessionId = viewing?.sessionId;
    endTimer = window.setTimeout(() => { if (ending && viewing?.sessionId === sessionId) finishSync(); }, 10000);
    return true;
  }
  function endSharing() {
    if (!waitForEdits(finishEnding, '正在同步最后的修改，完成后自动返回…')) finishEnding();
  }
  function retireAssist() {
    clearTimeout(endTimer); ending = false; afterSync = null;
    preservePending(); saveResume(null); closeView(); clearSource(); showBackups();
  }
  const controls = config.canTeach ? createTeacherShareControls({
    onSwitch: switchMode,
    onEnd: () => { if (viewing) endSharing(); else broadcast?.stopSharing(); },
    onChooseStudent: openRoster,
  }) : null;
  function updateControls() {
    if (!controls) return;
    const room = broadcast?.teacherRoom;
    const busy = !!switching || ending;
    if (viewing) controls.update({ mode: 'assist', studentName: viewing.studentName, busy,
      status: switching ? '正在切换画面…' : statusMessage || '画面已同步',
      switchDisabled: !ready || !contentReady || !config.pageGrant,
      canChooseStudent: !viewing.connectionId || viewing.connectionId === viewing.sessionId });
    else if (room) controls.update({ mode: 'broadcast', students: room.viewers, busy,
      status: switching ? '正在切换画面…' : broadcast?.teacherStatus,
      switchDisabled: !ready });
    else if (!switching) controls.update(null);
  }
  function clearSwitch() {
    clearTimeout(switchTimer); switchTimer = 0; switching = null;
    updateControls();
  }
  function switchMode(studentUid?: number) {
    const current = viewing || broadcast?.teacherRoom;
    if (!ready || !current || switching || ending || (viewing && (!contentReady || !config.pageGrant))) return;
    const change = { sessionId: current.sessionId, connectionId: current.connectionId || current.sessionId,
      requestId: randomId(), mode: viewing ? 'broadcast' as const : 'assist' as const };
    switching = change;
    closeRoster();
    updateControls();
    const transmit = () => {
      if (switching !== change) return;
      const { sessionId, requestId, mode } = change;
      if (!send({ type: 'switch', sessionId, requestId, mode, ...(studentUid === undefined ? {} : { studentUid }) })) {
        clearSwitch(); broadcast?.showMessage('连接正在恢复，请稍后切换。'); return;
      }
      switchTimer = window.setTimeout(() => {
        if (switching !== change) return;
        clearSwitch(); broadcast?.showMessage('正在重新同步连接状态…'); socket?.close();
      }, 15000);
    };
    if (!viewing || !waitForEdits(transmit, '正在同步最后的修改…')) transmit();
  }
  function resumeMode(message: any, mode: 'assist' | 'broadcast') {
    if (switching && switching.mode === mode && message.sessionId !== switching.sessionId
      && message.connectionId === switching.connectionId) clearSwitch();
  }
  function sizeStage() {
    if (!stage || !viewport || !surface) return;
    // All mirrored layers retain the learner's CSS-pixel dimensions. Only the
    // teacher's outer surface scales; changing it never resizes the learner.
    viewport.style.overflow = manualScale === null ? 'hidden' : 'auto';
    const scale = manualScale ?? Math.min(viewport.clientWidth / studentWidth, viewport.clientHeight / studentHeight);
    if (!Number.isFinite(scale) || scale <= 0) return;
    stageScale = scale;
    stage.style.width = `${studentWidth}px`; stage.style.height = `${studentHeight}px`;
    stage.style.transform = `scale(${scale})`;
    // Scrollbars consume layout space on some platforms. Settle both axes so a
    // newly visible scrollbar doesn't create a second, phantom scrolling axis.
    for (let pass = 0; pass < 3; pass++) {
      const width = Math.max(viewport.clientWidth, studentWidth * scale);
      const height = Math.max(viewport.clientHeight, studentHeight * scale);
      surface.style.width = `${width}px`; surface.style.height = `${height}px`;
      stage.style.left = `${(width - studentWidth * scale) / 2}px`;
      stage.style.top = `${(height - studentHeight * scale) / 2}px`;
    }
    if (manualScale === null) { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
    const percent = zoomControls?.querySelector<HTMLElement>('[data-share-zoom-value]');
    if (percent) percent.textContent = `${Math.round(scale * 100)}%`;
    zoomControls?.querySelector('[data-share-zoom-fit]')?.setAttribute('aria-pressed', String(manualScale === null));
    const overflow = studentWidth * scale > viewport.clientWidth + 1 || studentHeight * scale > viewport.clientHeight + 1;
    const hint = zoomControls?.querySelector<HTMLElement>('[data-share-pan-hint]');
    if (hint) hint.hidden = !overflow;
    zoomControls?.querySelector<HTMLButtonElement>('[data-share-zoom-out]')?.toggleAttribute('disabled', scale <= 0.1);
    zoomControls?.querySelector<HTMLButtonElement>('[data-share-zoom-in]')?.toggleAttribute('disabled', scale >= 4);
  }
  function zoomView(scale: number | null, anchor?: { clientX: number; clientY: number }) {
    if (!viewport || !stage) return;
    const rect = viewport.getBoundingClientRect();
    const x = anchor ? Math.max(0, Math.min(viewport.clientWidth, anchor.clientX - rect.left)) : viewport.clientWidth / 2;
    const y = anchor ? Math.max(0, Math.min(viewport.clientHeight, anchor.clientY - rect.top)) : viewport.clientHeight / 2;
    const sourceX = (viewport.scrollLeft + x - parseFloat(stage.style.left || '0')) / stageScale;
    const sourceY = (viewport.scrollTop + y - parseFloat(stage.style.top || '0')) / stageScale;
    manualScale = scale === null ? null : Math.max(0.1, Math.min(4, scale));
    sizeStage();
    // Preserve the point under the cursor (or the centre when using buttons).
    if (manualScale !== null) {
      viewport.scrollLeft = sourceX * stageScale + parseFloat(stage.style.left) - x;
      viewport.scrollTop = sourceY * stageScale + parseFloat(stage.style.top) - y;
    }
  }
  function wheelZoom({ delta, clientX, clientY }: { delta: number; clientX: number; clientY: number }) {
    if (Number.isFinite(delta) && Number.isFinite(clientX) && Number.isFinite(clientY)) {
      zoomView(stageScale * Math.exp(-Math.max(-100, Math.min(100, delta)) * 0.003), { clientX, clientY });
    }
  }
  function panView({ dx, dy }: { dx: number; dy: number }) {
    if (viewport && Number.isFinite(dx) && Number.isFinite(dy)) { viewport.scrollLeft += dx; viewport.scrollTop += dy; }
  }
  function endViewPan() {
    if (panGesture && viewport?.hasPointerCapture(panGesture.pointerId)) viewport.releasePointerCapture(panGesture.pointerId);
    panGesture = null; panReady = false;
    viewport?.classList.remove('is-pan-ready', 'is-panning');
  }
  function editableTarget(target: EventTarget | null) {
    return target instanceof Element && !!target.closest('input, textarea, select, button, a, [contenteditable], .monaco-editor, .live-share-editors');
  }
  function createZoomControls() {
    const controls = el('div', 'live-share-zoom');
    const bar = el('div', 'live-share-zoom__bar'); bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '共享画面缩放');
    const minus = button('−', 'live-share-zoom__step', () => zoomView(stageScale / 1.2)); minus.dataset.shareZoomOut = '';
    minus.setAttribute('aria-label', '缩小画面'); minus.title = '缩小共享画面';
    const value = button('100%', 'live-share-zoom__value', () => {
      zoomView(1);
      // Reading from 100% should start at the page's left edge, so code line
      // starts aren't cropped. Incremental/pointer zoom retains its anchor.
      if (viewport) { viewport.scrollLeft = 0; viewport.scrollTop = 0; }
    }); value.dataset.shareZoomValue = '';
    value.setAttribute('aria-label', '恢复原始大小（100%）'); value.title = '恢复 100% 并回到左上角，仅调整老师的显示';
    const plus = button('+', 'live-share-zoom__step', () => zoomView(stageScale * 1.2)); plus.dataset.shareZoomIn = '';
    plus.setAttribute('aria-label', '放大画面'); plus.title = '放大共享画面';
    const fit = button('适合窗口', 'live-share-zoom__fit', () => zoomView(null)); fit.dataset.shareZoomFit = '';
    fit.title = '完整显示学员画面';
    bar.append(minus, value, plus, fit);
    const hint = el('span', 'live-share-zoom__hint', '空格拖动画面'); hint.dataset.sharePanHint = ''; hint.hidden = true;
    controls.append(bar, hint); return controls;
  }
  function createOverlay() {
    if (overlay) return;
    original = { focus: document.activeElement as HTMLElement, x: window.scrollX, y: window.scrollY,
      overflow: document.body.style.overflow, inert: [] };
    // Keep the teacher's original DOM/editor models alive, with all input routed
    // to the sharing layer. No location change or account impersonation occurs.
    for (const child of Array.from(document.body.children)) {
      if (!(child instanceof HTMLElement) || child.matches('[data-teacher-assistant], [data-live-share-private], script, style, link')) continue;
      original.inert.push([child, child.inert]); child.inert = true;
    }
    document.body.style.overflow = 'hidden'; document.body.classList.add('live-share-viewing');
    overlay = el('section', 'live-share-overlay'); overlay.dataset.liveSharePrivate = '';
    overlay.setAttribute('aria-label', '学员实时共享界面');
    viewport = el('div', 'live-share-viewport'); viewport.tabIndex = -1;
    surface = el('div', 'live-share-surface'); stage = el('div', 'live-share-stage');
    for (const name of ['keydown', 'keyup', 'keypress']) overlay.addEventListener(name, (event) => event.stopPropagation());
    surface.append(stage); viewport.append(surface); overlay.append(viewport);
    viewport.addEventListener('wheel', (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault(); event.stopImmediatePropagation();
      wheelZoom({ delta: event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport!.clientHeight : 1), clientX: event.clientX, clientY: event.clientY });
    }, { capture: true, passive: false });
    viewport.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || editableTarget(event.target)) return;
      viewport?.focus({ preventScroll: true });
      if (!panReady) return;
      event.preventDefault(); event.stopImmediatePropagation();
      panGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
      viewport?.setPointerCapture(event.pointerId); viewport?.classList.add('is-panning');
    }, true);
    viewport.addEventListener('pointermove', (event) => {
      if (!panGesture || event.pointerId !== panGesture.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      panView({ dx: panGesture.x - event.clientX, dy: panGesture.y - event.clientY });
      panGesture.x = event.clientX; panGesture.y = event.clientY;
    }, true);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(name, endViewPan);
    zoomControls = createZoomControls(); overlay.append(zoomControls);
    pageStatus = el('div', 'live-share-status'); pageStatus.setAttribute('role', 'status');
    overlay.append(pageStatus); document.body.append(overlay);
    sizeStage(); window.dispatchEvent(new Event('resize'));
  }
  async function startView(next: Session) {
    if (!next.sessionId || !next.pageId) return;
    if (closedSessions.has(next.sessionId)) { send({ type: 'stop', sessionId: next.sessionId }); return; }
    if (viewing?.sessionId === next.sessionId && viewing.pageId === next.pageId && viewerMirror && viewerEditors) {
      connected(true); return;
    }
    if (viewing?.sessionId !== next.sessionId) { clearTimeout(endTimer); ending = false; afterSync = null; }
    const currentGeneration = ++generation;
    preservePending(); clearViewAdapters(); viewing = next; updateLocalDrawing();
    createOverlay();
    setStatus('正在同步学员画面…', true);
    saveResume({ studentUid: next.studentUid!, tabId: next.tabId, connectionId: next.connectionId });
    closeRoster();
    document.querySelector<HTMLButtonElement>('[data-assistant-close]')?.click();
    try {
      const adapters = await loadAdapters();
      if (disposed || currentGeneration !== generation || viewing !== next || !stage) return;
      const mirrorRoot = el('div', 'live-share-mirror');
      const editorRoot = el('div', 'live-share-editors');
      const frameRoot = el('div', 'live-share-frames');
      frameRoot.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
      stage.append(mirrorRoot, frameRoot, editorRoot);
      const annotationScope = next.pageUrl ? { sessionId: `${next.connectionId || next.sessionId}:assist:${next.studentUid}`, url: next.pageUrl } : undefined;
      viewerMirror = adapters.attachViewerMirror({ pageId: next.pageId, container: mirrorRoot,
        annotationScope,
        onDocument: adapters.attachIdeCapacityMirror,
        sendCommand: (data) => relay(next, 'command', data),
        onViewZoom: wheelZoom, onViewPan: panView,
        onViewport: (size: any) => {
          studentWidth = Math.max(320, Math.min(7680, size.width || 1440));
          studentHeight = Math.max(240, Math.min(4320, size.height || 900)); sizeStage();
          if (ready && viewing === next) { setStatus(''); overlay?.classList.remove('is-disconnected'); }
        }, onStatus: (message: string) => {
          if (!message || viewing !== next) return;
          setStatus(message);
          if (message.includes('同步中断')) { ready = false; connected(false); socket?.close(); }
        },
      });
      viewerFrames = adapters.attachViewerFrames?.({ pageId: next.pageId, container: frameRoot,
        getNodeRect: (id) => viewerMirror?.getFrameRect?.(id) || null,
        sendCommand: (data) => relay(next, 'command', data), onViewZoom: wheelZoom, onViewPan: panView,
        onStatus: (message: string) => { if (message && viewing === next) setStatus(message); },
      }) || null;
      viewerEditors = adapters.attachViewerEditors({ pageId: next.pageId, container: editorRoot,
        annotationScope,
        getNodeRect: (id) => viewerMirror?.getEditorRect?.(id) || undefined,
        send: (data) => relay(next, 'editor', data),
        onStatus: (status: any) => {
          pendingEdits.set(status.editorId, status.pending || 0);
          if (ending && ![...pendingEdits.values()].some((count) => count > 0)) { queueMicrotask(finishSync); return; }
          if (status.error) setStatus(status.error);
          else if (status.pending) setStatus('正在同步修改…');
          else if (status.connected && status.ready && !overlay?.classList.contains('is-disconnected')) setStatus('');
        },
      });
      viewerDrawing = adapters.attachTemporaryDrawing?.({ pageId: next.pageId, container: stage, teacher: true,
        annotationScope, annotationDocument: (frameId?: string) => (frameId
          ? viewerFrames?.getDrawingDocument?.(frameId) || null : viewerMirror?.getDrawingDocument?.() || null),
        anchors: {
          identify: (node) => {
            const nodeId = viewerMirror?.getDrawingNodeId?.(node);
            return nodeId ? { nodeId } : viewerFrames?.getDrawingNodeId?.(node) || null;
          },
          resolve: (identity) => identity.frameId ? viewerFrames?.getDrawingNode?.(identity) || null
            : viewerMirror?.getDrawingNode?.(identity.nodeId) || null,
        },
        send: (drawing) => relay(next, 'command', { id: randomId(), pageId: next.pageId, nodeId: 1, action: 'draw', drawing }),
      }) || null;
      viewerIde = adapters.attachViewerIde?.({ pageId: next.pageId, container: stage,
        sendCommand: (data) => relay(next, 'command', data),
      }) || null;
      const waiting = buffered.splice(0); bufferedBytes = 0;
      waiting.forEach(receiveRelay);
      viewerMirror.setConnected(ready); viewerEditors.setConnected(ready);
      viewerFrames?.setConnected(ready);
      viewerDrawing?.setConnected(ready); viewerIde?.setConnected(ready);
    } catch {
      if (viewing === next) setStatus('共享组件加载失败，请断开后重试。', true);
    }
  }
  async function startSource(next: Session) {
    if (!contentReady || next.pageId !== pageId || !config.pageGrant) return;
    if (source?.sessionId === next.sessionId && source.pageId === next.pageId && sourceMirror && sourceEditors) {
      connected(true); return;
    }
    clearSource(); source = next; updateLocalDrawing();
    notice = el('div', 'live-share-notice'); notice.dataset.liveSharePrivate = '';
    notice.setAttribute('role', 'status'); notice.append(el('i', 'live-share-dot'), el('span', '', `${next.teacherName || '老师'}正在协助`));
    document.body.append(notice);
    const sourceStatus = (message: string) => {
      if (source !== next) return;
      if (notice) notice.querySelector('span')!.textContent = message;
      relay(next, 'ack', { id: randomId(), pageId, ok: false, reason: message });
      if (message.includes('同步中断')) { ready = false; connected(false); socket?.close(); }
    };
    try {
      const adapters = await loadSourceAdapters();
      if (disposed || source !== next) return;
      sourceEditors = adapters.attachSourceEditors({ pageId,
        send: (data) => relay(next, 'editor', data),
        onStatus: (status: any) => { if (status.error) sourceStatus(status.error); },
      });
      sourceFrames = adapters.attachSourceFrames?.({ pageId,
        send: (data) => relay(next, 'mirror', data), sendAck: (data) => relay(next, 'ack', data), onStatus: sourceStatus,
      }) || null;
      if (adapters.attachTemporaryDrawing) {
        sourceDrawingRoot = drawingRoot(contentWindow()!.document);
        sourceDrawing = adapters.attachTemporaryDrawing({ pageId, container: sourceDrawingRoot, teacher: false,
          anchors: {
            identify: (node) => {
              const nodeId = sourceMirror?.getDrawingNodeId?.(node);
              return nodeId ? { nodeId } : null;
            },
            resolve: (identity) => identity.frameId ? null : sourceMirror?.getDrawingNode?.(identity.nodeId) || null,
            frameGeometry: (anchor) => sourceFrames?.getDrawingGeometry?.(anchor) || null,
          },
        });
      }
      sourceMirror = adapters.attachSourceMirror({ pageId,
        send: (data) => relay(next, 'mirror', data),
        sendAck: (data) => relay(next, 'ack', data),
        onStatus: sourceStatus,
      });
      sourceIde = adapters.attachSourceIde?.({ pageId, send: (data) => relay(next, 'mirror', data),
        sendAck: (data) => relay(next, 'ack', data),
      }) || null;
      sourceEditors.setConnected(ready); sourceMirror.setConnected(ready);
      sourceIde?.setConnected(ready);
      sourceFrames?.setConnected(ready);
      sourceDrawing?.setConnected(ready);
    } catch {
      if (source === next) {
        relay(next, 'ack', { id: randomId(), pageId, ok: false, reason: '学员端共享组件加载失败，请重新连接。' });
        clearSource();
      }
    }
  }
  function receiveRelay(message: any) {
    const session = viewing || source;
    if (!session || message.sessionId !== session.sessionId || message.pageId !== session.pageId) return;
    if (viewing && (!viewerMirror || !viewerEditors)) {
      const bytes = JSON.stringify(message).length;
      if (buffered.length < 160 && bufferedBytes + bytes < 8 * 1024 * 1024) { buffered.push(message); bufferedBytes += bytes; }
      else { ready = false; connected(false); socket?.close(); }
      return;
    }
    if (viewing) {
      if (message.kind === 'mirror') {
        if (message.data?.type === 'ide') viewerIde?.receive?.(message.data);
        else if (['frame', 'frame-remove'].includes(message.data?.type)) viewerFrames?.receive?.(message.data);
        else viewerMirror?.receive?.(message.data);
      }
      if (message.kind === 'editor') viewerEditors?.receive?.(message.data);
      if (message.kind === 'ack' && message.data?.ok === false) {
        const reason = message.data.message || message.data.reason || '这项操作请由学员完成';
        if (reason.includes('已暂停')) connected(false);
        setStatus(reason, reason.includes('已暂停'));
      }
    } else {
      if (message.kind === 'command') {
        if (message.data?.action === 'ide') sourceIde?.receiveCommand?.(message.data);
        else if (message.data?.action === 'frame') sourceFrames?.receiveCommand?.(message.data);
        else if (message.data?.action === 'draw') sourceDrawing?.receive?.(message.data.drawing);
        else sourceMirror?.receiveCommand?.(message.data);
      }
      if (message.kind === 'editor') sourceEditors?.receive?.(message.data);
    }
  }
  function onMessage(message: any) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'switch:error' || (message.type === 'error' && message.operation === 'switch')) {
      if (switching?.requestId !== message.requestId) return;
      clearSwitch();
      broadcast?.showMessage(message.message || '暂时无法切换，请稍后重试。');
      return;
    }
    const connectionId = message.connectionId || message.sessionId;
    if (message.type === 'connection:ended' && connectionId) {
      connectionVersions.set(connectionId, Infinity);
      const assist = viewing || source;
      if (assist && (assist.connectionId || assist.sessionId) === connectionId) retireAssist();
      const room = broadcast?.currentRoom;
      if (room && (room.connectionId || room.sessionId) === connectionId) {
        broadcast?.receive({ ...message, type: 'broadcast:ended', sessionId: room.sessionId });
      }
      clearSessionAnnotations(connectionId);
      if (switching?.connectionId === connectionId) clearSwitch();
      return;
    }
    if (switchedSessions.has(message.sessionId)) return;
    if (message.switched && ['ended', 'broadcast:ended'].includes(message.type)) {
      switchedSessions.add(message.sessionId);
      if (message.connectionVersion > (connectionVersions.get(connectionId) || 0)) connectionVersions.set(connectionId, message.connectionVersion);
    }
    if (connectionId && ['started', 'share-start', 'broadcast:started', 'broadcast:view'].includes(message.type)) {
      const version = message.connectionVersion || 0;
      if (version < (connectionVersions.get(connectionId) || 0)) return;
      connectionVersions.set(connectionId, version);
    }
    if ((message.type === 'error' || message.error) && message.operation === 'page') {
      // Late failures/acks from a previous navigation cannot revive that page.
      // Handle transient page failures before broadcast sees a generic error:
      // retrying this state must not restart the room or its healthy socket.
      if (pendingPageUpdate?.requestId !== message.requestId) return;
      if (/^(?:RATE_LIMIT|BACKPRESSURE|UNAVAILABLE|NOT_READY)$/.test(message.code || '')) {
        schedulePageRetry();
        return;
      }
      clearTimeout(pageRetryTimer); pageRetryTimer = 0; pendingPageUpdate = null;
    }
    if (message.type === 'broadcast:started' && viewing && message.connectionId
      && message.connectionId === (viewing.connectionId || viewing.sessionId)) {
      switchedSessions.add(viewing.sessionId);
      retireAssist();
    }
    if (message.type === 'broadcast:view' && source && message.connectionId
      && message.connectionId === (source.connectionId || source.sessionId)) {
      switchedSessions.add(source.sessionId); clearSource();
    }
    broadcast?.receive(message);
    if (message.type === 'broadcast:started' && broadcast?.teacherRoom?.sessionId === message.sessionId) resumeMode(message, 'broadcast');
    if (message.type === 'broadcast:ended' && !message.switched && switching?.connectionId === (message.connectionId || message.sessionId)) clearSwitch();
    if (String(message.type).startsWith('broadcast:')) return;
    if (message.type === 'ready') {
      ready = true; reconnectDelay = 750;
      if (platformShell) {
        // Hello acknowledges exactly the page state sent when this socket opened.
        // Navigation may have already advanced to a later ready/loading state.
        if (pendingPageUpdate === helloPageUpdate) pendingPageUpdate = null;
        if (pendingPageUpdate) transmitCurrentPage();
        else if (announcedPageId !== pageId) sendCurrentPage();
      }
      for (const sessionId of closedSessions) send({ type: 'stop', sessionId });
      if (roster) send({ type: 'list' });
      if (config.canTeach && deferredStart) {
        const target = deferredStart; deferredStart = null;
        chooseStudent(target.studentUid, target.tabId, true);
      } else if (config.canTeach && resume && !resume.connectionId && !viewing && !switching) chooseStudent(resume.studentUid, resume.tabId);
      updateControls();
      return;
    }
    if (message.type === 'page-ready') {
      if (pendingPageUpdate?.requestId === message.requestId && pendingPageUpdate.pageId === message.pageId) {
        clearTimeout(pageRetryTimer); pageRetryTimer = 0; pendingPageUpdate = null; pageRetryAttempt = 0;
      }
      return;
    }
    if (message.type === 'students') { students = Array.isArray(message.students) ? message.students : []; renderStudents(); }
    if (message.type === 'started') {
      const room = broadcast?.teacherRoom;
      if (room && message.connectionId && message.connectionId === (room.connectionId || room.sessionId)) {
        switchedSessions.add(room.sessionId);
        broadcast?.receive({ type: 'broadcast:ended', sessionId: room.sessionId, connectionId: message.connectionId, switched: true });
      }
      pendingStart = 0; void startView(message); resumeMode(message, 'assist');
    }
    if (message.type === 'share-start') {
      const room = broadcast?.currentRoom;
      if (room && message.connectionId && message.connectionId === (room.connectionId || room.sessionId)) {
        switchedSessions.add(room.sessionId);
        broadcast?.receive({ type: 'broadcast:ended', sessionId: room.sessionId, connectionId, switched: true });
      }
      void startSource(message);
    }
    if (message.type === 'relay') receiveRelay(message);
    if (message.type === 'paused' && (message.sessionId === viewing?.sessionId || message.sessionId === source?.sessionId)) {
      connected(false); setStatus(message.reason || '学员正在切换页面，稍候自动恢复…', true);
    }
    if (message.type === 'ended') {
      closedSessions.delete(message.sessionId);
      if (message.sessionId === viewing?.sessionId || message.sessionId === source?.sessionId) retireAssist();
      if (!message.followed && !message.switched) {
        clearSessionAnnotations(connectionId);
        if (switching?.connectionId === connectionId) clearSwitch();
      }
    }
    if (message.type === 'error' || message.error) {
      pendingStart = 0;
      const text = message.message || '共享连接暂时不可用，请稍后重试';
      if (rosterList) { rosterList.replaceChildren(el('p', 'live-share-empty', text)); }
      else if (viewing) setStatus(text, true);
      if (/permission|forbidden|expired|scope/i.test(message.code || message.error || '')) {
        ready = false; connected(false); saveResume(null);
      }
      if (/^(?:STALE_PAGE|PAUSED|BACKPRESSURE|RATE_LIMIT)$/.test(message.code || '')) {
        ready = false; connected(false); socket?.close();
      }
    }
  }
  function connect() {
    if (!identityReady) { shouldConnect = true; return; }
    if (disposed || suspended || authenticationRevoked || socket && socket.readyState < WebSocket.CLOSING) return;
    if (platformShell && !config.canTeach && (!contentReady || !config.pageGrant)) return;
    const url = new URL(config.socketUrl, window.location.href);
    if (url.origin !== window.location.origin) return;
    url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = options.socketFactory ? options.socketFactory(url.href) : new WebSocket(url.href);
    socket = ws;
    ws.addEventListener('open', () => {
      if (socket !== ws || disposed) return;
      lastPong = Date.now();
      // Simultaneously opened idle tabs can race on their first device ID write.
      // Use the settled browser-wide identity when the actual connection starts.
      try {
        const currentDevice = localStorage?.getItem(deviceKey);
        if (currentDevice && /^[a-zA-Z0-9_-]{8,96}$/.test(currentDevice)) deviceId = currentDevice;
      } catch { /* Keep the stable in-memory identity if storage is unavailable. */ }
      announcedPageId = pageId;
      helloPageUpdate = pendingPageUpdate;
      send({ type: 'hello', tabId, pageId, pageGrant: config.pageGrant, deviceId,
        url: contentReady ? currentPageUrl : '', title: currentPageTitle, visible: !document.hidden });
      clearInterval(pulseTimer);
      pulseTimer = window.setInterval(() => {
        if (Date.now() - lastPong > 65000) { ws.close(); return; }
        if (ws.readyState === WebSocket.OPEN) { ws.send('ping'); send({ type: 'pulse', visible: !document.hidden }); }
      }, 20000);
    });
    ws.addEventListener('message', (event) => {
      if (socket !== ws || disposed) return;
      lastPong = Date.now();
      if (event.data === 'pong') return;
      if (event.data === 'ping') { ws.send('pong'); return; }
      try { onMessage(JSON.parse(event.data)); } catch (error) { console.warn('Invalid live sharing message', error); }
    });
    ws.addEventListener('close', (event: CloseEvent) => {
      if (socket !== ws || disposed) return;
      ready = false; socket = null; pendingStart = 0; clearInterval(pulseTimer); clearTimeout(pageRetryTimer); connected(false);
      if (event.code === 4003) {
        authenticationRevoked = true; clearTimeout(reconnectTimer); saveResume(null); deferredStart = null;
        const connectionId = viewing?.connectionId || viewing?.sessionId;
        clearSwitch();
        retireAssist(); closeRoster(); broadcast?.authenticationLost();
        if (connectionId) clearSessionAnnotations(connectionId);
        return;
      }
      if (rosterList) rosterList.replaceChildren(el('p', 'live-share-empty', '正在重新连接…'));
      if (!suspended) reconnectTimer = window.setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(10000, reconnectDelay * 1.5);
    });
    ws.addEventListener('error', () => { /* close drives reconnection and visible state. */ });
  }
  async function chooseStudent(studentUid: number, selectedTabId?: string, skipWait = false) {
    if (broadcast?.active) { broadcast.showMessage('请先结束分享，再协助学员。'); return; }
    if (!ready) {
      if (skipWait) { deferredStart = { studentUid, tabId: selectedTabId }; setStatus('等待恢复连接后自动切换学员…', true); }
      return;
    }
    if (pendingStart || ending) return;
    if (!skipWait && viewing && waitForEdits(() => { void chooseStudent(studentUid, selectedTabId, true); }, '正在同步最后的修改，完成后自动切换学员…')) {
      closeRoster(); return;
    }
    pendingStart = studentUid;
    renderStudents();
    try {
      await loadAdapters();
      if (disposed || pendingStart !== studentUid) return;
      if (!send({ type: 'start', studentUid, ...(selectedTabId ? { tabId: selectedTabId } : {}) })) throw new Error('offline');
    } catch {
      pendingStart = 0;
      rosterList?.replaceChildren(el('p', 'live-share-empty', '连接准备失败，请稍后重试。'));
    }
  }
  function renderStudents() {
    if (!rosterList) return;
    rosterList.replaceChildren();
    const q = search?.value.trim().toLowerCase() || '';
    const matches = students.filter((s) => `${s.name} ${s.uid}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'zh'));
    if (!matches.length) { rosterList.append(el('p', 'live-share-empty', q ? '没有找到这位学员' : '暂时没有可连接的学员')); return; }
    for (const student of matches) {
      const row = button('', 'live-share-student', () => chooseStudent(student.uid));
      row.disabled = !student.online || !!pendingStart;
      const avatar = el('span', 'live-share-student__avatar', (student.name || '学').slice(0, 1));
      const copy = el('span', 'live-share-student__copy');
      copy.append(el('strong', '', student.name || `学员 ${student.uid}`));
      const current = student.tabs?.find((tab) => tab.visible) || student.tabs?.[0];
      copy.append(el('span', '', student.online ? current?.title || '正在学习' : '离线 · 上线后可连接'));
      const status = el('span', `live-share-student__state${student.online ? ' is-online' : ''}`,
        pendingStart === student.uid ? '连接中…' : student.online ? '连接 →' : '离线');
      row.append(avatar, copy, status); rosterList.append(row);
    }
  }
  function closeRoster() {
    roster?.remove(); roster = null; rosterList = null; search = null;
    clearInterval(rosterTimer);
  }
  function openRoster() {
    if (broadcast?.active) { broadcast.showMessage('请先结束分享，再协助学员。'); return; }
    if (!config.canTeach || roster || ending) return;
    document.querySelector<HTMLButtonElement>('[data-assistant-close]')?.click();
    roster = el('div', 'live-share-picker'); roster.dataset.liveSharePrivate = '';
    const dialog = el('section', 'live-share-picker__card'); dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true'); dialog.setAttribute('aria-labelledby', 'live-share-picker-title');
    const heading = el('header', 'live-share-picker__header');
    const titles = el('div', ''); titles.append(el('span', 'live-share-picker__eyebrow', '一起解决，一个小问题'));
    const title = el('h2', '', '连接一位学员'); title.id = 'live-share-picker-title'; titles.append(title);
    const close = button('×', 'live-share-picker__close', closeRoster); close.setAttribute('aria-label', '关闭学员选择');
    heading.append(titles, close); dialog.append(heading);
    dialog.append(el('p', 'live-share-picker__intro', '看见学员的当前页面，也能直接点击、编辑代码。'));
    search = document.createElement('input'); search.type = 'search'; search.className = 'live-share-picker__search';
    search.placeholder = '搜索姓名或 UID'; search.setAttribute('aria-label', '搜索学员'); search.autocomplete = 'off';
    search.addEventListener('input', renderStudents); dialog.append(search);
    rosterList = el('div', 'live-share-picker__list'); rosterList.setAttribute('aria-live', 'polite');
    dialog.append(rosterList); roster.append(dialog); document.body.append(roster);
    roster.addEventListener('click', (event) => { if (event.target === roster) closeRoster(); });
    roster.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); closeRoster(); }
      if (event.key === 'Tab') {
        const focusables = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input')];
        const first = focusables[0]; const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    rosterList.append(el('p', 'live-share-empty', '正在寻找在线学员…'));
    connect();
    if (ready) send({ type: 'list' });
    rosterTimer = window.setInterval(() => { if (ready && roster) send({ type: 'list' }); }, 10000);
    search.focus();
  }
  on(document, 'click', (event: MouseEvent) => {
    if ((event.target as Element)?.closest?.('[data-live-share-open]')) { event.preventDefault(); openRoster(); }
  });
  on(window, 'resize', sizeStage);
  on(window, 'keydown', (event: KeyboardEvent) => {
    if (!viewport || event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey || editableTarget(event.target)) return;
    event.preventDefault(); panReady = true; viewport.classList.add('is-pan-ready');
  }, { capture: true });
  on(window, 'keyup', (event: KeyboardEvent) => { if (event.code === 'Space') endViewPan(); }, { capture: true });
  on(window, 'blur', endViewPan);
  on(document, 'visibilitychange', () => { if (ready) send({ type: 'pulse', visible: !document.hidden }); });
  function schedulePageRetry() {
    clearTimeout(pageRetryTimer);
    const update = pendingPageUpdate;
    if (!update || disposed || suspended || authenticationRevoked) return;
    pageRetryTimer = window.setTimeout(() => {
      if (pendingPageUpdate === update) transmitCurrentPage();
    }, Math.min(8000, 1000 * 2 ** Math.min(Math.max(0, pageRetryAttempt - 1), 3)));
  }
  function transmitCurrentPage() {
    if (!pendingPageUpdate || !ready || disposed || suspended || authenticationRevoked) return;
    clearTimeout(pageRetryTimer);
    if (send(pendingPageUpdate)) { pageRetryAttempt++; schedulePageRetry(); }
  }
  function sendCurrentPage() {
    clearTimeout(pageRetryTimer); pageRetryAttempt = 0;
    pendingPageUpdate = { type: 'page', requestId: randomId(), pageId, domainId: config.domainId,
      ...(contentReady && config.pageGrant ? { pageGrant: config.pageGrant, url: currentPageUrl } : { url: '' }),
      title: contentReady ? currentPageTitle : '', visible: !document.hidden };
    if (!ready) { connect(); return; }
    transmitCurrentPage();
  }
  function pageLoading() {
    if (!platformShell || !contentReady) return;
    contentReady = false; pageId = randomId(); config.pageGrant = undefined;
    clearSource(); broadcast?.pageLoading(); installLocalDrawing();
    updateControls();
    sendCurrentPage();
  }
  function pageChanged(event: CustomEvent) {
    if (!platformShell || disposed || event.detail?.window !== contentWindow()) return;
    const page = contentWindow();
    const doc = page?.document;
    if (!doc) return;
    const next = event.detail.context?.liveShare as LiveShareConfig | undefined;
    const sameDocument = sourceDocument === doc;
    const allowed = next?.enabled && next.uid === uid && next.canTeach === config.canTeach;
    const factories = (page as any).__onebyoneLiveShareSources;
    const nextReady = !!(allowed && next.pageGrant && factories?.loadAdapters && factories?.loadBroadcastAdapters);
    // DOM ready, iframe load and the final module boot all announce the same
    // document. Title/hash/PJAX history changes must not rotate its editor epoch.
    // A history URL alone also cannot repurpose this document's exact-path grant.
    if (sameDocument && contentReady && nextReady && next.pageGrant === config.pageGrant) {
      currentPageTitle = String(event.detail.title || '').slice(0, 160);
      return;
    }
    const wasReady = contentReady;
    const previousGrant = config.pageGrant;
    if (!sameDocument) {
      pageLoading(); sourceDocument = doc; pageId = randomId();
    } else if (contentReady && (!nextReady || next.pageGrant !== config.pageGrant)) pageLoading();
    if (allowed) {
      Object.assign(config, next);
      if (!sameDocument || previousGrant !== next.pageGrant) {
        const url = new URL(event.detail.url, location.href);
        currentPageUrl = url.pathname + url.search;
      }
      currentPageTitle = String(event.detail.title || '').slice(0, 160);
    }
    contentReady = nextReady;
    if (!sameDocument || wasReady !== contentReady || previousGrant !== config.pageGrant) {
      sendCurrentPage(); installLocalDrawing();
      broadcast?.pageReady();
      updateControls();
    }
  }
  on(window, 'onebyone:page-loading', pageLoading);
  on(window, 'onebyone:page-change', pageChanged);
  on(window, 'pagehide', () => {
    // Keep the server's short reconnect grace across a student's navigation.
    preservePending();
    suspended = true; clearTimeout(reconnectTimer); ready = false; connected(false); socket?.close();
    updateLocalDrawing();
  });
  on(window, 'pageshow', (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    suspended = false; pageId = randomId(); clearSource();
    if (!config.canTeach || viewing || roster || resume || broadcast?.wantsConnection()) connect();
  });
  const cleanup = () => {
    preservePending();
    disposed = true; generation++; clearTimeout(reconnectTimer); clearTimeout(endTimer); clearTimeout(switchTimer); clearTimeout(pageRetryTimer); clearInterval(pulseTimer); clearInterval(rosterTimer);
    tabChannel?.close(); socket?.close(); clearSource(); closeRoster(); closeView(); disposers.forEach((dispose) => dispose()); installed = undefined;
    localDrawingGeneration++; localDrawing?.dispose(); localDrawing = null; localDrawingRoot?.remove(); localDrawingRoot = null;
    broadcast?.dispose(); broadcast = null;
    controls?.dispose();
  };
  installed = cleanup;
  on(window, 'onebyone:session-ended', cleanup);
  // Duplicating/opening a tab copies sessionStorage. Claim a fresh identity if
  // another live document already owns it; navigation's departing document is suspended.
  try {
    tabChannel = new BroadcastChannel(`onebyone.live-share.tabs:${uid}`);
    tabChannel.onmessage = ({ data }) => {
      if (disposed || suspended || data?.tabId !== tabId || data.pageId === pageId) return;
      if (data.type === 'claim' && (identityReady || pageId < data.pageId)) {
        tabChannel?.postMessage({ type: 'occupied', tabId, pageId, target: data.pageId });
      } else if (data.type === 'occupied' && data.target === pageId && !identityReady) {
        tabId = randomId();
        try { sessionStorage?.setItem(tabKey, tabId); } catch { /* Keep the identity in memory. */ }
      }
    };
    tabChannel.postMessage({ type: 'claim', tabId, pageId });
  } catch { /* A single-tab browser can work without BroadcastChannel. */ }
  const identityTimer = window.setTimeout(() => { identityReady = true; if (shouldConnect) connect(); }, tabChannel ? 80 : 0);
  disposers.push(() => clearTimeout(identityTimer));
  broadcast = installBroadcastController(config, { send, connect, reconnect: () => {
    ready = false; connected(false);
    if (socket) socket.close(); else connect();
  }, pageId: () => pageId, sourceReady: () => contentReady, ready: () => ready,
    sharing: () => !!viewing || !!source || !!pendingStart || !!switching || ending,
    onActiveChange: () => { updateLocalDrawing(); updateControls(); } },
  { loadAdapters: options.loadBroadcastAdapters,
    loadSourceAdapters: platformShell ? () => {
      const factories = (contentWindow() as any)?.__onebyoneLiveShareSources;
      return factories?.loadBroadcastAdapters ? factories.loadBroadcastAdapters() : Promise.reject(new Error('Page is loading'));
    } : undefined });
  if (!config.canTeach || resume || broadcast.wantsConnection()) connect();
  if (config.canTeach) showBackups();
  // A small independent chunk enables the local teacher pen without loading
  // rrweb, collaboration editors or opening a room on every teacher page.
  installLocalDrawing();
  return cleanup;
}
