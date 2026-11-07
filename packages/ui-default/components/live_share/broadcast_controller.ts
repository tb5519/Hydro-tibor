import type { LiveShareConfig } from './controller';

interface Student { uid: number; name: string; online: boolean; tabs?: { title: string; visible: boolean }[] }
interface Room { sessionId: string; pageId: string; teacherName: string; teacherUid: number; studentUids?: number[]; viewers?: Student[] }
type Adapters = typeof import('./broadcast_adapters');
type Adapter = { receive(kind: string, data: any): void; snapshot?(): void; setConnected(value: boolean): void; dispose(): void };
export interface BroadcastBridge {
  send(message: any): boolean;
  connect(): void;
  reconnect(): void;
  pageId(): string;
  ready(): boolean;
  sharing(): boolean;
  onActiveChange(): void;
}

/** Uses the existing authenticated presence connection. No second socket or account switch. */
export function installBroadcastController(config: LiveShareConfig, bridge: BroadcastBridge, options: {
  loadAdapters?: () => Promise<Adapters>;
} = {}) {
  const resumeKey = `onebyone.broadcast.resume:${config.uid}`;
  const el = (tag: string, cls = '', text = '') => {
    const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
  };
  const button = (text: string, cls: string, action: () => void) => {
    const node = el('button', cls, text) as HTMLButtonElement; node.type = 'button'; node.addEventListener('click', action); return node;
  };
  let disposed = false;
  let connected = false;
  let room: Room | null = null;
  let source = false;
  let adapter: Adapter | null = null;
  let generation = 0;
  let loader: Promise<Adapters> | null = null;
  let wantsSnapshot = false;
  let pending = false;
  let pendingTimer = 0;
  let disconnectTimer = 0;
  let disconnectDeadline = 0;
  let snapshotTimer = 0;
  let recovering = false;
  let rosterTimer = 0;
  let flashTimer = 0;
  let picker: HTMLElement | null = null;
  let list: HTMLElement | null = null;
  let search: HTMLInputElement | null = null;
  let error: HTMLElement | null = null;
  let count: HTMLElement | null = null;
  let start: HTMLButtonElement | null = null;
  let flash: HTMLElement | null = null;
  let bar: HTMLElement | null = null;
  let overlay: HTMLElement | null = null;
  let viewport: HTMLElement | null = null;
  let stage: HTMLElement | null = null;
  let status: HTMLElement | null = null;
  let sourceWidth = 1440; let sourceHeight = 900;
  let original: { x: number; y: number; focus: HTMLElement | null; overflow: string; inert: Map<HTMLElement, boolean> } | null = null;
  let originalObserver: MutationObserver | null = null;
  let students: Student[] = [];
  const selected = new Set<number>();
  const ended = new Set<string>();
  const buffered: any[] = [];
  let bufferedBytes = 0;
  function saveResume(active: boolean) {
    try { if (active) sessionStorage.setItem(resumeKey, '1'); else sessionStorage.removeItem(resumeKey); } catch { /* Optional storage. */ }
  }
  function wantsConnection() {
    try { return !!room || !!picker || pending || (config.canTeach && sessionStorage.getItem(resumeKey) === '1'); } catch { return !!room || !!picker || pending; }
  }
  function loadAdapters() {
    loader ||= options.loadAdapters ? options.loadAdapters() : import(/* webpackChunkName: "teacher-broadcast" */ './broadcast_adapters');
    loader.catch(() => { loader = null; }); return loader;
  }
  function showMessage(text: string) {
    if (picker && error) { error.textContent = text; error.hidden = !text; return; }
    flash?.remove(); clearTimeout(flashTimer);
    flash = el('div', 'teacher-broadcast-flash', text); flash.dataset.liveSharePrivate = ''; flash.setAttribute('role', 'status');
    document.body.append(flash); flashTimer = window.setTimeout(() => { flash?.remove(); flash = null; }, 4500);
  }
  function updateState(text?: string) {
    if (status) status.textContent = text || (connected ? `正在观看${room?.teacherName || '老师'}的分享` : '连接中断，正在重新连接…');
    if (bar) {
      const viewers = room?.viewers;
      const total = room?.studentUids?.length ?? viewers?.length ?? 0;
      const online = viewers ? viewers.filter((item) => item.online).length : total;
      bar.querySelector('[data-broadcast-status]')!.textContent = text || (connected ? `正在分享 · ${online}/${total} 位学员在线` : '正在重新连接…');
    }
    overlay?.classList.toggle('is-disconnected', !connected);
  }
  function fit() {
    if (!stage || !viewport) return;
    const scale = Math.min(viewport.clientWidth / sourceWidth, viewport.clientHeight / sourceHeight);
    if (!(scale > 0)) return;
    stage.style.width = `${sourceWidth}px`; stage.style.height = `${sourceHeight}px`;
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${(viewport.clientWidth - sourceWidth * scale) / 2}px`;
    stage.style.top = `${(viewport.clientHeight - sourceHeight * scale) / 2}px`;
  }
  function protectOriginal() {
    if (!original) return;
    for (const node of Array.from(document.body.children)) {
      if (!(node instanceof HTMLElement) || node === overlay
        || node.matches('script,style,link,[data-voice-call-ui],.voice-call-card,.voice-call-floating,.voice-call-toast')) continue;
      if (!original.inert.has(node)) original.inert.set(node, node.inert);
      node.inert = true;
    }
  }
  function createView() {
    if (overlay) return;
    original = { x: scrollX, y: scrollY, focus: document.activeElement as HTMLElement, overflow: document.body.style.overflow, inert: new Map() };
    overlay = el('section', 'teacher-broadcast-overlay'); overlay.dataset.liveSharePrivate = ''; overlay.setAttribute('aria-label', '老师分享的实时画面');
    viewport = el('div', 'teacher-broadcast-viewport'); stage = el('div', 'teacher-broadcast-stage');
    viewport.append(stage); overlay.append(viewport);
    const footer = el('footer', 'teacher-broadcast-hint');
    status = el('span', 'teacher-broadcast-hint__status'); status.setAttribute('role', 'status');
    footer.append(status, el('span', 'teacher-broadcast-hint__pen', '按住鼠标左键拖动，圈出你的问题'));
    overlay.append(footer); document.body.append(overlay);
    document.body.style.overflow = 'hidden'; document.body.classList.add('teacher-broadcast-viewing');
    protectOriginal(); originalObserver = new MutationObserver(protectOriginal); originalObserver.observe(document.body, { childList: true });
    for (const name of ['keydown', 'keyup', 'keypress', 'click', 'dblclick', 'contextmenu', 'submit', 'drop']) {
      overlay.addEventListener(name, (event) => { event.preventDefault(); event.stopPropagation(); });
    }
    viewport.addEventListener('wheel', (event) => { event.preventDefault(); event.stopPropagation(); }, { passive: false });
    fit();
  }
  function createSourceBar() {
    if (bar) return;
    bar = el('aside', 'teacher-broadcast-bar'); bar.dataset.liveSharePrivate = ''; bar.dataset.liveShareUi = '';
    const copy = el('span', 'teacher-broadcast-bar__status'); copy.dataset.broadcastStatus = ''; copy.setAttribute('role', 'status');
    const dot = el('i', 'live-share-dot');
    const stop = button('结束分享', 'teacher-broadcast-bar__stop', stopSharing); stop.dataset.broadcastStop = '';
    bar.append(dot, copy, stop); document.body.append(bar);
  }
  function clearRoom() {
    generation++; adapter?.dispose(); adapter = null; room = null;
    buffered.length = 0; bufferedBytes = 0; wantsSnapshot = false;
    clearTimeout(disconnectTimer); disconnectTimer = 0; disconnectDeadline = 0;
    clearTimeout(snapshotTimer); snapshotTimer = 0; recovering = false;
    bar?.remove(); bar = null; originalObserver?.disconnect(); originalObserver = null;
    overlay?.remove(); overlay = null; viewport = null; stage = null; status = null;
    document.body.classList.remove('teacher-broadcast-viewing');
    if (original) {
      const saved = original; original = null; document.body.style.overflow = saved.overflow;
      for (const [node, inert] of saved.inert) if (node.isConnected) node.inert = inert;
      window.scrollTo(saved.x, saved.y); if (saved.focus?.isConnected) saved.focus.focus({ preventScroll: true });
    }
    bridge.onActiveChange();
  }
  function stopSharing() {
    if (!room || !source) return;
    ended.add(room.sessionId); bridge.send({ type: 'broadcast:stop', sessionId: room.sessionId });
    saveResume(false); clearRoom(); closePicker();
  }
  function queueSnapshot() {
    wantsSnapshot = true;
    if (!connected || !adapter || snapshotTimer || !room) return;
    snapshotTimer = window.setTimeout(() => {
      snapshotTimer = 0;
      if (!connected || !adapter || !room || !wantsSnapshot) return;
      wantsSnapshot = false;
      if (source) adapter.snapshot?.();
      else bridge.send({ type: 'broadcast:sync', sessionId: room.sessionId, pageId: room.pageId });
    }, 80);
  }
  function recover(text: string) {
    if (!room || disposed || recovering) return;
    recovering = true; setConnected(false); updateState(text);
    // A failed mirror stops accepting packets. Rebuild all display adapters after
    // a fresh authenticated room announcement, rather than keep a frozen player.
    generation++; adapter?.dispose(); adapter = null; buffered.length = 0; bufferedBytes = 0;
    bridge.reconnect();
  }
  function adapterStatus(text: string) {
    if (text.includes('同步中断')) recover('画面正在重新同步…');
    else updateState(text);
  }
  async function begin(next: Room, teacher: boolean) {
    if (!next.sessionId || !next.pageId || teacher !== config.canTeach) return;
    if (teacher && (next.pageId !== bridge.pageId() || !config.pageGrant)) return;
    if (ended.has(next.sessionId)) { if (teacher) bridge.send({ type: 'broadcast:stop', sessionId: next.sessionId }); return; }
    pending = false; clearTimeout(pendingTimer);
    if (room?.sessionId === next.sessionId && room.pageId === next.pageId && source === teacher && adapter) {
      const restoring = !connected;
      Object.assign(room, next);
      if (restoring) { setConnected(true); if (!teacher) queueSnapshot(); }
      updateState();
      return;
    }
    clearRoom(); source = teacher; room = next; connected = true; bridge.onActiveChange();
    if (teacher) { saveResume(true); createSourceBar(); closePicker(); document.querySelector<HTMLButtonElement>('[data-assistant-close]')?.click(); }
    else createView();
    updateState(teacher ? undefined : '正在同步老师画面…');
    const version = generation;
    const onStatus = (text: string) => { if (generation === version && room === next) adapterStatus(text); };
    const send = (kind: string, data: any) => {
      if (disposed || !connected || room !== next) return false;
      return bridge.send({ type: 'broadcast:relay', sessionId: next.sessionId, pageId: next.pageId, kind, data });
    };
    try {
      const adapters = await loadAdapters();
      if (disposed || generation !== version || room !== next) return;
      adapter = teacher ? adapters.attachBroadcastSource({ pageId: next.pageId, send, onStatus })
        : adapters.attachBroadcastViewer({ pageId: next.pageId, container: stage!, sendDrawing: (packet) => send('drawing', packet),
          onStatus, onViewport: (size) => {
            if (generation !== version || room !== next) return;
            sourceWidth = Math.max(320, Math.min(7680, size.width || 1440)); sourceHeight = Math.max(240, Math.min(4320, size.height || 900));
            fit(); updateState();
          } });
      if (generation !== version || room !== next) { adapter.dispose(); adapter = null; return; }
      // IDE transport starts disconnected even though the mirror/editor adapters
      // start live. Activate the bundle once; repeated room announcements skip it.
      adapter.setConnected(connected);
      const waiting = buffered.splice(0); bufferedBytes = 0; waiting.forEach(receiveRelay);
      if (!teacher || wantsSnapshot) queueSnapshot();
    } catch {
      if (generation !== version || room !== next) return;
      if (teacher) stopSharing(); else clearRoom();
      showMessage('分享组件未加载成功，请刷新后重试。');
    }
  }
  function receiveRelay(message: any) {
    if (!room || room.sessionId !== message.sessionId || room.pageId !== message.pageId) return;
    if (!adapter) {
      const bytes = JSON.stringify(message).length;
      if (buffered.length < 160 && bufferedBytes + bytes <= 8 * 1024 * 1024) { buffered.push(message); bufferedBytes += bytes; }
      else { buffered.length = 0; bufferedBytes = 0; wantsSnapshot = true; }
      return;
    }
    adapter.receive(message.kind, message.data);
  }
  function setConnected(value: boolean) {
    const changed = connected !== value;
    connected = value; if (changed) adapter?.setConnected(value); updateState(); renderStudents();
    if (value) { clearTimeout(disconnectTimer); disconnectTimer = 0; disconnectDeadline = 0; recovering = false; }
    else if (room && !disconnectDeadline) {
      disconnectDeadline = Date.now() + 125000;
      disconnectTimer = window.setTimeout(() => {
        if (room && disconnectDeadline && Date.now() >= disconnectDeadline) {
          saveResume(false); clearRoom(); showMessage('分享连接已断开，已恢复你的页面。');
        }
      }, 125000);
    }
    if (!value) { pending = false; clearTimeout(pendingTimer); }
  }
  function authenticationLost() {
    pending = false; clearTimeout(pendingTimer); ended.clear(); saveResume(false); clearRoom(); closePicker();
    connected = false; showMessage('登录已失效，分享已结束，请重新登录。');
  }
  function renderStudents() {
    if (!list) return;
    list.replaceChildren();
    const q = search?.value.trim().toLowerCase() || '';
    const matches = students.filter((student) => `${student.name} ${student.uid}`.toLowerCase().includes(q))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'zh'));
    for (const student of matches) {
      const row = el('label', `teacher-broadcast-student${!student.online ? ' is-offline' : ''}`);
      const check = document.createElement('input'); check.type = 'checkbox'; check.value = String(student.uid);
      check.checked = selected.has(student.uid); check.disabled = !student.online || pending || !connected;
      check.setAttribute('aria-label', `分享给${student.name}`);
      check.addEventListener('change', () => {
        if (check.checked && selected.size >= 30) { check.checked = false; showMessage('一次最多选择 30 位学员。'); return; }
        if (check.checked) selected.add(student.uid); else selected.delete(student.uid); updateCount();
      });
      const avatar = el('span', 'live-share-student__avatar', student.name.slice(0, 1));
      const copy = el('span', 'live-share-student__copy'); copy.append(el('strong', '', student.name));
      copy.append(el('span', '', student.online ? student.tabs?.find((tab) => tab.visible)?.title || '在线，可以加入分享' : '离线 · 上线后可选择'));
      row.append(check, avatar, copy, el('span', `teacher-broadcast-student__state${student.online ? ' is-online' : ''}`, student.online ? '在线' : '离线'));
      list.append(row);
    }
    if (!matches.length) list.append(el('p', 'live-share-empty', connected ? (q ? '没有找到这位学员' : '暂时没有可分享的学员') : '正在连接…'));
    updateCount();
  }
  function updateCount() {
    const online = [...selected].filter((uid) => students.some((student) => student.uid === uid && student.online));
    if (count) count.textContent = `已选 ${online.length} 位`;
    if (start) { start.disabled = !connected || pending || !online.length || bridge.sharing(); start.textContent = pending ? '正在开始…' : '开始分享'; }
  }
  async function startSharing() {
    if (!connected || pending || bridge.sharing()) return;
    const studentUids = [...selected].filter((uid) => students.some((student) => student.uid === uid && student.online));
    if (!studentUids.length || studentUids.length > 30) return;
    pending = true; if (error) error.hidden = true; renderStudents();
    try {
      await loadAdapters(); if (disposed || !picker || !pending) return;
      if (!bridge.send({ type: 'broadcast:start', studentUids })) throw new Error('disconnected');
      pendingTimer = window.setTimeout(() => { if (pending) { pending = false; renderStudents(); showMessage('开始分享超时，请稍后重试。'); } }, 15000);
    } catch { pending = false; renderStudents(); showMessage('连接准备失败，请稍后重试。'); }
  }
  function closePicker() {
    if (pending) return;
    picker?.remove(); picker = null; list = null; search = null; error = null; count = null; start = null;
    clearInterval(rosterTimer);
  }
  function open() {
    if (!config.canTeach || disposed) return;
    if (room) { showMessage('正在分享中，结束后可以重新选择学员。'); return; }
    if (bridge.sharing()) { showMessage('请先结束当前共享，再分享你的画面。'); return; }
    if (picker) { search?.focus(); return; }
    if (!config.pageGrant) { showMessage('当前页面不支持分享，请进入学习页面后再试。'); return; }
    document.querySelector<HTMLButtonElement>('[data-assistant-close]')?.click();
    picker = el('div', 'live-share-picker teacher-broadcast-picker'); picker.dataset.liveSharePrivate = '';
    const dialog = el('section', 'live-share-picker__card'); dialog.setAttribute('role', 'dialog'); dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'teacher-broadcast-title');
    const header = el('header', 'live-share-picker__header'); const titles = el('div');
    const title = el('h2', '', '分享我的画面'); title.id = 'teacher-broadcast-title';
    titles.append(el('span', 'live-share-picker__eyebrow', '你来示范，孩子一起看'), title);
    const close = button('×', 'live-share-picker__close', closePicker); close.setAttribute('aria-label', '关闭分享选择'); header.append(titles, close); dialog.append(header);
    dialog.append(el('p', 'live-share-picker__intro', '选择学员，一起看你的操作。孩子可用画笔圈出疑问。'));
    search = document.createElement('input'); search.type = 'search'; search.className = 'live-share-picker__search'; search.placeholder = '搜索姓名或 UID';
    search.setAttribute('aria-label', '搜索分享学员'); search.autocomplete = 'off'; search.addEventListener('input', renderStudents); dialog.append(search);
    const tools = el('div', 'teacher-broadcast-picker__tools'); count = el('span', '', '已选 0 位');
    tools.append(button('选择在线学员', 'teacher-broadcast-text-button', () => {
      selected.clear(); students.filter((student) => student.online).slice(0, 30).forEach((student) => selected.add(student.uid)); renderStudents();
    }), button('清空', 'teacher-broadcast-text-button', () => { selected.clear(); renderStudents(); }), count); dialog.append(tools);
    list = el('div', 'live-share-picker__list'); dialog.append(list);
    error = el('p', 'teacher-broadcast-picker__error'); error.hidden = true; error.setAttribute('role', 'status'); dialog.append(error);
    const footer = el('footer', 'teacher-broadcast-picker__footer'); footer.append(el('span', '', '只有选中的学员会进入观看'));
    start = button('开始分享', 'teacher-broadcast-primary', () => { void startSharing(); }); footer.append(start); dialog.append(footer);
    picker.append(dialog); document.body.append(picker);
    picker.addEventListener('click', (event) => { if (event.target === picker) closePicker(); });
    picker.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePicker(); }
      if (event.key !== 'Tab') return;
      const nodes = [...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')]; const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    });
    connected = bridge.ready(); renderStudents(); bridge.connect(); if (connected) bridge.send({ type: 'list' });
    rosterTimer = window.setInterval(() => { if (picker && bridge.ready()) bridge.send({ type: 'list' }); }, 10000); search.focus();
  }
  function receive(message: any) {
    if (disposed) return;
    if (message.type === 'ready') {
      // The socket being ready is not proof that the previous room still exists.
      // Only its current started/view announcement can cancel the recovery deadline.
      if (!room) connected = true;
      for (const sessionId of ended) bridge.send({ type: 'broadcast:stop', sessionId });
      if (picker) bridge.send({ type: 'list' }); renderStudents(); return;
    }
    if (message.type === 'students') { students = Array.isArray(message.students) ? message.students : []; renderStudents(); return; }
    if (message.type === 'broadcast:started') void begin(message, true);
    if (message.type === 'broadcast:view') void begin(message, false);
    if (message.type === 'broadcast:relay') receiveRelay(message);
    if (message.type === 'broadcast:resync' && source && room?.sessionId === message.sessionId && room.pageId === message.pageId) {
      queueSnapshot();
    }
    if (message.type === 'broadcast:paused' && room?.sessionId === message.sessionId) { setConnected(false); updateState(message.reason || '老师正在切换页面，稍候自动继续…'); }
    if (message.type === 'broadcast:ended') {
      ended.delete(message.sessionId);
      if (room?.sessionId === message.sessionId) { saveResume(false); clearRoom(); if (message.reason) showMessage(message.reason); }
    }
    if (message.type === 'broadcast:error' || ((message.type === 'error' || message.error) && (pending || picker || room))) {
      pending = false; clearTimeout(pendingTimer); renderStudents();
      const text = message.message || '分享暂时不可用，请稍后重试。';
      if (room) updateState(text); else showMessage(text);
      if (/^(?:FORBIDDEN|ENDED|LOGIN_REVOKED)$/.test(message.code || '')) { saveResume(false); clearRoom(); showMessage(text); }
      else if (/^(?:STALE_PAGE|BACKPRESSURE|RATE_LIMIT)$/.test(message.code || '')) recover('画面正在重新同步…');
      else if (message.code === 'PAUSED' && room) { setConnected(false); updateState(text); }
    }
  }
  const click = (event: MouseEvent) => {
    if ((event.target as Element)?.closest?.('[data-teacher-broadcast-open]')) { event.preventDefault(); open(); }
  };
  document.addEventListener('click', click); window.addEventListener('resize', fit);
  return {
    receive, setConnected, wantsConnection, open, showMessage, authenticationLost,
    get active() { return !!room || pending; },
    dispose() { disposed = true; pending = false; clearTimeout(pendingTimer); clearTimeout(flashTimer); flash?.remove(); closePicker(); clearRoom(); document.removeEventListener('click', click); window.removeEventListener('resize', fit); },
  };
}
