import { mountLessonMedia } from './media';

export interface Lesson {
  _id: string; domainId: string; workspaceId: string; teacherUid: number; studentUid: number;
  teacherName: string; studentName: string; title: string; startAt: string; endAt: string;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled'; teacherJoined: boolean; studentJoined: boolean;
}
export interface LessonConfig { enabled: boolean; uid: number; canTeach: boolean; apiUrl: string; socketUrl: string }
interface Student { uid: number; name: string; online: boolean }
interface LessonSocket {
  readyState: number; bufferedAmount: number;
  send(data: string): void; close(): void;
  onopen: ((event: any) => void) | null; onmessage: ((event: any) => void) | null;
  onclose: ((event: any) => void) | null; onerror: ((event: any) => void) | null;
}
interface LessonOptions {
  fetch?: typeof fetch; now?: () => number; pollIntervalMs?: number;
  socketFactory?: (url: string) => LessonSocket; mediaFactory?: typeof mountLessonMedia;
}
let installed: (() => void) | undefined;

/** datetime-local represents a Beijing wall clock, regardless of the device's timezone. */
export function lessonStartIso(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error('请选择完整的上课日期和时间。');
  const date = new Date(`${value}:00+08:00`);
  if (!Number.isFinite(+date) || beijingDateTime(+date) !== value) throw new Error('上课日期或时间无效。');
  return date.toISOString();
}
export function beijingDateTime(timestamp: number) {
  return new Date(timestamp + 8 * 3600000).toISOString().slice(0, 16);
}
export function lessonIsDue(lesson: Lesson, timestamp: number) {
  return ['scheduled', 'active'].includes(lesson.status) && +new Date(lesson.startAt) <= timestamp
    && (lesson.status === 'active' || +new Date(lesson.endAt) > timestamp);
}
const timeText = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
}).format(new Date(value));

