import { captureProblemSnapshot, canCaptureProblemSnapshot } from './snapshot';
import { installChatPanelDrag } from './drag';
import {
  ChatMessage, ChatPeer, ChatRoster, ClassChatConfig, fileSize, messageSummary, peerKey, safeAssetUrl,
} from './types';

const icons = {
  chat: '<path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H5l-3 3V11.5A7.5 7.5 0 0 1 9.5 4h3A7.5 7.5 0 0 1 20 11.5Z"/><path d="M7 10h8M7 14h5"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  attach: '<path d="m8 13 7-7a3 3 0 0 1 4 4L9 20a5 5 0 0 1-7-7L13 2M6 15l9-9"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  send: '<path d="m3 3 18 9-18 9 3-9-3-9Zm3 9h15"/>',
  code: '<path d="m8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16"/>',
  back: '<path d="m14 5-7 7 7 7"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  file: '<path d="M14 3H5v18h14V8l-5-5Zm0 0v5h5M8 13h8m-8 4h5"/>',
};
const icon = (name: keyof typeof icons) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;

let installed: (() => void) | null = null;

export function installClassChat(config: ClassChatConfig) {
  if (!config.enabled || !config.uid || installed) return installed;
  const doc = document;
  const win = window;
  const lifetime = new AbortController();
  const signal = lifetime.signal;
  const host = doc.createElement('aside');
  host.className = 'class-chat';
  host.dataset.liveSharePrivate = '';
  host.dataset.classChat = '';
  host.setAttribute('aria-label', '师生消息');
  host.innerHTML = `<button type="button" class="class-chat__launcher" aria-label="打开师生消息，可拖动调整位置" title="师生消息 · 拖动调整位置" aria-haspopup="dialog" aria-expanded="false" aria-controls="class-chat-panel">
    <span class="class-chat__launcher-hint"${config.canTeach ? ' hidden' : ''}>给老师发消息</span><span class="class-chat__launcher-avatar"></span><span class="class-chat__launcher-mark">${icon('chat')}</span><span class="class-chat__badge" hidden></span>
  </button>
  <section class="class-chat__panel" id="class-chat-panel" role="dialog" aria-label="师生消息" hidden tabindex="-1">
    <header class="class-chat__top"><div><span class="class-chat__eyebrow">随时聊一聊</span><h2>师生消息</h2></div><button type="button" class="class-chat__icon-button" data-close aria-label="收起消息">${icon('close')}</button></header>
    <div class="class-chat__body"><nav class="class-chat__sidebar" aria-label="聊天联系人"><label class="class-chat__search">${icon('search')}<input type="search" placeholder="搜索学员" aria-label="搜索联系人" /></label><div class="class-chat__peers"></div></nav>
    <div class="class-chat__conversation"><header class="class-chat__conversation-header"><button type="button" class="class-chat__icon-button class-chat__back" data-back aria-label="返回联系人">${icon('back')}</button><span class="class-chat__peer-avatar"></span><div class="class-chat__peer-info"><strong class="class-chat__peer-name">选择一位学员</strong><span class="class-chat__connection">发条消息，交流一下</span></div><span class="class-chat__quota" tabindex="0" aria-label="每对师生最多保留 50 MB 聊天记录，超过后自动清理最早记录" title="每对师生最多保留 50 MB，最早的消息和附件会自动清理">50 MB</span></header>
    <div class="class-chat__messages" tabindex="0" role="log" aria-label="聊天记录" aria-live="polite" aria-relevant="additions"><div class="class-chat__empty"></div></div>
    <button type="button" class="class-chat__new-message" hidden>有新消息 ↓</button>
    <div class="class-chat__feedback" role="status" hidden></div>
    <div class="class-chat__composer"><button type="button" class="class-chat__snapshot" data-snapshot hidden>${icon('code')}<span>发送题目与代码</span><span class="class-chat__snapshot-arrow">↗</span></button>
    <div class="class-chat__attachment" hidden></div><textarea class="class-chat__input" rows="2" maxlength="10000" placeholder="说说你的想法…" aria-label="消息内容"></textarea>
    <footer class="class-chat__compose-tools"><div class="class-chat__attachments"><button type="button" class="class-chat__icon-button" data-image aria-label="发送图片" title="图片，最多 5 MB">${icon('image')}</button><button type="button" class="class-chat__icon-button" data-file aria-label="发送文件" title="文件，最多 10 MB">${icon('attach')}</button><span class="class-chat__keyboard-hint">Enter 发送 · Shift + Enter 换行</span></div><button type="button" class="class-chat__send" disabled>发送 ${icon('send')}</button></footer>
    <input type="file" data-file-input hidden /><input type="file" data-image-input accept="image/png,image/jpeg,image/gif,image/webp" hidden /></div></div></div>
  </section>
  <dialog class="class-chat__lightbox" aria-label="图片预览" aria-describedby="class-chat-image-name">
    <button type="button" class="class-chat__lightbox-close" aria-label="关闭图片预览" title="关闭 · Esc">${icon('close')}</button>
    <figure class="class-chat__lightbox-figure"><img class="class-chat__lightbox-image" alt="" hidden /><p class="class-chat__lightbox-status" role="status">正在加载图片…</p><figcaption id="class-chat-image-name" class="class-chat__lightbox-name"></figcaption></figure>
  </dialog>`;
  doc.body.append(host);
  const query = <T extends HTMLElement = HTMLElement>(selector: string) => host.querySelector<T>(selector)!;
  const launcher = query<HTMLButtonElement>('.class-chat__launcher');
  const panel = query('.class-chat__panel');
  const panelDrag = installChatPanelDrag(panel, query('.class-chat__top'), config.uid, signal);
  const peersRoot = query('.class-chat__peers');
  const messagesRoot = query('.class-chat__messages');
  const input = query<HTMLTextAreaElement>('.class-chat__input');
  const sendButton = query<HTMLButtonElement>('.class-chat__send');
  const snapshotButton = query<HTMLButtonElement>('[data-snapshot]');
  const fileInput = query<HTMLInputElement>('[data-file-input]');
  const imageInput = query<HTMLInputElement>('[data-image-input]');
  const search = query<HTMLInputElement>('.class-chat__search input');
  const teacherPicker = doc.createElement('select');
  teacherPicker.className = 'class-chat__teacher-picker';
  teacherPicker.setAttribute('aria-label', '选择聊天老师');
  teacherPicker.hidden = true;
  query('.class-chat__peer-info').append(teacherPicker);
  const badge = query('.class-chat__badge');
  const feedback = query('.class-chat__feedback');
  const newMessage = query<HTMLButtonElement>('.class-chat__new-message');
  const lightbox = query<HTMLDialogElement>('.class-chat__lightbox');
  const lightboxImage = query<HTMLImageElement>('.class-chat__lightbox-image');
  const lightboxStatus = query('.class-chat__lightbox-status');
  let imageOpener: HTMLElement | null = null;
  const drafts = new Map<string, string>();
  const positionKey = `onebyone.class-chat.position.v1:${config.uid}`;
  let roster: ChatRoster = { canTeach: config.canTeach, peers: [], unread: 0, quotaBytes: 52428800, maxFileBytes: 10485760, maxImageBytes: 5242880 };
  let selected: ChatPeer | null = null;
  let opened = false;
  let sending = false;
  let disposed = false;
  let cachedPage = false;
  let authorizationLost = false;
  let retryAttempt: { signature: string; clientId: string } | null = null;
  let selectedFile: File | null = null;
  let previewUrl = '';
  let messages: ChatMessage[] = [];
  let hasMore = false;
  let historyExpanded = false;
  let loadingMessages = false;
  let messageSequence = 0;
  let refreshPromise: Promise<void> | null = null;
  let refreshAgain = false;
  let hasFetchedRoster = false;
  let lastRead = '';
  let readPending = '';
  let lastRenderedMessages = '';
  let socket: WebSocket | null = null;
  let reconnectTimer = 0;
  let pingTimer = 0;
  let refreshTimer = 0;
  let feedbackTimer = 0;
  let reconnectAttempt = 0;
  let channel: BroadcastChannel | null = null;
  let drag: { pointerId: number; startX: number; startY: number; left: number; top: number; moved: boolean } | null = null;
  let suppressClick = false;
  let position = { x: 1, y: 0.74 };
  let launcherIdentity = '';
  try {
    const saved = JSON.parse(localStorage.getItem(positionKey) || 'null');
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) position = { x: Math.max(0, Math.min(1, saved.x)), y: Math.max(0, Math.min(1, saved.y)) };
  } catch { /* Position is optional when storage is disabled. */ }
  host.classList.toggle('is-teacher', config.canTeach);
  query('.class-chat__sidebar').hidden = !config.canTeach;
  query('.class-chat__quota').hidden = !config.canTeach;
  query('[data-back]').hidden = !config.canTeach;
  search.placeholder = config.canTeach ? '搜索学员' : '搜索老师';
  query('.class-chat__peer-name').textContent = config.canTeach ? '选择一位学员' : '和老师聊一聊';

  function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = '') {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  }
  function avatar(target: HTMLElement, name: string, url?: string) {
    target.replaceChildren();
    const address = safeAssetUrl(url, win.location.href);
    if (address) {
      const image = element('img'); image.src = address; image.alt = ''; image.loading = 'lazy'; image.draggable = false;
      image.addEventListener('error', () => { target.textContent = name.slice(0, 1) || '聊'; }, { once: true });
      target.append(image);
    } else target.textContent = name.slice(0, 1) || '聊';
  }
  function closeImagePreview(restoreFocus = true) {
    const opener = imageOpener; imageOpener = null;
    if (lightbox.open) lightbox.close();
    lightboxImage.removeAttribute('src'); lightboxImage.hidden = true;
    if (restoreFocus && opener?.isConnected) opener.focus({ preventScroll: true });
  }
  function openImagePreview(url: string, name: string, opener: HTMLElement) {
    imageOpener = opener;
    lightboxImage.hidden = true; lightboxImage.alt = name;
    lightboxStatus.textContent = '正在加载图片…'; lightboxStatus.hidden = false;
    query('.class-chat__lightbox-name').textContent = name;
    lightboxImage.src = url;
    if (!lightbox.open) lightbox.showModal();
  }
  function renderLauncherAvatar() {
    const teacher = !config.canTeach && defaultTeacher();
    const name = config.canTeach ? config.name || '聊' : teacher ? teacher.name : '老师';
    const url = config.canTeach ? config.avatarUrl : teacher ? teacher.avatarUrl : undefined;
    const identity = JSON.stringify([name, url]);
    if (identity === launcherIdentity) return;
    launcherIdentity = identity;
    avatar(query('.class-chat__launcher-avatar'), name, url);
  }

  function notify(text: string, error = false, temporary = false) {
    win.clearTimeout(feedbackTimer);
    feedback.textContent = text;
    feedback.hidden = !text;
    feedback.classList.toggle('is-error', error);
    if (temporary) feedbackTimer = win.setTimeout(() => { feedback.hidden = true; }, 5000);
  }
  async function api(params?: Record<string, string | number>, body?: any) {
    const url = new URL(config.apiUrl, win.location.href);
    Object.entries(params || {}).forEach(([key, value]) => url.searchParams.set(key, String(value)));
    const form = body instanceof FormData;
    const response = await fetch(url.href, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', signal,
      headers: { Accept: 'application/json', ...(body && !form ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (form ? body : JSON.stringify(body)) : undefined,
    });
    let result: any;
    try { result = await response.json(); } catch { throw new Error('连接暂时中断，请稍后再试。消息草稿已保留。'); }
    if (!response.ok || result.error) throw Object.assign(new Error(result.error?.message || '暂时无法完成，请稍后再试。'), { status: response.status });
    return result;
  }
  function launcherBounds() {
    const view = win.visualViewport;
    const width = view?.width || win.innerWidth; const height = view?.height || win.innerHeight;
    const hint = query('.class-chat__launcher-hint');
    const hintWidth = config.canTeach ? 52 : Math.max(52, hint.offsetWidth);
    const side = 14 + Math.max(0, (hintWidth - 52) / 2);
    const top = config.canTeach ? 14 : 14 + hint.offsetHeight + 8;
    return { left: (view?.offsetLeft || 0) + side, top: (view?.offsetTop || 0) + top,
      width: Math.max(0, width - side * 2 - 52), height: Math.max(0, height - top - 66) };
  }
  function placeLauncher() {
    const bounds = launcherBounds();
    host.style.left = `${bounds.left + position.x * bounds.width}px`;
    host.style.top = `${bounds.top + position.y * bounds.height}px`;
  }
  function savePosition() {
    try { localStorage.setItem(positionKey, JSON.stringify(position)); } catch { /* Optional. */ }
  }
  function atBottom() { return messagesRoot.scrollHeight - messagesRoot.clientHeight - messagesRoot.scrollTop < 42; }
  function scrollBottom() { messagesRoot.scrollTop = messagesRoot.scrollHeight; newMessage.hidden = true; }
  function updateControls() {
    input.disabled = !selected;
    sendButton.disabled = !selected || sending || (!input.value.trim() && !selectedFile);
    snapshotButton.disabled = !selected || sending;
    snapshotButton.hidden = config.canTeach || !canCaptureProblemSnapshot();
    query<HTMLButtonElement>('[data-image]').disabled = !selected || sending;
    query<HTMLButtonElement>('[data-file]').disabled = !selected || sending;
    panel.classList.toggle('has-contact', !!selected);
    panel.classList.toggle('has-sidebar', config.canTeach);
    teacherPicker.disabled = sending;
  }
  function defaultTeacher() {
    return roster.peers.find((peer) => peer.uid === roster.defaultPeerUid) || roster.peers[0];
  }
  function renderPeers() {
    renderLauncherAvatar();
    const needle = search.value.trim().toLocaleLowerCase();
    peersRoot.replaceChildren();
    const peers = roster.peers.filter((peer) => `${peer.name} ${peer.uid}`.toLocaleLowerCase().includes(needle));
    if (config.canTeach) {
      const priority = (peer: ChatPeer) => (peer.unread > 0 ? (peer.online ? 0 : 1) : peer.online ? 2 : 3);
      const lastAt = (peer: ChatPeer) => new Date(peer.lastAt || 0).getTime() || 0;
      peers.sort((a, b) => priority(a) - priority(b) || lastAt(b) - lastAt(a) || a.uid - b.uid);
    }
    if (!peers.length) peersRoot.append(element('p', 'class-chat__peer-empty', hasFetchedRoster ? (needle ? '没有找到这位联系人' : config.canTeach ? '还没有可联系的学员' : '暂时没有可联系的老师') : '正在加载…'));
    peers.forEach((peer) => {
      const button = element('button', `class-chat__peer${selected && peerKey(selected) === peerKey(peer) ? ' is-selected' : ''}`);
      button.type = 'button'; button.dataset.peerUid = String(peer.uid);
      const presence = config.canTeach && typeof peer.online === 'boolean' ? (peer.online ? '在线' : '离线') : '';
      button.setAttribute('aria-label', `${peer.name}${presence ? `，${presence}` : ''}${peer.unread ? `，${peer.unread} 条未读消息` : ''}`);
      const face = element('span', 'class-chat__avatar'); avatar(face, peer.name, peer.avatarUrl);
      const copy = element('span', 'class-chat__peer-copy');
      const name = element('strong', '', peer.name);
      if (presence) {
        const dot = element('span', `class-chat__presence-dot${peer.online ? ' is-online' : ''}`);
        dot.title = presence; dot.setAttribute('aria-label', presence); name.append(dot);
      }
      copy.append(name, element('span', '', typeof peer.lastMessage === 'string' ? peer.lastMessage : '发条消息，聊一聊'));
      button.append(face, copy);
      if (peer.unread) button.append(element('span', 'class-chat__peer-unread', peer.unread > 99 ? '99+' : String(peer.unread)));
      button.addEventListener('click', () => { void selectPeer(peer); }, { signal });
      peersRoot.append(button);
    });
    teacherPicker.hidden = config.canTeach || roster.peers.length < 2;
    query('.class-chat__peer-info').classList.toggle('can-switch-teacher', !teacherPicker.hidden);
    teacherPicker.replaceChildren(...roster.peers.map((peer) => {
      const option = element('option', '', `${peer.name}${peer.unread ? ` · ${peer.unread} 条未读` : ''}`);
      option.value = peerKey(peer);
      option.selected = peerKey(peer) === (selected ? peerKey(selected) : defaultTeacher() && peerKey(defaultTeacher()!));
      return option;
    }));
    badge.hidden = roster.unread === 0;
    badge.textContent = roster.unread > 99 ? '99+' : String(roster.unread);
    launcher.classList.toggle('has-unread', roster.unread > 0);
    launcher.setAttribute('aria-label', roster.unread ? `${roster.unread} 条未读消息，打开师生消息` : '打开师生消息，可拖动调整位置');
    launcher.title = config.canTeach ? '师生消息 · 拖动调整位置' : '给老师发消息 · 拖动调整位置';
    renderPeerStatus();
    updateControls();
  }
  function renderPeerStatus() {
    const status = query('.class-chat__connection');
    const hasPresence = config.canTeach && selected && typeof selected.online === 'boolean';
    status.classList.toggle('has-presence', !!hasPresence);
    status.classList.toggle('is-online', !!hasPresence && !!selected?.online);
    status.textContent = !selected ? '发条消息，交流一下' : hasPresence
      ? `${selected!.online ? '在线' : '离线'} · 仅你和这位学员可见`
      : config.canTeach ? '私聊 · 仅你和这位学员可见' : '私聊 · 仅你和老师可见';
  }
  async function refreshRoster() {
    if (disposed) return;
    if (refreshPromise) { refreshAgain = true; return refreshPromise; }
    refreshPromise = (async () => {
      try {
        const result = await api();
        if (disposed || !Array.isArray(result.peers)) return;
        const resumeConnection = authorizationLost;
        authorizationLost = false;
        if (resumeConnection) connect();
        const previousPeers = new Map(roster.peers.map((peer) => [peerKey(peer), peer]));
        const incoming = !config.canTeach && hasFetchedRoster && !resumeConnection ? (result.peers as ChatPeer[]).filter((peer) => {
          const previous = previousPeers.get(peerKey(peer));
          return peer.unread > 0 && (peer.unread > (previous?.unread || 0)
            || peer.unread >= (previous?.unread || 0) && peer.lastAt !== previous?.lastAt);
        }).sort((a, b) => new Date(b.lastAt || 0).getTime() - new Date(a.lastAt || 0).getTime())[0] : undefined;
        roster = { ...roster, ...result };
        hasFetchedRoster = true;
        if (selected) {
          const fresh = roster.peers.find((peer) => peerKey(peer) === peerKey(selected!));
          if (fresh) selected = fresh;
          else { selected = null; messages = []; renderMessages(); }
        }
        renderPeers();
        if (incoming) {
          // Reveal the teacher's new message without stealing a child's editor
          // focus or restarting their program. Repeated polls do not reopen it.
          if (!opened) setOpen(true, { focus: false, load: false });
          if (!selected || peerKey(selected) !== peerKey(incoming)) await selectPeer(incoming, false);
          else { await loadMessages(); scrollBottom(); void markRead(); }
        } else if (!selected && !config.canTeach && defaultTeacher() && opened) await selectPeer(defaultTeacher()!);
      } catch (error) {
        if ([401, 403].includes((error as any).status)) {
          authorizationLost = true;
          closeImagePreview(false);
          win.clearTimeout(reconnectTimer); socket?.close();
          if (selected) drafts.set(peerKey(selected), input.value);
          selected = null; messages = []; hasMore = false;
          roster = { ...roster, unread: 0, peers: [] };
          query('.class-chat__peer-name').textContent = config.canTeach ? '选择一位学员' : '和老师聊一聊';
          query('.class-chat__peer-avatar').replaceChildren();
          renderMessages(); renderPeers();
        }
        if (opened && !signal.aborted) notify((error as Error).message, true);
      } finally {
        refreshPromise = null;
        if (refreshAgain && !disposed) { refreshAgain = false; void refreshRoster(); }
      }
    })();
    return refreshPromise;
  }
  function updateReceipt(row: HTMLElement, message: ChatMessage) {
    const visible = config.canTeach && message.from === config.uid && typeof message.read === 'boolean';
    row.classList.toggle('has-receipt', visible);
    let receipt = row.querySelector<HTMLElement>('.class-chat__receipt');
    if (!visible) { receipt?.remove(); return; }
    if (!receipt) { receipt = element('span', 'class-chat__receipt'); row.append(receipt); }
    receipt.classList.toggle('is-read', !!message.read);
    receipt.textContent = message.read ? '已读' : '未读';
    receipt.setAttribute('aria-label', message.read ? '学员已读' : '学员未读');
  }
  function renderMessages(keepPosition = false, addedOlder = false) {
    const renderedKey = JSON.stringify([selected && peerKey(selected), hasMore, loadingMessages, messages.map((message) => [message.id, message.read])]);
    if (keepPosition && !addedOlder && renderedKey === lastRenderedMessages) return;
    lastRenderedMessages = renderedKey;
    const oldHeight = messagesRoot.scrollHeight; const oldScroll = messagesRoot.scrollTop;
    const shouldScroll = !keepPosition || atBottom();
    const previousRows = new Map(Array.from(messagesRoot.querySelectorAll<HTMLElement>('.class-chat__message'))
      .map((row) => [row.dataset.messageId, row]));
    const fragment = doc.createDocumentFragment();
    if (hasMore) {
      const older = element('button', 'class-chat__load-more', loadingMessages ? '正在加载…' : '查看更早的消息');
      older.type = 'button'; older.disabled = loadingMessages;
      older.addEventListener('click', () => { void loadMessages(true); }, { signal });
      fragment.append(older);
    }
    if (!messages.length) {
      const empty = element('div', 'class-chat__empty');
      const mark = element('span', 'class-chat__empty-icon'); mark.innerHTML = icon('chat');
      empty.append(mark, element('strong', '', !selected ? config.canTeach ? '从左边选择一位学员' : '和老师聊一聊' : loadingMessages ? '正在加载消息…' : '从一句「你好」开始'),
        element('p', '', !selected ? '消息、图片和代码，都能在这里交流。' : config.canTeach ? '及时解答，让每一点进步都被看见。' : '遇到问题就告诉老师，不用等到下次上课。'));
      fragment.append(empty);
    }
    let previousTime = 0;
    for (const message of messages) {
      const time = new Date(message.createdAt).getTime();
      if (!previousTime || time - previousTime > 5 * 60 * 1000) {
        const date = element('time', 'class-chat__time', new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(Number.isFinite(time) ? time : Date.now()));
        date.dateTime = message.createdAt; fragment.append(date);
      }
      previousTime = time;
      // Message bodies are immutable. Keep existing image elements alive so a
      // read receipt or incoming message never downloads private images again.
      const previousRow = previousRows.get(message.id);
      if (previousRow) { updateReceipt(previousRow, message); fragment.append(previousRow); continue; }
      const own = message.from === config.uid;
      const row = element('article', `class-chat__message${own ? ' is-own' : ''}`);
      row.dataset.messageId = message.id;
      row.setAttribute('aria-label', `${own ? '我' : selected?.name || '对方'}：${messageSummary(message)}`);
      const face = element('span', 'class-chat__avatar');
      avatar(face, own ? config.name || '我' : selected?.name || '聊', own ? config.avatarUrl : selected?.avatarUrl);
      const bubble = element('div', 'class-chat__bubble');
      if (message.text) bubble.append(element('p', 'class-chat__text', message.text));
      if (message.attachment) {
        const attachment = message.attachment;
        const url = safeAssetUrl(attachment.url, win.location.href, true);
        if (url) {
          if (message.kind === 'image' && /^image\/(png|jpeg|gif|webp)$/.test(attachment.mime)) {
            const preview = element('button', 'class-chat__image-link'); preview.type = 'button';
            preview.setAttribute('aria-label', `查看图片：${attachment.name}`); preview.setAttribute('aria-haspopup', 'dialog');
            preview.addEventListener('click', () => openImagePreview(url, attachment.name, preview), { signal });
            const image = element('img', 'class-chat__image'); image.src = url; image.alt = attachment.name; image.loading = 'lazy';
            image.addEventListener('load', () => { if (shouldScroll) scrollBottom(); }, { once: true });
            image.addEventListener('error', () => { preview.replaceChildren(element('span', 'class-chat__image-error', '图片暂时无法加载')); }, { once: true });
            preview.append(image); bubble.append(preview);
          } else {
            const link = element('a', 'class-chat__file-link');
            link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer';
            const mark = element('span', 'class-chat__file-icon'); mark.innerHTML = icon('file');
            const text = element('span'); text.append(element('strong', '', attachment.name), element('small', '', `${fileSize(attachment.size)} · 点击下载`));
            link.append(mark, text); bubble.append(link);
          }
        }
      }
      if (message.snapshot) {
        const url = safeAssetUrl(message.snapshot.url, win.location.href, true);
        if (url) {
          const link = element('a', 'class-chat__code-card'); link.href = url;
          link.addEventListener('click', (event) => {
            if (!event.button && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) setOpen(false);
          }, { signal });
          const solution = message.kind === 'solution';
          const label = element('span', 'class-chat__code-label', solution ? '老师的题解 · 代码与标注' : '题目与当时的代码');
          const title = element('strong', '', message.snapshot.title);
          const excerpt = element('pre', '', (message.snapshot.codePreview ?? message.snapshot.code ?? '').split('\n').slice(0, 3).join('\n') || '（发送时尚未填写代码）');
          const action = element('span', 'class-chat__code-action', solution ? '查看老师讲解 ' : config.canTeach ? '打开题解工作台 ' : '查看题目与代码 '); const arrow = element('span'); arrow.innerHTML = icon('arrow'); action.append(arrow);
          link.append(label, title, excerpt, action); bubble.append(link);
        }
      }
      row.append(face, bubble);
      updateReceipt(row, message);
      fragment.append(row);
    }
    messagesRoot.replaceChildren(fragment);
    if (addedOlder) messagesRoot.scrollTop = oldScroll + messagesRoot.scrollHeight - oldHeight;
    else if (shouldScroll) scrollBottom();
    else { messagesRoot.scrollTop = oldScroll; newMessage.hidden = !selected?.unread; }
  }
  async function loadMessages(older = false) {
    if (!selected || disposed || (older && loadingMessages)) return;
    const peer = selected;
    const sequence = ++messageSequence;
    loadingMessages = true;
    try {
      const result = await api({ peerUid: peer.uid, domainId: peer.domainId, ...(older && messages[0] ? { before: messages[0].id } : {}) });
      if (disposed || sequence !== messageSequence || !selected || peerKey(peer) !== peerKey(selected)) return;
      const oldest = result.messages[0];
      const earlier = historyExpanded && oldest ? messages.filter((item) => typeof item.seq === 'number' && typeof oldest.seq === 'number'
        ? item.seq < oldest.seq : item.id < oldest.id) : [];
      const combined = older ? [...result.messages, ...messages] : [...earlier, ...result.messages];
      messages = [...new Map<string, ChatMessage>(combined.map((entry: ChatMessage) => [entry.id, entry] as [string, ChatMessage])).values()]
        .filter((item) => !result.oldestSeq || typeof item.seq !== 'number' || item.seq >= result.oldestSeq)
        .sort((a, b) => typeof a.seq === 'number' && typeof b.seq === 'number' ? a.seq - b.seq : a.id.localeCompare(b.id));
      if (older || !historyExpanded) hasMore = !!result.hasMore;
      if (older) historyExpanded = true;
      loadingMessages = false;
      const quota = query('.class-chat__quota');
      quota.textContent = '50 MB'; quota.title = `已使用 ${fileSize(result.usedBytes || 0)} / 50 MB，超出后自动清理最早的消息与附件`;
      renderMessages(true, older);
      if (!older) void markRead();
    } catch (error) {
      if (!signal.aborted && sequence === messageSequence) notify((error as Error).message, true);
    } finally { if (sequence === messageSequence) loadingMessages = false; }
  }
  async function markRead() {
    if (!opened || doc.hidden || !selected || !messagesRoot.getClientRects().length || !messagesRoot.clientHeight || !atBottom()) return;
    const incoming = [...messages].reverse().find((message) => message.from !== config.uid);
    if (!incoming || incoming.id === lastRead || incoming.id === readPending) return;
    const peer = selected;
    readPending = incoming.id;
    try {
      await api(undefined, { operation: 'read', peerUid: peer.uid, domainId: peer.domainId, through: incoming.id });
      if (selected && peerKey(selected) === peerKey(peer)) lastRead = incoming.id;
      channel?.postMessage({ type: 'changed' });
      void refreshRoster();
    } catch { /* Keep unread if the acknowledgement cannot reach the server. */ }
    finally { if (readPending === incoming.id) readPending = ''; }
  }
  function clearFile() {
    selectedFile = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = '';
    const attachment = query('.class-chat__attachment'); attachment.replaceChildren(); attachment.hidden = true;
    fileInput.value = ''; imageInput.value = '';
    updateControls();
  }
  function chooseFile(file?: File) {
    if (!file || sending) return false;
    const isImage = /^image\/(png|jpeg|gif|webp)$/.test(file.type);
    const limit = isImage ? roster.maxImageBytes : roster.maxFileBytes;
    if (file.size > limit) { notify(`${isImage ? '图片' : '文件'}最大 ${fileSize(limit)}，请换一个小一点的文件。`, true); return false; }
    if (!file.size) { notify('这个文件是空的，请重新选择。', true); return false; }
    clearFile(); selectedFile = file;
    const box = query('.class-chat__attachment'); box.hidden = false;
    if (isImage) {
      previewUrl = URL.createObjectURL(file);
      const image = element('img'); image.src = previewUrl; image.alt = ''; box.append(image);
    } else { const mark = element('span'); mark.innerHTML = icon('file'); box.append(mark); }
    const copy = element('span'); copy.append(element('strong', '', file.name), element('small', '', fileSize(file.size))); box.append(copy);
    const remove = element('button', 'class-chat__icon-button'); remove.type = 'button'; remove.setAttribute('aria-label', '取消附件'); remove.innerHTML = icon('close');
    remove.addEventListener('click', clearFile, { signal }); box.append(remove);
    notify(''); updateControls(); input.focus();
    return true;
  }
  async function selectPeer(peer: ChatPeer, focus = true) {
    if (sending) return;
    if (selected) drafts.set(peerKey(selected), input.value);
    const same = selected && peerKey(selected) === peerKey(peer);
    selected = peer; lastRead = ''; readPending = '';
    if (!same) { clearFile(); input.value = drafts.get(peerKey(peer)) || ''; messages = []; hasMore = false; historyExpanded = false; }
    avatar(query('.class-chat__peer-avatar'), peer.name, peer.avatarUrl);
    query('.class-chat__peer-name').textContent = peer.name;
    renderPeerStatus();
    panel.classList.add('show-conversation');
    renderPeers(); renderMessages();
    await loadMessages(); scrollBottom(); void markRead();
    if (focus && win.innerWidth > 640) input.focus({ preventScroll: true });
  }
  async function send(snapshot = false) {
    if (!selected || sending) return;
    const peer = selected; const text = input.value.trim(); const file = selectedFile;
    if (!snapshot && !text && !file) return;
    sending = true; updateControls(); sendButton.textContent = '发送中…'; notify('');
    try {
      const shot = snapshot ? await captureProblemSnapshot() : undefined;
      if (snapshot && !shot) throw new Error('暂时无法读取当前题目与代码，请在题目页面重试。');
      const signature = JSON.stringify([peerKey(peer), text, shot, !snapshot && file && [file.name, file.size, file.lastModified]]);
      if (retryAttempt?.signature !== signature) retryAttempt = {
        signature, clientId: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
      const body = { operation: 'send', peerUid: peer.uid, domainId: peer.domainId, clientId: retryAttempt.clientId, text,
        ...(shot ? { snapshot: shot } : {}) };
      let payload: any = body;
      if (file && !snapshot) {
        payload = new FormData();
        Object.entries(body).forEach(([key, value]) => payload.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value)));
        payload.append('file', file);
      }
      const result = await api(undefined, payload);
      retryAttempt = null;
      if (input.value.trim() === text) input.value = '';
      drafts.set(peerKey(peer), input.value);
      if (file && !snapshot) clearFile();
      if (selected && peerKey(selected) === peerKey(peer)) {
        if (result.message) messages = [...messages.filter((item) => item.id !== result.message.id), result.message];
        renderMessages();
      }
      channel?.postMessage({ type: 'changed' });
      void refreshRoster();
      input.focus({ preventScroll: true });
    } catch (error) { if (!signal.aborted) notify((error as Error).message, true); }
    finally { sending = false; sendButton.innerHTML = `发送 ${icon('send')}`; updateControls(); }
  }
  function setOpen(value: boolean, options: { focus?: boolean; load?: boolean } = {}) {
    opened = value; panel.hidden = !value;
    launcher.setAttribute('aria-expanded', String(value)); host.classList.toggle('is-open', value);
    if (value) {
      if (options.load !== false) void refreshRoster();
      updateControls();
      panelDrag.refresh();
      if (options.load === false) return;
      if (selected) { void loadMessages(); if (options.focus !== false) input.focus({ preventScroll: true }); }
      else if (!config.canTeach && defaultTeacher()) void selectPeer(defaultTeacher()!, options.focus !== false);
      else { renderMessages(); if (options.focus !== false) panel.focus({ preventScroll: true }); }
    } else launcher.focus({ preventScroll: true });
  }
  function changed() {
    win.clearTimeout(refreshTimer);
    refreshTimer = win.setTimeout(async () => { await refreshRoster(); if (opened && selected) await loadMessages(); }, 100);
  }
  function connect() {
    if (!config.socketUrl || disposed || authorizationLost) return;
    try {
      const url = new URL(config.socketUrl, win.location.href); url.protocol = url.protocol.replace('http', 'ws');
      socket = new WebSocket(url.href);
      socket.onopen = () => {
        reconnectAttempt = 0; changed();
        win.clearInterval(pingTimer);
        pingTimer = win.setInterval(() => { if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ping' })); }, 30000);
      };
      socket.onmessage = (event) => {
        if (event.data === 'ping') { socket?.send('pong'); return; }
        if (event.data === 'pong') return;
        try { const data = JSON.parse(event.data); if (data.type === 'changed') changed(); } catch { /* Ignore heartbeat and unrelated frames. */ }
      };
      socket.onclose = () => {
        win.clearInterval(pingTimer);
        if (!disposed && !cachedPage && !authorizationLost) reconnectTimer = win.setTimeout(connect, Math.min(30000, 1500 * 2 ** Math.min(5, reconnectAttempt++)));
      };
      socket.onerror = () => { /* onclose retries; periodic refresh remains available. */ };
    } catch { reconnectTimer = win.setTimeout(connect, 15000); }
  }
  try { channel = new BroadcastChannel(`onebyone.class-chat:${config.uid}`); channel.onmessage = changed; } catch { /* Older browsers use polling. */ }
  launcher.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary) return;
    const rect = launcher.getBoundingClientRect();
    drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
    event.preventDefault();
    launcher.setPointerCapture(event.pointerId); suppressClick = false;
  }, { signal });
  launcher.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX; const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true; suppressClick = true;
    host.classList.add('is-dragging');
    const bounds = launcherBounds();
    position = { x: Math.max(0, Math.min(1, (drag.left + dx - bounds.left) / Math.max(1, bounds.width))),
      y: Math.max(0, Math.min(1, (drag.top + dy - bounds.top) / Math.max(1, bounds.height))) };
    placeLauncher();
  }, { signal });
  const finishDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.moved) savePosition(); drag = null;
    host.classList.remove('is-dragging');
    if (launcher.hasPointerCapture(event.pointerId)) launcher.releasePointerCapture(event.pointerId);
  };
  launcher.addEventListener('pointerup', finishDrag, { signal });
  launcher.addEventListener('pointercancel', finishDrag, { signal });
  launcher.addEventListener('lostpointercapture', finishDrag, { signal });
  launcher.addEventListener('dragstart', (event) => event.preventDefault(), { signal });
  launcher.addEventListener('click', (event) => { if (suppressClick && event.detail) { suppressClick = false; return; } setOpen(!opened); }, { signal });
  launcher.addEventListener('keydown', (event) => {
    if (!event.altKey || !event.key.startsWith('Arrow')) return;
    event.preventDefault();
    const bounds = launcherBounds();
    position.x = Math.max(0, Math.min(1, position.x + (event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0) / Math.max(1, bounds.width)));
    position.y = Math.max(0, Math.min(1, position.y + (event.key === 'ArrowUp' ? -16 : event.key === 'ArrowDown' ? 16 : 0) / Math.max(1, bounds.height)));
    placeLauncher(); savePosition();
  }, { signal });
  query('[data-close]').addEventListener('click', () => setOpen(false), { signal });
  query('[data-back]').addEventListener('click', () => panel.classList.remove('show-conversation'), { signal });
  search.addEventListener('input', renderPeers, { signal });
  teacherPicker.addEventListener('change', () => {
    const peer = roster.peers.find((item) => peerKey(item) === teacherPicker.value);
    if (peer) void selectPeer(peer);
  }, { signal });
  input.addEventListener('input', () => { if (selected) drafts.set(peerKey(selected), input.value); updateControls(); }, { signal });
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); } }, { signal });
  panel.addEventListener('paste', (event: ClipboardEvent) => {
    if (!opened || !selected || sending) return;
    const clipboard = event.clipboardData;
    const raster = (file: File | null): file is File => !!file && /^image\/(png|jpeg|gif|webp)$/i.test(file.type);
    // OS screenshots usually arrive in files; some browsers only expose items.
    // Use one source so the same screenshot is never attached twice.
    const files = Array.from(clipboard?.files || []).filter(raster);
    const images = files.length ? files : Array.from(clipboard?.items || [])
      .filter((item) => item.kind === 'file').map((item) => item.getAsFile()).filter(raster);
    if (!images.length) return; // Let ordinary text paste remain entirely native.
    event.preventDefault();
    if (chooseFile(images[0]) && images.length > 1) notify('已添加第一张图片，其余图片可以接着发送。', false, true);
  }, { signal });
  sendButton.addEventListener('click', () => { void send(); }, { signal });
  snapshotButton.addEventListener('click', () => { void send(true); }, { signal });
  query('[data-file]').addEventListener('click', () => fileInput.click(), { signal });
  query('[data-image]').addEventListener('click', () => imageInput.click(), { signal });
  fileInput.addEventListener('change', () => chooseFile(fileInput.files?.[0]), { signal });
  imageInput.addEventListener('change', () => chooseFile(imageInput.files?.[0]), { signal });
  query('.class-chat__composer').addEventListener('dragover', (event) => { event.preventDefault(); }, { signal });
  query('.class-chat__composer').addEventListener('drop', (event: DragEvent) => { event.preventDefault(); chooseFile(event.dataTransfer?.files?.[0]); }, { signal });
  messagesRoot.addEventListener('scroll', () => { if (atBottom()) { newMessage.hidden = true; void markRead(); } }, { passive: true, signal });
  newMessage.addEventListener('click', () => { scrollBottom(); void markRead(); }, { signal });
  query('.class-chat__lightbox-close').addEventListener('click', () => closeImagePreview(), { signal });
  lightbox.addEventListener('click', (event) => { if (event.target === lightbox) closeImagePreview(); }, { signal });
  lightbox.addEventListener('cancel', (event) => { event.preventDefault(); closeImagePreview(); }, { signal });
  lightboxImage.addEventListener('load', () => {
    if (!lightbox.open) return;
    lightboxImage.hidden = false; lightboxStatus.hidden = true;
  }, { signal });
  lightboxImage.addEventListener('error', () => {
    if (!lightbox.open) return;
    lightboxImage.hidden = true; lightboxStatus.hidden = false; lightboxStatus.textContent = '图片暂时无法加载，请关闭后重试。';
  }, { signal });
  panel.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); } }, { signal });
  // Remote assistance and classroom drawing must never intercept private chat typing or clicks.
  ['pointerdown', 'pointerup', 'click', 'keydown', 'keyup', 'wheel'].forEach((type) => host.addEventListener(type, (event) => event.stopPropagation(), { signal }));
  win.addEventListener('resize', placeLauncher, { signal });
  win.visualViewport?.addEventListener('resize', placeLauncher, { signal });
  win.visualViewport?.addEventListener('scroll', placeLauncher, { signal });
  win.addEventListener('online', changed, { signal });
  // Only the application document changes during platform navigation. The
  // private conversation, upload, draft and socket keep their existing lifetime.
  win.addEventListener('onebyone:page-change', updateControls, { signal });
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) { changed(); void markRead(); } }, { signal });
  const polling = win.setInterval(() => { if (!doc.hidden || roster.unread) changed(); }, 15000);
  placeLauncher(); updateControls(); renderPeers(); void refreshRoster(); connect();
  const dispose = () => {
    disposed = true; closeImagePreview(false); lifetime.abort();
    win.clearInterval(polling); win.clearInterval(pingTimer); win.clearTimeout(reconnectTimer); win.clearTimeout(refreshTimer); win.clearTimeout(feedbackTimer);
    socket?.close(); channel?.close();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    host.remove(); installed = null;
  };
  win.addEventListener('pagehide', (event) => {
    if (!event.persisted) { dispose(); return; }
    cachedPage = true; socket?.close(); win.clearTimeout(reconnectTimer);
  }, { signal });
  win.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    cachedPage = false; win.clearTimeout(reconnectTimer); connect(); changed();
  }, { signal });
  win.addEventListener('onebyone:session-ended', dispose, { signal });
  installed = dispose;
  return dispose;
}
