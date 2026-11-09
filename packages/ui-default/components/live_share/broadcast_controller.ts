import type { LiveShareConfig } from './controller';
import type { BroadcastFocus } from './broadcast_focus';
import { clearSessionAnnotations } from './annotation_cache';
import { createBroadcastPresence } from './broadcast_presence';

interface Student { uid: number; name: string; online: boolean; tabs?: { title: string; visible: boolean }[] }
interface Room { sessionId: string; connectionId?: string; pageId: string; teacherName: string; teacherUid: number; studentUids?: number[]; viewers?: Student[] }
type Adapters = typeof import('./broadcast_adapters');
type Adapter = { receive(kind: string, data: any, role?: 'teacher' | 'student'): void; snapshot?(): void; setConnected(value: boolean): void; dispose(): void };
export interface BroadcastBridge {
  send(message: any): boolean;
  connect(): void;
  reconnect(): void;
  pageId(): string;
  sourceReady?(): boolean;
  ready(): boolean;
  sharing(): boolean;
  onActiveChange(): void;
}

/** Uses the existing authenticated presence connection. No second socket or account switch. */
export function installBroadcastController(config: LiveShareConfig, bridge: BroadcastBridge, options: {
  loadAdapters?: () => Promise<Adapters>;
  loadSourceAdapters?: () => Promise<Adapters>;
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
  let adapterLoading = false;
  let frameReady = false;
  let retainedView: { adapter: Adapter; stage: HTMLElement } | null = null;
  let frameTimer = 0;
  let frameProgress = 0;
  let frameStarted = 0;
  let frameRetries = 0;
  let loadFailures = 0;
  const capacityFailures: number[] = [];
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
  let teacherStatus = '';
  let overlay: HTMLElement | null = null;
  let viewport: HTMLElement | null = null;
  let stage: HTMLElement | null = null;
  let loading: HTMLElement | null = null;
  let status: HTMLElement | null = null;
  let viewToggle: HTMLButtonElement | null = null;
  let viewMode: 'readable' | 'fit' = 'readable';
  let focus: BroadcastFocus | null = null;
  let viewLeft = 0; let viewTop = 0; let viewScale = 1;
  let drawing = false; let manualUntil = 0; let followTimer = 0;
  let sourceWidth = 1440; let sourceHeight = 900;
  let original: { x: number; y: number; focus: HTMLElement | null; overflow: string; inert: Map<HTMLElement, boolean> } | null = null;
  let originalObserver: MutationObserver | null = null;
  let students: Student[] = [];
  const selected = new Set<number>();
  const ended = new Set<string>();
  const buffered: any[] = [];
  let bufferedBytes = 0;
  const presence = config.canTeach ? createBroadcastPresence(config.uid, () => {
    if (!disposed && config.pageGrant && !bridge.sharing()) bridge.connect();
  }) : null;
  function saveResume(active: boolean) {
    try { if (active) sessionStorage.setItem(resumeKey, '1'); else sessionStorage.removeItem(resumeKey); } catch { /* Optional storage. */ }
  }
  function wantsConnection() {
    try { return !!room || !!picker || pending || !!presence?.active() || (config.canTeach && sessionStorage.getItem(resumeKey) === '1'); } catch { return !!room || !!picker || pending || !!presence?.active(); }
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
    if (status) status.textContent = text || (connected
      ? (frameReady ? `正在观看${room?.teacherName || '老师'}的分享` : '正在同步老师画面…') : '连接中断，正在重新连接…');
    if (loading) loading.hidden = frameReady || !!retainedView || stage?.dataset.ready === 'true';
    if (source && room) {
      const viewers = room.viewers;
      const total = room.studentUids?.length ?? viewers?.length ?? 0;
      const online = viewers ? viewers.filter((item) => item.online).length : total;
      teacherStatus = text || (connected ? `正在分享 · ${online}/${total} 位学员在线` : '正在重新连接…');
      bridge.onActiveChange();
    }
    overlay?.classList.toggle('is-disconnected', !connected);
  }
  function fit(follow = true) {
    if (!stage || !viewport) return;
    const width = viewport.clientWidth; const height = viewport.clientHeight;
    const fullScale = Math.min(width / sourceWidth, height / sourceHeight);
    // Preserve source layout and all annotation coordinates. Large teacher displays
    // get a readable viewing window instead of shrinking 14px code to 5px text.
    const scale = viewMode === 'fit' ? fullScale : Math.min(1.25, Math.max(fullScale, .85));
    if (!(scale > 0)) return;
    const visibleWidth = width / scale; const visibleHeight = height / scale;
    if (follow && !drawing && Date.now() >= manualUntil && focus) {
      const adjust = (position: number, size: number, start: number, length: number) => {
        const margin = Math.min(90, size * .12);
        const end = start + Math.min(length, size - margin * 2);
        if (start < position + margin) return start - margin;
        if (end > position + size - margin) return end - size + margin;
        return position;
      };
      viewLeft = adjust(viewLeft, visibleWidth, focus.x, focus.width);
      viewTop = adjust(viewTop, visibleHeight, focus.y, focus.height);
    }
    viewLeft = Math.max(0, Math.min(Math.max(0, sourceWidth - visibleWidth), viewLeft));
    viewTop = Math.max(0, Math.min(Math.max(0, sourceHeight - visibleHeight), viewTop));
    viewScale = scale;
    stage.style.width = `${sourceWidth}px`; stage.style.height = `${sourceHeight}px`;
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${sourceWidth * scale <= width ? (width - sourceWidth * scale) / 2 : -viewLeft * scale}px`;
    stage.style.top = `${sourceHeight * scale <= height ? (height - sourceHeight * scale) / 2 : -viewTop * scale}px`;
    if (viewToggle) {
      viewToggle.hidden = fullScale >= .85 && viewMode === 'readable';
      viewToggle.textContent = viewMode === 'readable' ? '完整画面' : '清晰跟随';
      viewToggle.title = viewMode === 'readable' ? '查看老师的完整画面' : '放大并跟随老师正在讲解的位置';
      viewToggle.setAttribute('aria-label', viewToggle.title);
    }
  }
  function followLater() {
    clearTimeout(followTimer);
    followTimer = window.setTimeout(() => { followTimer = 0; fit(); }, Math.max(0, manualUntil - Date.now()) + 30);
  }
  function endDrawing() {
    if (!drawing) return;
    drawing = false; manualUntil = Date.now() + 2200; followLater();
  }
  function protectOriginal() {
    if (!original) return;
    for (const node of Array.from(document.body.children)) {
      if (!(node instanceof HTMLElement) || node === overlay
        || node.matches('script,style,link,[data-class-chat],[data-voice-call-ui],.voice-call-card,.voice-call-floating,.voice-call-toast')) continue;
      if (!original.inert.has(node)) original.inert.set(node, node.inert);
      node.inert = true;
    }
  }
  function viewWheel(event: Pick<WheelEvent, 'deltaX' | 'deltaY' | 'deltaMode' | 'shiftKey'>) {
    if (!viewport || viewMode !== 'readable' || drawing) return;
    const unit = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? viewport.clientHeight : 1;
    viewLeft += (event.deltaX || (event.shiftKey ? event.deltaY : 0)) * unit / viewScale;
    viewTop += (event.shiftKey ? 0 : event.deltaY) * unit / viewScale;
    manualUntil = Date.now() + 6000; fit(false); followLater();
  }
  function createView() {
    if (overlay) return;
    original = { x: scrollX, y: scrollY, focus: document.activeElement as HTMLElement, overflow: document.body.style.overflow, inert: new Map() };
    overlay = el('section', 'teacher-broadcast-overlay'); overlay.dataset.liveSharePrivate = ''; overlay.setAttribute('aria-label', '老师分享的实时画面');
    viewport = el('div', 'teacher-broadcast-viewport');
    loading = el('div', 'teacher-broadcast-loading');
    loading.append(el('span', 'teacher-broadcast-loading__dot'), el('strong', '', '正在同步老师画面'), el('span', '', '连接会自动恢复，请稍候'));
    viewport.append(loading); overlay.append(viewport);
    const footer = el('footer', 'teacher-broadcast-hint');
    status = el('span', 'teacher-broadcast-hint__status'); status.setAttribute('role', 'status');
    viewToggle = button('完整画面', 'teacher-broadcast-hint__view', () => {
      viewMode = viewMode === 'readable' ? 'fit' : 'readable'; manualUntil = 0; fit();
    });
    viewToggle.dataset.broadcastViewControl = '';
    footer.append(status, el('span', 'teacher-broadcast-hint__pen', '按住鼠标左键拖动，圈出你的问题'), viewToggle);
    overlay.append(footer); document.body.append(overlay);
    document.body.style.overflow = 'hidden'; document.body.classList.add('teacher-broadcast-viewing');
    protectOriginal(); originalObserver = new MutationObserver(protectOriginal); originalObserver.observe(document.body, { childList: true });
    for (const name of ['keydown', 'keyup', 'keypress', 'click', 'dblclick', 'contextmenu', 'submit', 'drop']) {
      overlay.addEventListener(name, (event) => {
        if ((event.target as Element)?.closest?.('[data-broadcast-view-control]')) return;
        event.preventDefault(); event.stopPropagation();
      });
    }
    viewport.addEventListener('wheel', (event) => {
      event.preventDefault(); event.stopImmediatePropagation();
      viewWheel(event);
    }, { passive: false, capture: true });
    fit();
  }
  function clearRoom() {
    presence?.pause(); generation++; adapter?.dispose(); adapter = null; room = null;
    retainedView?.adapter.dispose(); retainedView = null; adapterLoading = false; frameReady = false;
    clearTimeout(frameTimer); frameTimer = 0; frameRetries = 0;
    buffered.length = 0; bufferedBytes = 0; wantsSnapshot = false;
    clearTimeout(disconnectTimer); disconnectTimer = 0; disconnectDeadline = 0;
    clearTimeout(snapshotTimer); snapshotTimer = 0; recovering = false;
    teacherStatus = ''; originalObserver?.disconnect(); originalObserver = null;
    overlay?.remove(); overlay = null; viewport = null; stage = null; loading = null; status = null; viewToggle = null;
    focus = null; viewLeft = 0; viewTop = 0; viewScale = 1; drawing = false; manualUntil = 0;
    clearTimeout(followTimer); followTimer = 0;
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
    const { sessionId, connectionId = sessionId } = room;
    ended.add(sessionId); presence?.end(sessionId); bridge.send({ type: 'broadcast:stop', sessionId });
    saveResume(false); clearRoom(); clearSessionAnnotations(connectionId); closePicker();
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
  function waitForFrame() {
    clearTimeout(frameTimer); frameTimer = 0;
    if (source || !room || !connected || frameReady) return;
    frameTimer = window.setTimeout(() => {
      frameTimer = 0;
      if (source || !room || !connected || frameReady) return;
      // Cursor, focus and presence updates cannot prove that a complete picture
      // arrived. Only actual rrweb traffic extends this progress deadline.
      if (Date.now() - frameStarted >= 60000) { recover('画面正在重新同步…'); return; }
      if (Date.now() - frameProgress >= 12000) {
        frameRetries++;
        if (frameRetries >= 3) { recover('画面正在重新同步…'); return; }
        queueSnapshot(); updateState('画面正在重新同步…');
      }
      waitForFrame();
    }, 12000);
  }
  function retireAdapter() {
    clearTimeout(frameTimer); frameTimer = 0;
    clearTimeout(snapshotTimer); snapshotTimer = 0;
    adapterLoading = false;
    if (!source && adapter && stage?.dataset.ready === 'true') {
      retainedView?.adapter.dispose(); retainedView?.stage.remove();
      adapter.setConnected(false); stage.style.pointerEvents = 'none';
      retainedView = { adapter, stage };
    } else {
      adapter?.dispose(); stage?.remove();
    }
    adapter = null; stage = null; frameReady = false;
    buffered.length = 0; bufferedBytes = 0; wantsSnapshot = false;
  }
  function recover(text: string) {
    if (!room || disposed || recovering) return;
    recovering = true; setConnected(false); updateState(text);
    // A failed mirror stops accepting packets. Rebuild all display adapters after
    // a fresh authenticated room announcement, rather than keep a frozen player.
    generation++; retireAdapter(); updateState(text);
    bridge.reconnect();
  }
  function adapterStatus(text: string) {
    if (text.includes('同步中断')) recover('画面正在重新同步…');
    else if (text.includes('变化过多')) {
      const now = Date.now(); capacityFailures.push(now);
      while (capacityFailures[0] < now - 60000) capacityFailures.shift();
      // A permanently oversized page must not create a rapid reconnect loop.
      if (capacityFailures.length >= 3) {
        if (source) stopSharing(); else clearRoom();
        showMessage('当前页面内容过多，分享已暂停。请关闭不需要的内容后重新分享。');
      } else recover('页面内容较多，正在重新同步…');
    }
    else if (text === '画面已同步' && !source && !frameReady) return;
    else updateState(text);
  }
  async function begin(next: Room, teacher: boolean) {
    if (!next.sessionId || !next.pageId || teacher !== config.canTeach) return;
    if (teacher && (next.pageId !== bridge.pageId() || !config.pageGrant)) return;
    if (ended.has(next.sessionId)) { if (teacher) bridge.send({ type: 'broadcast:stop', sessionId: next.sessionId }); return; }
    pending = false; clearTimeout(pendingTimer);
    if (room?.sessionId === next.sessionId && room.pageId === next.pageId && source === teacher && (adapter || adapterLoading) && (connected || teacher)) {
      const restoring = !connected;
      Object.assign(room, next);
      if (restoring) { setConnected(true); if (!teacher) queueSnapshot(); }
      updateState();
      return;
    }
    const keepView = !teacher && !source && room?.sessionId === next.sessionId && !!overlay;
    if (keepView) { generation++; retireAdapter(); }
    else clearRoom();
    source = teacher; room = next; setConnected(true); frameRetries = 0; frameProgress = frameStarted = Date.now(); bridge.onActiveChange();
    if (teacher) { presence?.start(next.sessionId); saveResume(true); closePicker(); document.querySelector<HTMLButtonElement>('[data-assistant-close]')?.click(); }
    else {
      createView(); stage = el('div', 'teacher-broadcast-stage'); stage.style.visibility = 'hidden';
      viewport!.append(stage); fit();
    }
    updateState(teacher ? undefined : '正在同步老师画面…');
    const version = generation;
    adapterLoading = true;
    const onStatus = (text: string) => { if (generation === version && room === next) adapterStatus(text); };
    const send = (kind: string, data: any) => {
      if (disposed || generation !== version || !connected || room !== next) return false;
      return bridge.send({ type: 'broadcast:relay', sessionId: next.sessionId, pageId: next.pageId, kind, data });
    };
    try {
      const adapters = await (teacher && options.loadSourceAdapters ? options.loadSourceAdapters() : loadAdapters());
      if (disposed || generation !== version || room !== next) return;
      adapter = teacher ? adapters.attachBroadcastSource({ pageId: next.pageId, send, onStatus,
        annotationScope: { sessionId: `${next.connectionId || next.sessionId}:broadcast:${config.uid}`, url: location.href } })
        : adapters.attachBroadcastViewer({ pageId: next.pageId, container: stage!, sendDrawing: (packet) => {
            // The pen owns window-capture events, including nested frame gestures.
            // Freeze from its actual lifecycle rather than an obscured DOM listener.
            if (packet.phase === 'start') { drawing = true; clearTimeout(followTimer); }
            else if (packet.phase === 'end') endDrawing();
            send('drawing', packet);
          },
          onStatus, onReady: () => {
            if (disposed || generation !== version || room !== next) return;
            frameReady = true; frameRetries = 0; clearTimeout(frameTimer); frameTimer = 0;
            if (stage) { stage.style.visibility = ''; stage.dataset.ready = 'true'; }
            retainedView?.adapter.dispose(); retainedView?.stage.remove(); retainedView = null;
            updateState();
          }, onViewWheel: viewWheel, onFocus: (nextFocus) => {
            if (generation !== version || room !== next) return;
            focus = nextFocus; fit();
          }, onViewport: (size) => {
            if (generation !== version || room !== next) return;
            sourceWidth = Math.max(320, Math.min(7680, size.width || 1440)); sourceHeight = Math.max(240, Math.min(4320, size.height || 900));
            fit(); updateState();
          } });
      if (generation !== version || room !== next) { adapter.dispose(); adapter = null; return; }
      adapterLoading = false;
      loadFailures = 0;
      // IDE transport starts disconnected even though the mirror/editor adapters
      // start live. Activate the bundle once; repeated room announcements skip it.
      adapter.setConnected(connected);
      const waiting = buffered.splice(0); bufferedBytes = 0; waiting.forEach(receiveRelay);
      if (!teacher || wantsSnapshot) queueSnapshot();
      waitForFrame();
    } catch {
      if (generation !== version || room !== next) return;
      adapterLoading = false;
      if (++loadFailures < 3) recover('分享组件正在重新连接…');
      else {
        if (teacher) stopSharing(); else clearRoom();
        showMessage('分享组件暂时无法加载，请检查网络后重新进入。');
      }
    }
  }
  function receiveRelay(message: any) {
    if (!room || room.sessionId !== message.sessionId || room.pageId !== message.pageId) return;
    if (message.senderUid === room.teacherUid && message.kind === 'mirror' && /^rrweb(?:-chunk|-batch)?$/.test(message.data?.type)) frameProgress = Date.now();
    if (!adapter) {
      const bytes = JSON.stringify(message).length;
      if (buffered.length < 160 && bufferedBytes + bytes <= 8 * 1024 * 1024) { buffered.push(message); bufferedBytes += bytes; }
      else { buffered.length = 0; bufferedBytes = 0; wantsSnapshot = true; }
      return;
    }
    adapter.receive(message.kind, message.data, message.senderUid === room.teacherUid ? 'teacher' : 'student');
  }
  function setConnected(value: boolean) {
    const changed = connected !== value;
    if (changed && !source) {
      // Keep the visible frame during a socket interruption; the next complete
      // snapshot, rather than a ready/pong packet, marks the display as current.
      if (value) { frameReady = false; frameProgress = frameStarted = Date.now(); frameRetries = 0; }
      clearTimeout(frameTimer); frameTimer = 0;
    }
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
    else if (changed) waitForFrame();
  }
  function authenticationLost() {
    const connectionId = room?.connectionId || room?.sessionId;
    pending = false; clearTimeout(pendingTimer); ended.clear(); presence?.end(); saveResume(false); clearRoom(); closePicker();
    if (connectionId) clearSessionAnnotations(connectionId);
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
    if (start) { start.disabled = !connected || pending || !online.length || bridge.sharing() || !config.pageGrant
      || bridge.sourceReady?.() === false; start.textContent = pending ? '正在开始…' : '开始分享'; }
  }
  async function startSharing() {
    if (!connected || pending || bridge.sharing() || !config.pageGrant || bridge.sourceReady?.() === false) return;
    const page = bridge.pageId();
    const studentUids = [...selected].filter((uid) => students.some((student) => student.uid === uid && student.online));
    if (!studentUids.length || studentUids.length > 30) return;
    pending = true; if (error) error.hidden = true; renderStudents();
    try {
      await (options.loadSourceAdapters ? options.loadSourceAdapters() : loadAdapters());
      if (disposed || !picker || !pending) return;
      if (page !== bridge.pageId() || bridge.sourceReady?.() === false) { pending = false; renderStudents(); return; }
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
    if (bridge.sourceReady?.() === false) { showMessage('页面正在准备，请稍候。'); return; }
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
      if (!message.followed) presence?.end(message.sessionId);
      if (room?.sessionId === message.sessionId) { saveResume(false); clearRoom(); if (message.reason && !message.switched) showMessage(message.reason); }
      // Adapter disposal flushes its cache; clear only after that final write.
      if (!message.followed && !message.switched) clearSessionAnnotations(message.connectionId || message.sessionId);
    }
    if (message.type === 'broadcast:error' || ((message.type === 'error' || message.error) && (pending || picker || room))) {
      pending = false; clearTimeout(pendingTimer); renderStudents();
      const text = message.message || '分享暂时不可用，请稍后重试。';
      if (room) updateState(text); else showMessage(text);
      if (/^(?:FORBIDDEN|ENDED|LOGIN_REVOKED)$/.test(message.code || '')) { presence?.end(room?.sessionId); saveResume(false); clearRoom(); showMessage(text); }
      else if (/^(?:STALE_PAGE|BACKPRESSURE|RATE_LIMIT)$/.test(message.code || '')) recover('画面正在重新同步…');
      else if (message.code === 'PAUSED' && room) { setConnected(false); updateState(text); }
    }
  }
  const click = (event: MouseEvent) => {
    if ((event.target as Element)?.closest?.('[data-teacher-broadcast-open]')) { event.preventDefault(); open(); }
  };
  const resize = () => fit();
  document.addEventListener('click', click); window.addEventListener('resize', resize);
  return {
    receive, setConnected, wantsConnection, open, showMessage, authenticationLost, stopSharing,
    get currentRoom() { return room; },
    get teacherRoom() { return source ? room : null; },
    get teacherStatus() { return teacherStatus; },
    pageReady() { renderStudents(); },
    pageLoading() {
      renderStudents();
      if (!source || !room) return;
      // Keep room identity and the authenticated socket alive. The old document
      // may unload, so stop only its recorder/editors until the next granted page.
      generation++; adapter?.dispose(); adapter = null; adapterLoading = false;
      buffered.length = 0; bufferedBytes = 0;
      updateState('正在切换页面…');
    },
    get active() { return !!room || pending; },
    dispose() { disposed = true; pending = false; clearTimeout(pendingTimer); clearTimeout(flashTimer); flash?.remove(); closePicker(); clearRoom(); presence?.dispose(); document.removeEventListener('click', click); window.removeEventListener('resize', resize); },
  };
}