/** The persistent communication document owns the call; content pages only hold schedule cards. */
export function installLesson(config: LessonConfig, options: LessonOptions = {}) {
  if (installed || !config?.enabled || !config.uid || window.top !== window) return installed;
  config = { ...config };
  let pageConfig = { ...config };
  const now = options.now || Date.now;
  const request = options.fetch || window.fetch.bind(window);
  const disposers: (() => void)[] = [];
  const fetches = new Set<AbortController>();
  const dismissed = new Map<string, number>();
  let disposed = false;
  let lessons: Lesson[] = [];
  let students: Student[] = [];
  let active: Lesson | null = null;
  let socket: LessonSocket | null = null;
  let socketReady = false;
  let peerOnline = false;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;
  let pollTimer = 0;
  let messageTimer = 0;
  let refreshing = false;
  let refreshQueued = false;
  let busy = false;
  let joining = false;
  let generation = 0;
  let scopeGeneration = 0;
  // A response fetched before a local write or socket update cannot roll the
  // classroom back to an older membership/invitation snapshot.
  let dataRevision = 0;
  let skew = 0;
  let selection = 0;
  let booking = false;
  let reminderLesson: Lesson | null = null;
  let contentDocument = document;
  let contentRelease: (() => void) | undefined;
  let sharedLesson = '';
  let currentMode: 'broadcast' | 'assist' = 'broadcast';
  let currentCardSignature = '';
  const tabKey = `onebyone.lesson.tab:${config.uid}`;
  let tabId = '';
  try { tabId = sessionStorage.getItem(tabKey) || ''; } catch { /* Media still has an in-memory identity. */ }
  if (!/^[a-f0-9]{32}$/.test(tabId)) {
    tabId = Array.from(window.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
    try { sessionStorage.setItem(tabKey, tabId); } catch { /* Optional recovery. */ }
  }
  const timestamp = () => now() + skew;
  const on = (target: EventTarget, name: string, listener: EventListener) => {
    target.addEventListener(name, listener); disposers.push(() => target.removeEventListener(name, listener));
  };
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
  };
  const privateRoot = <T extends HTMLElement>(node: T): T => {
    node.setAttribute('data-live-share-private', ''); node.setAttribute('data-live-share-ui', ''); return node;
  };
  const button = (text: string, cls: string, action: () => void) => {
    const node = el('button', cls, text); node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const dialog = privateRoot(el('dialog', 'lesson-picker'));
  dialog.setAttribute('aria-labelledby', 'lesson-picker-title');
  const header = el('header', 'lesson-picker__header');
  const heading = el('div'); heading.append(el('span', 'lesson-eyebrow', '老师助手'));
  const title = el('h2', '', '上课模式'); title.id = 'lesson-picker-title'; heading.append(title);
  const close = button('×', 'lesson-icon-button', () => { if (!busy) dialog.close(); }); close.setAttribute('aria-label', '关闭上课安排');
  header.append(heading, close);
  const mode = el('div', 'lesson-picker__modes'); mode.setAttribute('role', 'group'); mode.setAttribute('aria-label', '上课方式');
  const immediate = button('立即上课', 'lesson-mode is-selected', () => setBooking(false));
  const reserve = button('预约上课', 'lesson-mode', () => setBooking(true)); mode.append(immediate, reserve);
  const form = el('form', 'lesson-picker__form');
  const searchLabel = el('label', 'lesson-field'); searchLabel.append(el('span', '', '选择学员'));
  const search = el('input'); search.type = 'search'; search.placeholder = '搜索姓名或 UID'; search.setAttribute('aria-label', '搜索上课学员');
  search.autocomplete = 'off'; searchLabel.append(search);
  const roster = el('div', 'lesson-roster'); roster.setAttribute('role', 'group'); roster.setAttribute('aria-label', '上课学员');
  const selectionText = el('p', 'lesson-picker__selection', '请选择一位学员'); selectionText.setAttribute('role', 'status');
  const dateLabel = el('label', 'lesson-field'); dateLabel.append(el('span', '', '上课时间（北京时间）'));
  const date = el('input'); date.type = 'datetime-local'; date.step = '60'; date.setAttribute('aria-label', '上课时间（北京时间）'); dateLabel.append(date);
  const fields = el('div', 'lesson-picker__fields');
  const titleLabel = el('label', 'lesson-field'); titleLabel.append(el('span', '', '课程名称'));
  const lessonTitle = el('input'); lessonTitle.type = 'text'; lessonTitle.maxLength = 80; lessonTitle.placeholder = '例如：Python 一对一'; titleLabel.append(lessonTitle);
  const durationLabel = el('label', 'lesson-field'); durationLabel.append(el('span', '', '时长（分钟）'));
  const duration = el('input'); duration.type = 'number'; duration.min = '15'; duration.max = '240'; duration.step = '15'; duration.value = '60';
  duration.setAttribute('aria-label', '课程时长（分钟）'); durationLabel.append(duration); fields.append(titleLabel, durationLabel);
  const formError = el('p', 'lesson-error'); formError.hidden = true; formError.setAttribute('role', 'alert');
  const foot = el('footer', 'lesson-picker__footer');
  const hint = el('span', '', '学员点击邀请后进入课堂');
  const submit = button('邀请并开始上课', 'lesson-button is-primary', () => { void create(); }); submit.dataset.lessonCreate = '';
  foot.append(hint, submit); form.append(searchLabel, roster, selectionText, dateLabel, fields, formError, foot);
  const scheduled = el('section', 'lesson-picker__scheduled'); scheduled.append(el('h3', '', '已安排的课程'));
  const scheduleList = el('div', 'lesson-schedule-list'); scheduled.append(scheduleList);
  dialog.append(header, mode, form, scheduled);

  const reminder = privateRoot(el('dialog', 'lesson-reminder'));
  reminder.setAttribute('aria-labelledby', 'lesson-reminder-title');
  const reminderIcon = el('div', 'lesson-reminder__icon', '◷'); reminderIcon.setAttribute('aria-hidden', 'true');
  const reminderHeading = el('h2', '', '上课时间到了'); reminderHeading.id = 'lesson-reminder-title';
  const reminderName = el('p', 'lesson-reminder__name');
  const reminderTime = el('p', 'lesson-reminder__time');
  const reminderNote = el('p', 'lesson-reminder__note', '准备好了吗？点击后和老师一起上课。');
  const reminderError = el('p', 'lesson-error'); reminderError.hidden = true; reminderError.setAttribute('role', 'alert');
  const reminderActions = el('div', 'lesson-reminder__actions');
  const later = button('稍后提醒', 'lesson-button', snooze);
  const enter = button('点击上课', 'lesson-button is-primary', () => { if (reminderLesson) void join(reminderLesson); });
  enter.dataset.lessonReminderJoin = ''; reminderActions.append(later, enter);
  reminder.append(reminderIcon, reminderHeading, reminderName, reminderTime, reminderNote, reminderError, reminderActions);

  const lessonBar = privateRoot(el('aside', 'lesson-session')); lessonBar.hidden = true; lessonBar.setAttribute('aria-label', '当前课堂');
  const lessonBarCopy = el('div', 'lesson-session__copy');
  const lessonBarName = el('strong'); const lessonBarState = el('span'); lessonBarState.setAttribute('role', 'status');
  lessonBarCopy.append(lessonBarName, lessonBarState);
  const leave = button('离开课堂', 'lesson-button', () => { void leaveLesson(false); });
  const end = button('结束课堂', 'lesson-button is-danger', () => { void leaveLesson(true); });
  const shareState = el('span', 'lesson-session__share'); shareState.hidden = true;
  const retryShare = button('重新分享', 'lesson-text-button', () => {
    if (active?.teacherUid !== config.uid || !peerOnline) return;
    sharedLesson = active._id;
    requestSharing();
  });
  retryShare.hidden = true; retryShare.dataset.lessonShareRetry = '';
  const shareModes = el('div', 'lesson-session__modes'); shareModes.setAttribute('role', 'group'); shareModes.setAttribute('aria-label', '课堂画面模式');
  const broadcastMode = button('分享我的画面', 'lesson-mode-button is-selected', () => changeMode('broadcast'));
  const assistMode = button('共享学员页面', 'lesson-mode-button', () => changeMode('assist'));
  shareModes.append(broadcastMode, assistMode);
  lessonBarCopy.append(shareState); lessonBar.append(lessonBarCopy, shareModes, retryShare, leave, end);
  const toast = privateRoot(el('div', 'lesson-toast')); toast.hidden = true; toast.setAttribute('role', 'status');
  document.body.append(dialog, reminder, lessonBar, toast);
  const media = (options.mediaFactory || mountLessonMedia)(config, { send, onLeave: () => { void leaveLesson(active?.teacherUid === config.uid); } });

  function showMessage(message: string) {
    if (disposed) return;
    toast.textContent = message; toast.hidden = false; clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => { toast.hidden = true; }, 5000);
  }
  function errorText(cause: any) { return typeof cause?.message === 'string' ? cause.message : '操作暂时未完成，请稍后重试。'; }
  async function api(body?: any, apiUrl = config.apiUrl) {
    const abort = new AbortController(); fetches.add(abort);
    const timeout = window.setTimeout(() => abort.abort(), 15000);
    try {
      const response = await request(apiUrl, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify({ ...body, tabId }) } : {}), signal: abort.signal });
      const result = await response.json();
      if (!response.ok || result.error) throw new Error(result.error?.message || result.message || '操作暂时未完成，请稍后重试。');
      return result;
    } finally { clearTimeout(timeout); fetches.delete(abort); }
  }
  function relevant() {
    return lessons.filter(lesson => lesson.status === 'active' || (lesson.status === 'scheduled' && +new Date(lesson.endAt) > timestamp()))
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active') || +new Date(a.startAt) - +new Date(b.startAt));
  }
  function setBooking(value: boolean) {
    booking = value;
    immediate.classList.toggle('is-selected', !value); reserve.classList.toggle('is-selected', value);
    immediate.setAttribute('aria-pressed', String(!value)); reserve.setAttribute('aria-pressed', String(value));
    dateLabel.hidden = !value; date.required = value;
    submit.textContent = value ? '确认预约' : '邀请并开始上课';
    hint.textContent = value ? '到时提醒学员点击上课' : '学员点击邀请后进入课堂';
  }
  function renderRoster() {
    const q = search.value.trim().toLocaleLowerCase();
    const items = students.filter(student => `${student.name} ${student.uid}`.toLocaleLowerCase().includes(q))
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name, 'zh'));
    roster.replaceChildren();
    for (const student of items) {
      const row = button('', `lesson-student${selection === student.uid ? ' is-selected' : ''}`, () => {
        if (busy) return; selection = student.uid; renderRoster();
      });
      row.setAttribute('aria-pressed', String(selection === student.uid)); row.dataset.lessonStudent = String(student.uid);
      row.disabled = busy;
      row.append(el('span', 'lesson-student__avatar', Array.from(student.name)[0] || '同'));
      const copy = el('span', 'lesson-student__copy'); copy.append(el('strong', '', student.name), el('small', '', `UID ${student.uid}`)); row.append(copy);
      row.append(el('span', `lesson-student__state${student.online ? ' is-online' : ''}`, student.online ? '在线' : '离线可预约')); roster.append(row);
    }
    if (!items.length) roster.append(el('p', 'lesson-empty', q ? '没有找到这位学员' : '暂无可安排的学员'));
    selectionText.textContent = students.find(student => student.uid === selection)?.name ? `已选择 ${students.find(student => student.uid === selection)!.name}` : '请选择一位学员';
    submit.disabled = busy || !selection || !!active;
  }
  function lessonEntry(lesson: Lesson, doc = document) {
    const row = doc.createElement('div'); row.className = 'lesson-schedule-item';
    const copy = doc.createElement('div'); copy.className = 'lesson-schedule-item__copy';
    const name = doc.createElement('strong'); name.textContent = lesson.title || '一对一课堂';
    const meta = doc.createElement('span'); meta.textContent = `${timeText(lesson.startAt)} · ${config.uid === lesson.teacherUid ? lesson.studentName : lesson.teacherName}`;
    copy.append(name, meta);
    const joinButton = doc.createElement('button'); joinButton.type = 'button'; joinButton.className = 'lesson-button is-primary';
    joinButton.textContent = active?._id === lesson._id ? '已在课堂中' : '点击上课'; joinButton.dataset.lessonJoin = lesson._id;
    joinButton.disabled = !!active || joining || (!config.canTeach && !lessonIsDue(lesson, timestamp()));
    if (joinButton.disabled && !active && !joining) joinButton.title = '到上课时间后可以进入';
    row.append(copy, joinButton);
    if (lesson.teacherUid === config.uid && !active && lesson.status === 'scheduled') {
      const cancelButton = doc.createElement('button'); cancelButton.type = 'button'; cancelButton.className = 'lesson-text-button';
      cancelButton.textContent = '取消'; cancelButton.dataset.lessonCancel = lesson._id; cancelButton.disabled = busy; row.append(cancelButton);
    }
    return row;
  }
  function renderSchedules() {
    scheduleList.replaceChildren();
    const items = relevant();
    for (const lesson of items.slice(0, 20)) scheduleList.append(lessonEntry(lesson));
    if (!items.length) scheduleList.append(el('p', 'lesson-empty', '还没有安排课程，选好学员就可以开始。'));
    renderHomeCards();
  }
  function clearHomeCards() {
    contentDocument.querySelector('[data-lesson-home]')?.remove();
    contentDocument.querySelector('.lesson-has-upcoming')?.classList.remove('lesson-has-upcoming');
    currentCardSignature = '';
  }
  function renderHomeCards() {
    if (!contentDocument.body || disposed) return;
    const items = relevant().slice(0, 3);
    const pinned = contentDocument.querySelector<HTMLElement>('.ui-pinned-contest');
    const home = contentDocument.querySelector<HTMLElement>('.ui-v2-home');
    if (!pinned && !home) { clearHomeCards(); return; }
    const signature = JSON.stringify(items.map(lesson => [lesson._id, lesson.status, lesson.title, lesson.startAt,
      lesson.teacherName, lesson.studentName, lessonIsDue(lesson, timestamp()), active?._id, joining, busy]));
    if (signature === currentCardSignature && contentDocument.querySelector('[data-lesson-home]')) return;
    clearHomeCards(); currentCardSignature = signature;
    if (!items.length) return;
    const card = contentDocument.createElement('aside'); card.className = 'lesson-home-card'; card.dataset.lessonHome = '';
    card.setAttribute('data-live-share-private', ''); card.setAttribute('data-live-share-ui', ''); card.setAttribute('aria-label', '上课安排');
    const label = contentDocument.createElement('div'); label.className = 'lesson-home-card__label'; label.textContent = '◷  上课时间';
    card.append(label);
    for (const lesson of items) card.append(lessonEntry(lesson, contentDocument));
    const note = contentDocument.createElement('small'); note.className = 'lesson-home-card__zone'; note.textContent = '北京时间'; card.append(note);
    if (pinned) { pinned.classList.add('lesson-has-upcoming'); pinned.append(card); }
    else home!.querySelector('.ui-v2-home__body')?.before(card);
  }
  function renderActive(message?: string) {
    lessonBar.hidden = !active;
    if (!active) return;
    lessonBarName.textContent = active.title || '一对一课堂';
    end.hidden = active.teacherUid !== config.uid;
    shareModes.hidden = active.teacherUid !== config.uid;
    broadcastMode.classList.toggle('is-selected', currentMode === 'broadcast'); assistMode.classList.toggle('is-selected', currentMode === 'assist');
    broadcastMode.setAttribute('aria-pressed', String(currentMode === 'broadcast')); assistMode.setAttribute('aria-pressed', String(currentMode === 'assist'));
    lessonBarState.textContent = message || (socketReady
      ? (active.teacherJoined && active.studentJoined ? '正在上课' : `等待${active.teacherUid === config.uid ? '学员' : '老师'}进入课堂…`) : '正在连接课堂…');
    leave.disabled = end.disabled = busy;
  }
  function requestSharing() {
    if (!active) return;
    window.dispatchEvent(new CustomEvent('onebyone:lesson-share-start', { detail: { lessonId: active._id, studentUid: active.studentUid, mode: currentMode } }));
  }
  function changeMode(value: 'broadcast' | 'assist') {
    if (currentMode === value || active?.teacherUid !== config.uid) return;
    currentMode = value; renderActive();
    if (peerOnline && socketReady) { sharedLesson = active._id; requestSharing(); }
  }
  function updateSharing() {
    const shouldShare = active?.teacherUid === config.uid && active.studentJoined && socketReady && peerOnline;
    if (shouldShare && sharedLesson !== active!._id) {
      sharedLesson = active!._id;
      requestSharing();
    } else if (!shouldShare && sharedLesson) stopSharing();
  }
  function stopSharing() {
    if (!sharedLesson) return;
    const lessonId = sharedLesson; sharedLesson = '';
    shareState.hidden = true; retryShare.hidden = true;
    window.dispatchEvent(new CustomEvent('onebyone:lesson-share-stop', { detail: { lessonId } }));
  }
  function snooze() {
    if (reminderLesson) dismissed.set(reminderLesson._id, timestamp() + 5 * 60000);
    reminder.close(); reminderLesson = null;
  }
  function updateReminder() {
    if (active || joining || busy || dialog.open || disposed) return;
    const lesson = relevant().find(item => item.studentUid === config.uid && lessonIsDue(item, timestamp())
      && (dismissed.get(item._id) || 0) <= timestamp());
    if (!lesson) { if (reminder.open) reminder.close(); reminderLesson = null; return; }
    reminderLesson = lesson;
    reminderHeading.textContent = lesson.teacherJoined ? '老师邀请你上课' : '上课时间到了';
    reminderName.textContent = `${lesson.teacherName} · ${lesson.title || '一对一课堂'}`;
    reminderTime.textContent = `${timeText(lesson.startAt)}（北京时间）`;
    enter.disabled = joining; enter.textContent = joining ? '正在进入…' : '点击上课';
    if (!reminder.open) { reminderError.hidden = true; reminder.showModal(); }
  }
  function replaceLesson(lesson: Lesson) {
    dataRevision++;
    const index = lessons.findIndex(item => item._id === lesson._id);
    if (index >= 0) lessons[index] = lesson; else lessons.push(lesson);
    if (active?._id === lesson._id) {
      if (!['scheduled', 'active'].includes(lesson.status)
        || !(config.uid === lesson.teacherUid ? lesson.teacherJoined : lesson.studentJoined)) {
        stopActive('课堂已结束'); return;
      }
      active = lesson; renderActive(); updateSharing();
    }
    renderSchedules(); updateReminder();
  }
  async function refresh() {
    if (disposed) return;
    if (refreshing) { refreshQueued = true; return; }
    refreshing = true;
    const scope = scopeGeneration;
    const revision = dataRevision;
    const startedAt = now();
    try {
      const result = await api(); if (disposed || scope !== scopeGeneration) return;
      if (revision !== dataRevision) { refreshQueued = true; return; }
      lessons = Array.isArray(result.lessons) ? result.lessons : [];
      students = Array.isArray(result.students) ? result.students : [];
      const serverNow = +new Date(result.serverNow);
      if (Number.isFinite(serverNow)) skew = serverNow - (startedAt + now()) / 2;
      if (active) {
        const item = lessons.find(lesson => lesson._id === active!._id);
        if (!item || !['scheduled', 'active'].includes(item.status)
          || !(config.uid === item.teacherUid ? item.teacherJoined : item.studentJoined)) stopActive('课堂已结束');
        else { active = item; renderActive(); updateSharing(); }
      }
      renderRoster(); renderSchedules(); updateReminder();
    } catch (cause) {
      if (!disposed && scope === scopeGeneration && revision === dataRevision && dialog.open) {
        formError.textContent = '课程列表暂时未能更新，请稍后重试。'; formError.hidden = false;
      }
    } finally {
      refreshing = false; clearTimeout(pollTimer);
      if (!disposed) {
        const delay = refreshQueued ? 0 : document.hidden ? 60000 : options.pollIntervalMs || 15000;
        refreshQueued = false; pollTimer = window.setTimeout(() => { void refresh(); }, delay);
      }
    }
  }
  function send(message: any) {
    if (!socket || socket.readyState !== 1 || !socketReady || !active || socket.bufferedAmount > 128 * 1024) return false;
    try { socket.send(JSON.stringify(message)); return true; } catch { return false; }
  }
  function closeSocket() {
    clearTimeout(reconnectTimer); socketReady = false; peerOnline = false;
    const old = socket; socket = null;
    if (old) { old.onclose = old.onerror = old.onmessage = old.onopen = null; old.close(); }
  }
  function stopActive(message = '') {
    generation++; dataRevision++; active = null; joining = false; reconnectAttempt = 0;
    closeSocket(); stopSharing(); media.stop(); lessonBar.hidden = true;
    if (message) showMessage(message);
    renderRoster(); renderSchedules();
    applyPageScope();
  }
  function connect() {
    if (!active || disposed || socket) return;
    const lessonId = active._id;
    const url = new URL(config.socketUrl, window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      const connection = options.socketFactory ? options.socketFactory(url.href) : new WebSocket(url.href);
      socket = connection;
      const valid = () => !disposed && socket === connection && active?._id === lessonId;
      connection.onopen = () => { if (valid()) connection.send(JSON.stringify({ type: 'join', lessonId, tabId })); };
      connection.onmessage = event => {
        if (!valid()) return;
        let message: any;
        try { message = JSON.parse(event.data); } catch { return; }
        if (message.type === 'ready') {
          if (message.lesson?._id !== lessonId) return;
          socketReady = true; peerOnline = !!message.peerOnline; reconnectAttempt = 0;
          media.setConnected(true); media.receive({ type: 'peer', online: peerOnline });
          replaceLesson(message.lesson); renderActive(); updateSharing();
        } else if (message.type === 'lesson' && message.lesson?._id === lessonId) replaceLesson(message.lesson);
        else if (message.type === 'ended' && (!message.lessonId || message.lessonId === lessonId)) {
          stopActive(message.reason || '课堂已结束'); void refresh();
        } else if (message.type === 'error') {
          if (/^(FORBIDDEN|ENDED|REPLACED|LOGIN_REVOKED|NOT_JOINED|NOT_FOUND|JOIN_REQUIRED|TOO_EARLY)$/.test(message.code || '')) {
            stopActive(message.message || '课堂连接已结束'); void refresh();
          } else { showMessage(message.message || '课堂连接暂时不可用'); renderActive(message.message); }
        } else {
          media.receive(message);
          if (message.type === 'peer') {
            peerOnline = !!message.online; updateSharing();
            renderActive(message.online ? '正在上课' : '对方暂时离开，等待重新加入…');
          }
        }
      };
      const disconnected = () => {
        if (!valid()) return;
        connection.onclose = connection.onerror = connection.onmessage = connection.onopen = null;
        socket = null; socketReady = false; peerOnline = false; media.setConnected(false); stopSharing(); renderActive('连接中断，正在重新连接…');
        try { connection.close(); } catch { /* Transport already closed. */ }
        reconnectAttempt++;
        if (reconnectAttempt > 6) { stopActive('连接未能恢复，请点击上课重新加入。'); void refresh(); return; }
        reconnectTimer = window.setTimeout(connect, Math.min(15000, 1000 * 2 ** (reconnectAttempt - 1)));
      };
      connection.onclose = disconnected; connection.onerror = disconnected;
    } catch {
      media.setConnected(false); renderActive('课堂连接失败，请离开后重新加入。');
      showMessage('课堂连接失败，请离开后重新加入。');
    }
  }
  async function enterLesson(lesson: Lesson) {
    if (disposed) return;
    dataRevision++;
    active = lesson; reminderLesson = null;
    if (reminder.open) reminder.close(); if (dialog.open) dialog.close();
    renderActive(); renderSchedules();
    // Only this user-initiated path starts media. Polling and reminders never do.
    void media.start(lesson).catch(cause => { if (active?._id === lesson._id) showMessage(errorText(cause)); });
    connect();
  }
  async function join(lesson: Lesson) {
    if (joining || active || busy || disposed) return;
    if (lesson.teacherUid !== config.uid && !lessonIsDue(lesson, timestamp())) { showMessage('还没到上课时间。'); return; }
    dataRevision++;
    joining = true; enter.disabled = true; enter.textContent = '正在进入…';
    reminderError.hidden = true; renderSchedules();
    const version = generation;
    try {
      const result = await api({ operation: 'join', lessonId: lesson._id });
      if (disposed || version !== generation || !result.lesson) return;
      replaceLesson(result.lesson); await enterLesson(result.lesson);
    } catch (cause) {
      if (disposed) return;
      const text = errorText(cause); showMessage(text);
      reminderError.textContent = text; reminderError.hidden = false;
    } finally { joining = false; enter.disabled = false; enter.textContent = '点击上课'; if (!disposed) { renderSchedules(); applyPageScope(); } }
  }
  async function create() {
    if (busy || active || !selection || disposed) return;
    formError.hidden = true;
    let startAt: string | undefined;
    try {
      if (booking) {
        startAt = lessonStartIso(date.value);
        if (+new Date(startAt) <= timestamp()) throw new Error('请选择将来的上课时间。');
      }
      if (!duration.checkValidity() || !Number.isInteger(Number(duration.value))) throw new Error('请选择 15～240 分钟的课程时长。');
    } catch (cause) { formError.textContent = errorText(cause); formError.hidden = false; return; }
    dataRevision++;
    busy = true; close.disabled = true; immediate.disabled = reserve.disabled = true; renderRoster();
    const version = generation;
    try {
      const result = await api({ operation: 'create', studentUid: selection, ...(startAt ? { startAt } : {}),
        durationMinutes: Number(duration.value), title: lessonTitle.value.trim() || '一对一课堂' });
      if (disposed || generation !== version || !result.lesson) return;
      replaceLesson(result.lesson);
      if (booking) { dialog.close(); showMessage(`已预约 ${timeText(result.lesson.startAt)}，到时提醒学员上课。`); }
      else await enterLesson(result.lesson);
    } catch (cause) {
      if (!disposed) { formError.textContent = errorText(cause); formError.hidden = false; }
    } finally {
      busy = false; close.disabled = false; immediate.disabled = reserve.disabled = false;
      if (!disposed) { renderRoster(); renderSchedules(); applyPageScope(); }
    }
  }
  async function leaveLesson(ending: boolean) {
    if (!active || busy) return;
    const lesson = active;
    const apiUrl = config.apiUrl;
    dataRevision++;
    busy = true;
    dismissed.set(lesson._id, timestamp() + 5 * 60000);
    // Release devices immediately even when the server is unreachable.
    stopActive();
    try { const result = await api({ operation: ending ? 'end' : 'leave', lessonId: lesson._id }, apiUrl); if (result.lesson && !disposed) replaceLesson(result.lesson); }
    catch { if (!disposed) showMessage('你已离开课堂，连接正在释放。'); }
    finally { busy = false; if (!disposed) { applyPageScope(); void refresh(); renderRoster(); renderSchedules(); } }
  }
  async function cancel(lessonId: string) {
    if (busy || active || disposed) return;
    dataRevision++;
    busy = true; renderSchedules();
    try { const result = await api({ operation: 'cancel', lessonId }); if (!disposed && result.lesson) replaceLesson(result.lesson); }
    catch (cause) { showMessage(errorText(cause)); }
    finally { busy = false; if (!disposed) { renderSchedules(); void refresh(); } }
  }
  function open() {
    if (!config.canTeach || disposed) return;
    document.querySelector<HTMLButtonElement>('[data-assistant-close]')?.click();
    if (active) { showMessage('你正在课堂中，可在摄像头窗口控制设备或离开课堂。'); return; }
    if (reminder.open) reminder.close();
    formError.hidden = true; date.value ||= beijingDateTime(Math.ceil((timestamp() + 30 * 60000) / 900000) * 900000);
    date.min = beijingDateTime(timestamp() + 60000);
    if (!dialog.open) dialog.showModal();
    void refresh(); search.focus();
  }
  function action(event: Event) {
    const target = (event.target as Element)?.closest?.('[data-lesson-open],[data-lesson-join],[data-lesson-cancel]') as HTMLElement;
    if (!target) return;
    if (target.hasAttribute('data-lesson-open')) { event.preventDefault(); open(); }
    if (target.dataset.lessonJoin) { const lesson = lessons.find(item => item._id === target.dataset.lessonJoin); if (lesson) { event.preventDefault(); void join(lesson); } }
    if (target.dataset.lessonCancel) { event.preventDefault(); void cancel(target.dataset.lessonCancel); }
  }
  function attachContent(page: Window) {
    try {
      if (page.location.origin !== window.location.origin) return;
      const next = page.document;
      if (contentDocument !== next) {
        clearHomeCards(); contentRelease?.(); contentDocument = next;
        if (next !== document) { next.addEventListener('click', action); contentRelease = () => next.removeEventListener('click', action); }
        else contentRelease = undefined;
      }
      renderHomeCards();
    } catch { /* A stale or external content frame cannot own schedule controls. */ }
  }
  function applyPageScope() {
    if (disposed || active || busy || joining || (config.apiUrl === pageConfig.apiUrl
      && config.socketUrl === pageConfig.socketUrl && config.canTeach === pageConfig.canTeach)) return;
    config = { ...pageConfig }; scopeGeneration++; selection = 0; lessons = []; students = []; skew = 0;
    currentMode = 'broadcast'; reminderLesson = null;
    if (reminder.open) reminder.close();
    renderRoster(); renderSchedules(); void refresh();
  }
  on(document, 'click', action);
  on(search, 'input', renderRoster);
  on(form, 'submit', event => { event.preventDefault(); void create(); });
  on(reminder, 'cancel', event => { event.preventDefault(); snooze(); });
  on(dialog, 'cancel', event => { if (busy) event.preventDefault(); });
  on(window, 'onebyone:page-change', event => {
    const detail = (event as CustomEvent).detail;
    const shell = (window as any).__onebyonePlatformShell;
    if (detail?.window && (!shell || shell.contentWindow() === detail.window)) attachContent(detail.window);
    const next = detail?.context?.lesson;
    if (next?.uid && next.uid !== config.uid) { dispose(); return; }
    if (next?.enabled && next.uid === config.uid && typeof next.apiUrl === 'string' && typeof next.socketUrl === 'string') {
      pageConfig = { ...next }; applyPageScope();
    }
  });
  on(window, 'onebyone:communication-page-ready', event => {
    const page = (event as CustomEvent).detail?.window; if (page) attachContent(page);
  });
  on(window, 'onebyone:lesson-share-state', event => {
    const detail = (event as CustomEvent).detail;
    if (!active || detail?.lessonId !== active._id || active.teacherUid !== config.uid) return;
    if (detail.mode === 'broadcast' || detail.mode === 'assist') currentMode = detail.mode;
    renderActive();
    shareState.hidden = false;
    shareState.textContent = detail.message || ({ pending: '正在准备分享画面…', active: '画面已分享', error: '分享暂时未能开始', ended: '分享已结束' } as Record<string, string>)[detail.state] || '';
    retryShare.hidden = !['error', 'ended'].includes(detail.state);
  });
  on(document, 'visibilitychange', () => { if (!document.hidden) { void refresh(); updateReminder(); } });
  on(window, 'online', () => { if (active && !socket) connect(); void refresh(); });
  const pulse = window.setInterval(() => { if (socketReady) send({ type: 'pulse' }); }, 5000);
  const clock = window.setInterval(() => {
    renderHomeCards(); updateReminder();
  }, 1000);
  function dispose() {
    if (disposed) return;
    disposed = true; generation++; closeSocket(); stopSharing(); media.dispose();
    clearTimeout(pollTimer); clearTimeout(messageTimer); clearInterval(pulse); clearInterval(clock);
    fetches.forEach(abort => abort.abort()); fetches.clear();
    disposers.forEach(remove => remove()); contentRelease?.(); clearHomeCards();
    if (dialog.open) dialog.close(); if (reminder.open) reminder.close();
    dialog.remove(); reminder.remove(); lessonBar.remove(); toast.remove(); installed = undefined;
  }
  on(window, 'onebyone:session-ended', dispose);
  on(window, 'pagehide', dispose);
  setBooking(false); renderRoster();
  const currentPage = (window as any).__onebyonePlatformShell?.contentWindow(); if (currentPage) attachContent(currentPage);
  installed = dispose; void refresh();
  return dispose;
}
