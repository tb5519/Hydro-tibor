export interface LiveShareConfig {
  enabled: boolean; uid: number; canTeach: boolean; socketUrl: string; pageGrant?: string;
}
type Controllers = {
  dispose(): void; setConnected(connected: boolean): void; snapshot?(): void; getPendingDrafts?(): any[];
  receive?(data: any): void; receiveCommand?(data: any): any;
  getEditorRect?(id: string): { x: number; y: number; width: number; height: number } | null;
};
type Adapters = typeof import('./mirror') & typeof import('./editor');
interface Student { uid: number; name: string; online: boolean; tabs?: { tabId: string; title: string; visible: boolean }[] }
interface Session { sessionId: string; pageId: string; studentUid?: number; studentName?: string; teacherName?: string; tabId?: string }
let installed: (() => void) | undefined;

export function installLiveShare(config: LiveShareConfig, options: {
  loadAdapters?: () => Promise<Adapters>; socketFactory?: (url: string) => WebSocket;
} = {}) {
  if (installed || !config?.enabled || !config.uid || window.top !== window) return installed;
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
  const deviceId = identity(localStorage, `onebyone.live-share.device:${uid}`);
  let pageId = randomId();
  const resumeKey = `onebyone.live-share.resume:${uid}`;
  const backupKey = `onebyone.live-share.unsynced:${uid}`;
  const closedSessions = new Set<string>();
  const pendingEdits = new Map<string, number>();
  let ending = false;
  let afterSync: (() => void) | null = null;
  let endTimer = 0;
  let backupNotice: HTMLElement | null = null;
  let backups: any[] = [];
  try { const saved = JSON.parse(sessionStorage?.getItem(backupKey) || '[]'); if (Array.isArray(saved)) backups = saved.slice(-10); } catch { /* Optional recovery. */ }
  let resume: { studentUid: number; tabId?: string } | null = null;
  try { resume = JSON.parse(sessionStorage?.getItem(resumeKey) || 'null'); } catch { /* Bad saved state is ignored. */ }
  if (!Number.isSafeInteger(resume?.studentUid) || resume.studentUid <= 0) resume = null;
  let socket: WebSocket | null = null;
  let ready = false;
  let disposed = false;
  let suspended = false;
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
  let sourceMirror: Controllers | null = null;
  let sourceEditors: Controllers | null = null;
  let viewerMirror: Controllers | null = null;
  let viewerEditors: Controllers | null = null;
  let overlay: HTMLElement | null = null;
  let viewport: HTMLElement | null = null;
  let stage: HTMLElement | null = null;
  let pageStatus: HTMLElement | null = null;
  let statusMessage = '';
  let notice: HTMLElement | null = null;
  let assistantControls: HTMLElement | null = null;
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
      ])
        .then(([mirror, editor]) => ({ ...mirror, ...editor }));
      adaptersPromise.catch(() => { adaptersPromise = undefined; });
    }
    return adaptersPromise;
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
    if (assistantControls) assistantControls.querySelector('[data-share-status]')!.textContent = text || '已连接 · 可直接点击和编辑';
  }
  function connected(value: boolean) {
    sourceMirror?.setConnected(value); sourceEditors?.setConnected(value);
    viewerMirror?.setConnected(value); viewerEditors?.setConnected(value);
    overlay?.classList.toggle('is-disconnected', !value);
    if (!value && viewing) setStatus('连接中断，正在重新连接…', true);
    if (notice && source) notice.querySelector('span')!.textContent = value
      ? `${source.teacherName || '老师'}正在协助` : '共享连接中断，正在重新连接…';
  }
  function clearSource() {
    sourceMirror?.dispose(); sourceEditors?.dispose();
    sourceMirror = null; sourceEditors = null; source = null;
    notice?.remove(); notice = null;
  }
  function clearViewAdapters() {
    viewerMirror?.dispose(); viewerEditors?.dispose(); viewerMirror = null; viewerEditors = null;
    stage?.replaceChildren(); buffered.length = 0; bufferedBytes = 0; pendingEdits.clear();
  }
  function closeView() {
    generation++; clearViewAdapters(); viewing = null;
    overlay?.remove(); overlay = null; viewport = null; stage = null; pageStatus = null;
    assistantControls?.remove(); assistantControls = null;
    document.body.classList.remove('live-share-viewing');
    if (original) {
      const saved = original; original = null;
      document.body.style.overflow = saved.overflow;
      for (const [node, inert] of saved.inert) if (node.isConnected) node.inert = inert;
      window.scrollTo(saved.x, saved.y);
      if (saved.focus?.isConnected) saved.focus.focus({ preventScroll: true });
    }
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
  function sizeStage() {
    if (!stage || !viewport) return;
    const scale = Math.min(viewport.clientWidth / studentWidth, viewport.clientHeight / studentHeight, 1);
    stage.style.width = `${studentWidth}px`; stage.style.height = `${studentHeight}px`;
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${Math.max(0, (viewport.clientWidth - studentWidth * scale) / 2)}px`;
    stage.style.top = `${Math.max(0, (viewport.clientHeight - studentHeight * scale) / 2)}px`;
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
    viewport = el('div', 'live-share-viewport'); stage = el('div', 'live-share-stage');
    for (const name of ['keydown', 'keyup', 'keypress']) overlay.addEventListener(name, (event) => event.stopPropagation());
    viewport.append(stage); overlay.append(viewport);
    pageStatus = el('div', 'live-share-status'); pageStatus.setAttribute('role', 'status');
    overlay.append(pageStatus); document.body.append(overlay);
    const assistant = document.querySelector<HTMLElement>('[data-teacher-assistant]');
    assistantControls = el('section', 'live-share-controls');
    assistantControls.append(el('span', 'live-share-controls__eyebrow', '共享模式'), el('strong', 'live-share-controls__name'));
    const status = el('span', 'live-share-controls__status', '正在连接…'); status.dataset.shareStatus = ''; assistantControls.append(status);
    const actions = el('div', 'live-share-controls__actions');
    actions.append(button('切换学员', 'live-share-button', openRoster), button('断开共享', 'live-share-button live-share-button--end', endSharing));
    assistantControls.append(actions);
    if (assistant) assistant.querySelector('[data-assistant-panel]')?.insertBefore(assistantControls, assistant.querySelector('.teacher-assistant__footer'));
    else {
      const fallback = el('aside', 'live-share-fallback'); fallback.append(assistantControls); overlay.append(fallback);
    }
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
    preservePending(); clearViewAdapters(); viewing = next;
    createOverlay();
    assistantControls?.querySelector('.live-share-controls__name')?.replaceChildren(document.createTextNode(next.studentName || '学员'));
    setStatus('正在同步学员画面…', true);
    saveResume({ studentUid: next.studentUid!, tabId: next.tabId });
    closeRoster();
    document.querySelector<HTMLButtonElement>('[data-assistant-close]')?.click();
    try {
      const adapters = await loadAdapters();
      if (disposed || currentGeneration !== generation || viewing !== next || !stage) return;
      const mirrorRoot = el('div', 'live-share-mirror');
      const editorRoot = el('div', 'live-share-editors');
      stage.append(mirrorRoot, editorRoot);
      viewerMirror = adapters.attachViewerMirror({ pageId: next.pageId, container: mirrorRoot,
        sendCommand: (data) => relay(next, 'command', data),
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
      viewerEditors = adapters.attachViewerEditors({ pageId: next.pageId, container: editorRoot,
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
      const waiting = buffered.splice(0); bufferedBytes = 0;
      waiting.forEach(receiveRelay);
      viewerMirror.setConnected(ready); viewerEditors.setConnected(ready);
    } catch {
      if (viewing === next) setStatus('共享组件加载失败，请断开后重试。', true);
    }
  }
  async function startSource(next: Session) {
    if (next.pageId !== pageId || !config.pageGrant) return;
    if (source?.sessionId === next.sessionId && source.pageId === next.pageId && sourceMirror && sourceEditors) {
      connected(true); return;
    }
    clearSource(); source = next;
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
      const adapters = await loadAdapters();
      if (disposed || source !== next) return;
      sourceEditors = adapters.attachSourceEditors({ pageId,
        send: (data) => relay(next, 'editor', data),
        onStatus: (status: any) => { if (status.error) sourceStatus(status.error); },
      });
      sourceMirror = adapters.attachSourceMirror({ pageId,
        send: (data) => relay(next, 'mirror', data),
        sendAck: (data) => relay(next, 'ack', data),
        onStatus: sourceStatus,
      });
      sourceEditors.setConnected(ready); sourceMirror.setConnected(ready);
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
      if (message.kind === 'mirror') viewerMirror?.receive?.(message.data);
      if (message.kind === 'editor') viewerEditors?.receive?.(message.data);
      if (message.kind === 'ack' && message.data?.ok === false) {
        const reason = message.data.message || message.data.reason || '这项操作请由学员完成';
        if (reason.includes('已暂停')) connected(false);
        setStatus(reason, reason.includes('已暂停'));
      }
    } else {
      if (message.kind === 'command') sourceMirror?.receiveCommand?.(message.data);
      if (message.kind === 'editor') sourceEditors?.receive?.(message.data);
    }
  }
  function onMessage(message: any) {
    if (!message || typeof message !== 'object') return;
    if (message.type === 'ready') {
      ready = true; reconnectDelay = 750;
      for (const sessionId of closedSessions) send({ type: 'stop', sessionId });
      if (roster) send({ type: 'list' });
      if (config.canTeach && deferredStart) {
        const target = deferredStart; deferredStart = null;
        chooseStudent(target.studentUid, target.tabId, true);
      } else if (config.canTeach && resume && !viewing) chooseStudent(resume.studentUid, resume.tabId);
      return;
    }
    if (message.type === 'students') { students = Array.isArray(message.students) ? message.students : []; renderStudents(); }
    if (message.type === 'started') { pendingStart = 0; startView(message); }
    if (message.type === 'share-start') startSource(message);
    if (message.type === 'relay') receiveRelay(message);
    if (message.type === 'paused' && (message.sessionId === viewing?.sessionId || message.sessionId === source?.sessionId)) {
      connected(false); setStatus(message.reason || '学员正在切换页面，稍候自动恢复…', true);
    }
    if (message.type === 'ended') {
      closedSessions.delete(message.sessionId);
      if (message.sessionId === viewing?.sessionId || message.sessionId === source?.sessionId) {
        clearTimeout(endTimer); ending = false; afterSync = null;
        preservePending(); saveResume(null); closeView(); clearSource(); showBackups();
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
    if (disposed || suspended || socket && socket.readyState < WebSocket.CLOSING) return;
    const url = new URL(config.socketUrl, window.location.href);
    if (url.origin !== window.location.origin) return;
    url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = options.socketFactory ? options.socketFactory(url.href) : new WebSocket(url.href);
    socket = ws;
    ws.addEventListener('open', () => {
      if (socket !== ws || disposed) return;
      lastPong = Date.now();
      send({ type: 'hello', tabId, pageId, pageGrant: config.pageGrant, deviceId,
        url: window.location.pathname + window.location.search, title: document.title.slice(0, 160), visible: !document.hidden });
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
    ws.addEventListener('close', () => {
      if (socket !== ws || disposed) return;
      ready = false; socket = null; pendingStart = 0; clearInterval(pulseTimer); connected(false);
      if (rosterList) rosterList.replaceChildren(el('p', 'live-share-empty', '正在重新连接…'));
      if (!suspended) reconnectTimer = window.setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(10000, reconnectDelay * 1.5);
    });
    ws.addEventListener('error', () => { /* close drives reconnection and visible state. */ });
  }
  async function chooseStudent(studentUid: number, selectedTabId?: string, skipWait = false) {
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
  on(document, 'visibilitychange', () => { if (ready) send({ type: 'pulse', visible: !document.hidden }); });
  on(window, 'pagehide', () => {
    // Keep the server's short reconnect grace across a student's navigation.
    preservePending();
    suspended = true; clearTimeout(reconnectTimer); ready = false; connected(false); socket?.close();
  });
  on(window, 'pageshow', (event: PageTransitionEvent) => {
    if (!event.persisted) return;
    suspended = false; pageId = randomId(); clearSource();
    if (!config.canTeach || viewing || roster || resume) connect();
  });
  const cleanup = () => {
    preservePending();
    disposed = true; generation++; clearTimeout(reconnectTimer); clearTimeout(endTimer); clearInterval(pulseTimer); clearInterval(rosterTimer);
    tabChannel?.close(); socket?.close(); clearSource(); closeRoster(); closeView(); disposers.forEach((dispose) => dispose()); installed = undefined;
  };
  installed = cleanup;
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
  if (!config.canTeach || resume) connect();
  if (config.canTeach) showBackups();
  return cleanup;
}
