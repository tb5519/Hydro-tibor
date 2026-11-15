import { mountLessonMedia, type LessonDesktopReservation } from './media';

export interface Lesson {
  _id: string; domainId: string; workspaceId: string; teacherUid: number; studentUid: number;
  teacherName: string; studentName: string; title: string; startAt: string; endAt: string;
  status: 'scheduled' | 'active' | 'ended' | 'cancelled'; teacherJoined: boolean; studentJoined: boolean;
  apiUrl?: string; socketUrl?: string; canTeach?: boolean; domainName?: string;
}
export interface LessonConfig {
  enabled: boolean; uid: number; canTeach: boolean; apiUrl: string; socketUrl: string; resumeUrl?: string;
  inboxUrl?: string; notificationsUrl?: string;
}
interface RecoveryHint {
  lessonId: string; apiUrl: string; socketUrl: string; mode: 'broadcast' | 'assist';
  pending?: 'end' | 'leave'; tabId?: string;
}
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
const historyTimeText = (value: string) => new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
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
  let inboxLessons: Lesson[] = [];
  let inboxReady = false;
  let inboxRefreshing = false;
  let inboxQueued = false;
  let inboxRevision = 0;
  let inboxTimer = 0;
  let inboxAttempt = 0;
  let notificationSocket: LessonSocket | null = null;
  let notificationTimer = 0;
  let notificationHandshake = 0;
  let notificationAttempt = 0;
  let notificationPaused = false;
  let lastNotificationAt = 0;
  let history: Lesson[] = [];
  let historyHasMore = false;
  let students: Student[] = [];
  let active: Lesson | null = null;
  let socket: LessonSocket | null = null;
  let socketReady = false;
  let peerOnline = false;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;
  let handshakeTimer = 0;
  let recovering = false;
  let recoveryQueued = false;
  let recoveryPaused = false;
  let lastServerMessageAt = 0;
  let memoryHint: RecoveryHint | null = null;
  let hintStorageFailed = false;
  let allowNavigationUntil = 0;
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
  let shareRetryTimer = 0;
  let shareRetryAttempt = 0;
  let currentMode: 'broadcast' | 'assist' = 'broadcast';
  let currentCardSignature = '';
  let invitationSignature = '';
  const pendingDesktop = new Set<LessonDesktopReservation>();
  const recoveryKey = `onebyone.lesson.recovery:${config.uid}`;
  // This read-only channel belongs to the account, independently of whichever
  // domain owns the current page or the active classroom's media connection.
  const inboxUrl = safeRoute(config.inboxUrl, 'lesson/inbox');
  const notificationsUrl = safeRoute(config.notificationsUrl, 'lesson/notifications');
  // A duplicated browser tab copies sessionStorage. Each communication host
  // needs its own ownership identity; normal content navigation keeps this host.
  const tabId = Array.from(window.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, '0')).join('');
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
  const historical = el('section', 'lesson-picker__history'); historical.dataset.lessonHistory = '';
  historical.append(el('h3', '', '历史课程'));
  const historyError = el('p', 'lesson-error'); historyError.hidden = true; historyError.setAttribute('role', 'alert');
  const historyList = el('div', 'lesson-history-list');
  const historyNote = el('p', 'lesson-history-note'); historyNote.hidden = true;
  historical.append(historyError, historyList, historyNote);
  dialog.append(header, mode, form, scheduled, historical);

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
  const invitationNotice = privateRoot(el('aside', 'lesson-invitations')); invitationNotice.hidden = true;
  invitationNotice.setAttribute('aria-label', '其他上课邀请'); invitationNotice.setAttribute('aria-live', 'polite');

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
  document.body.append(dialog, reminder, invitationNotice, lessonBar, toast);
  const media = (options.mediaFactory || mountLessonMedia)(config, { send, onLeave: confirmation => {
    if (confirmation?.confirmed && active?._id !== confirmation.lessonId) return;
    void leaveLesson(active?.teacherUid === config.uid, !!confirmation?.confirmed);
  } });

  function safeRoute(value: unknown, ending: 'lesson' | 'lesson/conn' | 'lesson/resume' | 'lesson/inbox' | 'lesson/notifications') {
    if (typeof value !== 'string') return null;
    try {
      const url = new URL(value, window.location.href);
      if (url.origin !== window.location.origin || url.search || url.hash
        || !new RegExp(`^(?:/d/[^/]+)?/${ending}$`).test(url.pathname)) return null;
      return url.pathname;
    } catch { return null; }
  }
  function readHint(): RecoveryHint | null {
    let hint: any = memoryHint;
    try {
      if (!hintStorageFailed) { const value = window.localStorage.getItem(recoveryKey); hint = value ? JSON.parse(value) : null; }
    } catch { /* Optional local recovery details. */ }
    if (!hint || !/^[a-zA-Z0-9_-]{8,96}$/.test(hint.lessonId)
      || !safeRoute(hint.apiUrl, 'lesson') || !safeRoute(hint.socketUrl, 'lesson/conn')
      || !['broadcast', 'assist'].includes(hint.mode)
      || (hint.pending && !['end', 'leave'].includes(hint.pending))
      || (hint.tabId && !/^[a-f0-9]{32}$/.test(hint.tabId))) return null;
    return hint;
  }
  function writeHint(hint: RecoveryHint | null) {
    memoryHint = hint;
    try {
      if (hint) window.localStorage.setItem(recoveryKey, JSON.stringify(hint)); else window.localStorage.removeItem(recoveryKey);
      hintStorageFailed = false;
    } catch { hintStorageFailed = true; }
  }
  function clearHintIfMatches(expected: RecoveryHint) {
    const current = readHint();
    if (current?.lessonId === expected.lessonId && current.pending === expected.pending
      && current.tabId === expected.tabId && current.apiUrl === expected.apiUrl) writeHint(null);
  }
  function rememberActive() {
    if (active && !readHint()?.pending) writeHint({ lessonId: active._id, apiUrl: config.apiUrl,
      socketUrl: config.socketUrl, mode: currentMode });
  }
  function errorCode(cause: any) { return typeof cause?.code === 'string' ? cause.code : ''; }

  function showMessage(message: string) {
    if (disposed) return;
    toast.textContent = message; toast.hidden = false; clearTimeout(messageTimer);
    messageTimer = window.setTimeout(() => { toast.hidden = true; }, 5000);
  }
  function errorText(cause: any) { return typeof cause?.message === 'string' ? cause.message : '操作暂时未完成，请稍后重试。'; }
  function confirmLessonExit(reason: 'end' | 'leave', lesson: Lesson) {
    try {
      const action = reason === 'end' ? '结束' : '离开';
      return window.confirm(`确定${action}「${lesson.title || '一对一课堂'}」吗？${reason === 'end' ? '\n结束后，老师和学员都会离开这节课堂。' : ''}`);
    } catch { return false; }
  }
  function confirmNavigation(reason: string, allowUnload = true) {
    if (!active || disposed) return true;
    const label = ({ logout: '退出登录', 'switch-account': '切换账号', 'change-password': '修改密码', 'logout-sessions': '注销所有登录' } as Record<string, string>)[reason] || '离开当前页面';
    let allowed = false;
    try { allowed = window.confirm(`当前仍在上课，${label}会中断课堂连接。确定继续吗？`); } catch { /* A suppressed browser prompt is a cancellation. */ }
    allowNavigationUntil = allowed && allowUnload ? now() + 5000 : 0;
    return allowed;
  }
  function navigationReason(value: string, base: string) {
    try {
      const url = new URL(value, base);
      if (url.origin !== window.location.origin) return '';
      if (/\/logout\/?$/.test(url.pathname)) return 'logout';
      if (/^\/account\/\d+\/?$/.test(url.pathname)) return 'switch-account';
    } catch { /* Invalid links cannot be an account exit. */ }
    return '';
  }
  function guardExitLink(event: Event) {
    const link = (event.target as Element)?.closest?.('a[href]') as HTMLAnchorElement;
    if (!link || link.matches('[name="nav_logout"],[name="nav_switch_account"]')) return;
    const reason = navigationReason(link.getAttribute('href') || '', link.ownerDocument.baseURI);
    if (reason && !confirmNavigation(reason)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  function guardExitSubmit(event: Event) {
    const form = event.target as HTMLFormElement;
    if (form?.tagName !== 'FORM') return;
    const operation = form.querySelector<HTMLInputElement>('input[name="operation"]')?.value;
    const reason = form.hasAttribute('data-profile-password-form') || operation === 'change_password' ? 'change-password'
      : operation === 'delete_all_tokens' ? 'logout-sessions'
        : navigationReason(form.getAttribute('action') || '', form.ownerDocument.baseURI);
    if (reason && !confirmNavigation(reason, false)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }
  async function api(body?: any, apiUrl = config.apiUrl, ownerTabId = tabId) {
    const abort = new AbortController(); fetches.add(abort);
    const timeout = window.setTimeout(() => abort.abort(), 15000);
    try {
      const response = await request(apiUrl, { method: body ? 'POST' : 'GET', credentials: 'same-origin',
        headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify({ ...body, tabId: ownerTabId }) } : {}), signal: abort.signal });
      let result: any;
      try { result = await response.json(); }
      catch { throw Object.assign(new Error('课堂服务暂时不可用。'), { status: response.status }); }
      if (!response.ok || result.error) throw Object.assign(new Error(result.error?.message || result.message || '操作暂时未完成，请稍后重试。'),
        { code: result.code || (typeof result.error === 'string' ? result.error : result.error?.code), status: response.status });
      return result;
    } finally { clearTimeout(timeout); fetches.delete(abort); }
  }
  function notificationDelay(attempt: number) {
    return Math.max(document.hidden ? 5000 : 0, Math.min(15000, 1000 * 2 ** Math.min(attempt, 4)) * (.8 + Math.random() * .4));
  }
  async function refreshInbox() {
    if (disposed || notificationPaused || !inboxUrl) return;
    if (inboxRefreshing) { inboxQueued = true; return; }
    inboxRefreshing = true; clearTimeout(inboxTimer);
    const revision = inboxRevision; const writeRevision = dataRevision; const startedAt = now();
    let failed = false;
    try {
      const result = await api(undefined, inboxUrl);
      if (disposed) return;
      if (result.uid !== config.uid) { dispose(); return; }
      if (revision !== inboxRevision || writeRevision !== dataRevision) { inboxQueued = true; return; }
      if (!Array.isArray(result.lessons)) throw new Error('课堂邀请列表暂时不可用。');
      const normalized: Lesson[] = [];
      for (const lesson of result.lessons) {
        const apiUrl = safeRoute(lesson?.apiUrl, 'lesson');
        const socketUrl = safeRoute(lesson?.socketUrl, 'lesson/conn');
        if (!lesson || typeof lesson._id !== 'string' || ![lesson.teacherUid, lesson.studentUid].includes(config.uid)
          || !['scheduled', 'active', 'ended', 'cancelled'].includes(lesson.status)
          || !Number.isFinite(+new Date(lesson.startAt)) || !Number.isFinite(+new Date(lesson.endAt))
          || !apiUrl || socketUrl !== `${apiUrl}/conn`) continue;
        normalized.push({ ...lesson, apiUrl, socketUrl });
      }
      inboxLessons = [...new Map(normalized.map(lesson => [lesson._id, lesson])).values()];
      inboxReady = true; inboxAttempt = 0;
      const serverNow = +new Date(result.serverNow);
      if (Number.isFinite(serverNow)) skew = serverNow - (startedAt + now()) / 2;
      renderSchedules(); updateReminder();
    } catch (cause) {
      failed = true;
      if (disposed) return;
      if ([401, 403].includes(Number((cause as any)?.status))) {
        notificationPaused = true; closeNotifications(); inboxLessons = []; inboxReady = true;
        renderSchedules(); updateReminder();
      }
    } finally {
      inboxRefreshing = false;
      if (!disposed && !notificationPaused) {
        const delay = inboxQueued ? 0 : failed ? notificationDelay(inboxAttempt++) : document.hidden ? 60000 : 30000;
        inboxQueued = false; inboxTimer = window.setTimeout(() => { void refreshInbox(); }, delay);
      }
    }
  }
  function closeNotifications() {
    clearTimeout(notificationTimer); clearTimeout(notificationHandshake);
    const old = notificationSocket; notificationSocket = null;
    if (old) { old.onopen = old.onmessage = old.onerror = old.onclose = null; old.close(); }
  }
  function scheduleNotifications(immediate = false) {
    if (disposed || notificationPaused || !notificationsUrl || notificationSocket) return;
    clearTimeout(notificationTimer);
    notificationTimer = window.setTimeout(connectNotifications, immediate ? 0 : notificationDelay(notificationAttempt++));
  }
  function reconnectNotifications() {
    closeNotifications(); scheduleNotifications();
  }
  function connectNotifications() {
    if (disposed || notificationPaused || !notificationsUrl || notificationSocket) return;
    try {
      const url = new URL(notificationsUrl, window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const connection = options.socketFactory ? options.socketFactory(url.href) : new WebSocket(url.href) as LessonSocket;
      notificationSocket = connection; lastNotificationAt = now();
      const valid = () => !disposed && notificationSocket === connection;
      notificationHandshake = window.setTimeout(() => { if (valid()) reconnectNotifications(); }, 15000);
      connection.onopen = () => {
        if (!valid()) return;
        try { connection.send(JSON.stringify({ type: 'subscribe', expectedUid: config.uid })); }
        catch { reconnectNotifications(); }
      };
      connection.onmessage = event => {
        if (!valid() || typeof event.data !== 'string' || event.data.length > 8192) return;
        let message: any; try { message = JSON.parse(event.data); } catch { return; }
        if (message.uid !== undefined && message.uid !== config.uid) { dispose(); return; }
        if (message.type === 'error') {
          if (['FORBIDDEN', 'LOGIN_REVOKED'].includes(message.code)) { notificationPaused = true; closeNotifications(); }
          else reconnectNotifications();
          return;
        }
        if (!['ready', 'changed', 'pulse'].includes(message.type) || message.uid !== config.uid) return;
        lastNotificationAt = now();
        if (message.type === 'ready') { clearTimeout(notificationHandshake); notificationAttempt = 0; }
        if (message.type === 'ready' || message.type === 'changed') {
          inboxRevision++; void refreshInbox();
          if (dialog.open) void refresh();
        }
      };
      connection.onerror = connection.onclose = () => { if (valid()) reconnectNotifications(); };
    } catch { notificationSocket = null; scheduleNotifications(); }
  }
  function relevant() {
    return (inboxReady ? inboxLessons : lessons)
      .filter(lesson => lesson.status === 'active' || (lesson.status === 'scheduled' && +new Date(lesson.endAt) > timestamp()))
      .sort((a, b) => Number(b.status === 'active') - Number(a.status === 'active')
        || (a.status === 'active' ? +new Date(b.startAt) - +new Date(a.startAt) : +new Date(a.startAt) - +new Date(b.startAt)));
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
    const meta = doc.createElement('span'); meta.textContent = `${timeText(lesson.startAt)} · ${config.uid === lesson.teacherUid ? lesson.studentName : lesson.teacherName}${lesson.domainName ? ` · ${lesson.domainName}` : ''}`;
    copy.append(name, meta);
    const joinButton = doc.createElement('button'); joinButton.type = 'button'; joinButton.className = 'lesson-button is-primary';
    joinButton.textContent = active?._id === lesson._id ? '已在课堂中' : '点击上课'; joinButton.dataset.lessonJoin = lesson._id;
    joinButton.disabled = !!active || joining || (lesson.teacherUid !== config.uid && !lessonIsDue(lesson, timestamp()));
    if (joinButton.disabled && !active && !joining) joinButton.title = '到上课时间后可以进入';
    row.append(copy, joinButton);
    if (lesson.teacherUid === config.uid && !active && lesson.status === 'scheduled') {
      const cancelButton = doc.createElement('button'); cancelButton.type = 'button'; cancelButton.className = 'lesson-text-button';
      cancelButton.textContent = '取消'; cancelButton.dataset.lessonCancel = lesson._id; cancelButton.disabled = busy; row.append(cancelButton);
    }
    return row;
  }
  function lessonApiUrl(lesson: Lesson) {
    if (lesson.apiUrl) return safeRoute(lesson.apiUrl, 'lesson');
    const current = new URL(config.apiUrl, window.location.href).pathname;
    const currentDomain = current.match(/^\/d\/([^/]+)\/lesson$/)?.[1] || 'system';
    return currentDomain === encodeURIComponent(lesson.domainId) ? safeRoute(config.apiUrl, 'lesson') : null;
  }
  function historyEntry(lesson: Lesson) {
    const row = el('article', 'lesson-history-item'); row.dataset.lessonHistoryId = lesson._id;
    const copy = el('div', 'lesson-history-item__copy');
    copy.append(el('strong', '', lesson.title || '一对一课堂'));
    copy.append(el('span', '', `${historyTimeText(lesson.startAt)} — ${historyTimeText(lesson.endAt)}（北京时间）`));
    copy.append(el('span', '', `${lesson.studentName} · ${lesson.domainName || lesson.domainId}`));
    const open = ['scheduled', 'active'].includes(lesson.status);
    const status = lesson.status === 'ended' ? '已结束' : lesson.status === 'cancelled' ? '已取消'
      : lesson.status === 'scheduled' && +new Date(lesson.startAt) > timestamp() ? '已预约'
      : lesson.status === 'active' && (active?._id === lesson._id || (lesson.teacherJoined && lesson.studentJoined))
        ? '进行中' : '未结束';
    const badge = el('span', `lesson-history-status${open ? ' is-open' : ''}`, status);
    if (open && +new Date(lesson.endAt) <= timestamp()) copy.append(el('small', '', '已过计划时间，老师尚未下课'));
    const actions = el('div', 'lesson-history-item__actions'); actions.append(badge);
    if (open && lesson.teacherUid === config.uid) {
      const continueButton = button(active?._id === lesson._id ? '当前课堂' : '继续上课', 'lesson-button is-primary', () => { void join(lesson); });
      continueButton.dataset.lessonJoin = lesson._id;
      continueButton.disabled = busy || joining || !!active || !lessonApiUrl(lesson);
      if (lesson.status === 'scheduled' && +new Date(lesson.endAt) + 2 * 3600000 < timestamp()) {
        continueButton.textContent = '预约已过期'; continueButton.disabled = true;
        continueButton.title = '预约已过期，可结束这节课程。';
      }
      const endButton = button('结束课程', 'lesson-button is-danger', () => { void endHistorical(lesson); });
      endButton.dataset.lessonEnd = lesson._id; endButton.disabled = busy || joining || !lessonApiUrl(lesson);
      actions.append(continueButton, endButton);
    }
    row.append(copy, actions); return row;
  }
  function renderSchedules() {
    scheduleList.replaceChildren();
    const items = relevant().filter(lesson => !config.canTeach || lesson._id === active?._id
      || (lesson.status === 'scheduled' && +new Date(lesson.endAt) > timestamp()));
    for (const lesson of items) scheduleList.append(lessonEntry(lesson));
    if (!items.length) scheduleList.append(el('p', 'lesson-empty', '还没有安排课程，选好学员就可以开始。'));
    historical.hidden = !config.canTeach;
    historyList.replaceChildren();
    if (!historical.hidden) {
      const arrangedIds = new Set(items.map(lesson => lesson._id));
      const historicalItems = history.filter(lesson => lesson.teacherUid === config.uid && !arrangedIds.has(lesson._id))
        .sort((a, b) => Number(['scheduled', 'active'].includes(b.status)) - Number(['scheduled', 'active'].includes(a.status))
          || +new Date(b.startAt) - +new Date(a.startAt));
      for (const lesson of historicalItems) historyList.append(historyEntry(lesson));
      if (!historicalItems.length) historyList.append(el('p', 'lesson-empty', '还没有历史课程。'));
      historyNote.hidden = !historyHasMore;
      historyNote.textContent = '已显示最近 100 条结束记录，未结束课程全部显示。';
    }
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
    currentMode = value; rememberActive(); renderActive();
    if (peerOnline && socketReady) { sharedLesson = active._id; requestSharing(); }
  }
  function updateSharing(restart = false) {
    const shouldShare = active?.teacherUid === config.uid && socketReady && peerOnline;
    if (shouldShare && (restart || sharedLesson !== active!._id)) {
      sharedLesson = active!._id;
      requestSharing();
    }
  }
  function scheduleSharingRecovery() {
    clearTimeout(shareRetryTimer);
    if (disposed || !active || active.teacherUid !== config.uid) return;
    const id = active._id;
    shareRetryTimer = window.setTimeout(() => {
      if (!disposed && active?._id === id && peerOnline && socketReady) updateSharing(true);
    }, Math.min(15000, 1000 * 2 ** Math.min(shareRetryAttempt++, 4)));
  }
  function stopSharing(clearAnnotations = false) {
    clearTimeout(shareRetryTimer); shareRetryAttempt = 0;
    if (!sharedLesson) return;
    const lessonId = sharedLesson; sharedLesson = '';
    shareState.hidden = true; retryShare.hidden = true;
    window.dispatchEvent(new CustomEvent('onebyone:lesson-share-stop', { detail: { lessonId, clearAnnotations } }));
  }
  function snooze() {
    if (reminderLesson) dismissed.set(reminderLesson._id, timestamp() + 5 * 60000);
    reminder.close(); reminderLesson = null;
  }
  function updateReminder() {
    if (disposed) return;
    const invitations = relevant().filter(item => item.studentUid === config.uid && item._id !== active?._id
      && lessonIsDue(item, timestamp()) && (dismissed.get(item._id) || 0) <= timestamp());
    invitationNotice.hidden = !active || !invitations.length;
    const signature = invitationNotice.hidden ? '' : JSON.stringify([active?._id, joining,
      invitations.map(item => [item._id, item.title, item.teacherName, item.domainName, item.startAt])]);
    if (signature !== invitationSignature) {
      invitationSignature = signature; invitationNotice.replaceChildren();
      if (!invitationNotice.hidden) {
        invitationNotice.append(el('strong', '', '收到新的上课邀请'), el('p', '', '离开当前课堂后，可以进入以下课堂。'));
        for (const invitation of invitations) invitationNotice.append(lessonEntry(invitation));
      }
    }
    if (active || joining || busy || dialog.open) return;
    const lesson = invitations[0];
    if (!lesson) { if (reminder.open) reminder.close(); reminderLesson = null; return; }
    reminderLesson = lesson;
    reminderHeading.textContent = lesson.teacherJoined ? '老师邀请你上课' : '上课时间到了';
    reminderName.textContent = `${lesson.teacherName} · ${lesson.title || '一对一课堂'}`;
    reminderTime.textContent = `${timeText(lesson.startAt)}（北京时间）${lesson.domainName ? ` · ${lesson.domainName}` : ''}`;
    enter.disabled = joining; enter.textContent = joining ? '正在进入…' : '点击上课';
    if (!reminder.open) { reminderError.hidden = true; reminder.showModal(); }
  }
  function replaceLesson(lesson: Lesson) {
    dataRevision++; inboxRevision++;
    const inboxIndex = inboxLessons.findIndex(item => item._id === lesson._id);
    if (inboxIndex >= 0) inboxLessons[inboxIndex] = { ...inboxLessons[inboxIndex], ...lesson };
    else if ([lesson.teacherUid, lesson.studentUid].includes(config.uid)) {
      const apiUrl = lessonApiUrl(lesson);
      if (apiUrl) inboxLessons.push({ ...lesson, apiUrl, socketUrl: `${apiUrl}/conn` });
    }
    const index = lessons.findIndex(item => item._id === lesson._id);
    if (index >= 0) lessons[index] = lesson; else lessons.push(lesson);
    const historyIndex = history.findIndex(item => item._id === lesson._id);
    if (historyIndex >= 0) history[historyIndex] = { ...history[historyIndex], ...lesson };
    else if (lesson.teacherUid === config.uid) history.push({ ...lesson,
      apiUrl: lesson.apiUrl || (lesson.domainId === (config.apiUrl.match(/^\/d\/([^/]+)\/lesson$/)?.[1] || 'system') ? config.apiUrl : undefined) });
    if (reminderLesson?._id === lesson._id && !['scheduled', 'active'].includes(lesson.status)) {
      reminderLesson = null; if (reminder.open) reminder.close();
    }
    if (active?._id === lesson._id) {
      if (!['scheduled', 'active'].includes(lesson.status)) {
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
      history = Array.isArray(result.history) ? result.history : [];
      historyHasMore = !!result.historyHasMore;
      students = Array.isArray(result.students) ? result.students : [];
      const serverNow = +new Date(result.serverNow);
      if (Number.isFinite(serverNow)) skew = serverNow - (startedAt + now()) / 2;
      if (active) {
        const item = lessons.find(lesson => lesson._id === active!._id);
        if (item && !['scheduled', 'active'].includes(item.status)) stopActive('课堂已结束');
        else if (item) { active = item; renderActive(); updateSharing(); }
        if (!socket && !recoveryPaused) void recover();
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
    clearTimeout(reconnectTimer); clearTimeout(handshakeTimer); socketReady = false; peerOnline = false;
    const old = socket; socket = null;
    if (old) { old.onclose = old.onerror = old.onmessage = old.onopen = null; old.close(); }
  }
  function prepareDesktop() {
    const reservation = media.prepareDesktop();
    if (reservation) pendingDesktop.add(reservation);
    return reservation;
  }
  function cancelPendingDesktop() {
    for (const reservation of pendingDesktop) media.cancelDesktop(reservation);
    pendingDesktop.clear();
  }
  function stopActive(message = '', clearHint = true, clearAnnotations = clearHint) {
    generation++; dataRevision++; active = null; joining = false; reconnectAttempt = 0;
    recoveryQueued = false;
    if (clearHint) writeHint(null);
    cancelPendingDesktop();
    closeSocket(); stopSharing(clearAnnotations); media.stop(); lessonBar.hidden = true;
    if (message) showMessage(message);
    renderRoster(); renderSchedules();
    applyPageScope();
  }
  function scheduleRecovery(immediate = false) {
    if (disposed || recoveryPaused) return;
    clearTimeout(reconnectTimer);
    const delay = immediate ? 0 : Math.max(document.hidden ? 15000 : 0,
      Math.min(15000, 750 * 2 ** Math.min(reconnectAttempt++, 5)) * (.85 + Math.random() * .3));
    reconnectTimer = window.setTimeout(() => { void recover(); }, delay);
  }
  async function recover() {
    if (disposed || recoveryPaused || socket) return;
    if (recovering || busy || joining) { recoveryQueued = true; return; }
    recoveryQueued = false;
    recovering = true;
    const version = generation;
    const revision = dataRevision;
    try {
      const hint = readHint();
      if (hint?.pending) {
        try {
          const result = await api({ operation: hint.pending, lessonId: hint.lessonId }, hint.apiUrl, hint.tabId || tabId);
          if (disposed || version !== generation) return;
          if (result.lesson) replaceLesson(result.lesson);
        } catch (cause) {
          if (!['ENDED', 'NOT_FOUND'].includes(errorCode(cause))) throw cause;
        }
        if (!disposed && version === generation) clearHintIfMatches(hint);
        return;
      }
      const resumeUrl = safeRoute(config.resumeUrl || `${config.apiUrl}/resume`, 'lesson/resume');
      if (!resumeUrl) throw new Error('课堂恢复地址无效。');
      const startedAt = now();
      const result = await api({ expectedUid: config.uid }, resumeUrl);
      if (disposed || recoveryPaused || version !== generation) return;
      if (revision !== dataRevision) { recoveryQueued = true; return; }
      if (result.uid !== config.uid) { dispose(); return; }
      if (!result.lesson) {
        if (active) stopActive('课堂已结束'); else writeHint(null);
        return;
      }
      const lesson: Lesson = result.lesson;
      const apiUrl = safeRoute(result.apiUrl, 'lesson');
      const socketUrl = safeRoute(result.socketUrl, 'lesson/conn');
      if (!apiUrl || !socketUrl || !/^[a-zA-Z0-9_-]{8,96}$/.test(lesson._id)
        || ![lesson.teacherUid, lesson.studentUid].includes(config.uid) || lesson.status !== 'active'
        || socketUrl !== `${apiUrl}/conn`) throw new Error('课堂恢复信息无效。');
      const serverNow = +new Date(result.serverNow);
      if (Number.isFinite(serverNow)) skew = serverNow - (startedAt + now()) / 2;
      const sameLesson = active?._id === lesson._id;
      if (active && !sameLesson) stopActive('', false);
      if (config.apiUrl !== apiUrl) { scopeGeneration++; lessons = []; students = []; }
      config = { ...config, apiUrl, socketUrl, canTeach: lesson.teacherUid === config.uid };
      if (!sameLesson) currentMode = hint?.lessonId === lesson._id ? hint.mode : 'broadcast';
      replaceLesson(lesson);
      if (sameLesson) { active = lesson; rememberActive(); renderActive(); connect(); }
      else await enterLesson(lesson);
      reconnectAttempt = 0;
    } catch (cause) {
      if (disposed || version !== generation || recoveryPaused) return;
      if (revision !== dataRevision) { recoveryQueued = true; return; }
      if (['FORBIDDEN', 'LOGIN_REVOKED', 'REPLACED'].includes(errorCode(cause)) || [401, 403].includes((cause as any)?.status)) {
        recoveryPaused = true; stopActive(errorText(cause), false);
      } else { renderActive('连接中断，正在自动续课…'); scheduleRecovery(); }
    } finally {
      recovering = false;
      if (recoveryQueued && !disposed && !recoveryPaused && !socket && !busy && !joining) {
        recoveryQueued = false; scheduleRecovery();
      }
    }
  }
  function reconnect() {
    if (!active || disposed || recoveryPaused) return;
    closeSocket(); media.setConnected(false); renderActive('连接中断，正在自动续课…');
    scheduleRecovery();
  }
  function connect() {
    if (!active || disposed || socket || recoveryPaused) return;
    const lessonId = active._id;
    const url = new URL(config.socketUrl, window.location.href); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      const connection = options.socketFactory ? options.socketFactory(url.href) : new WebSocket(url.href);
      socket = connection;
      const valid = () => !disposed && socket === connection && active?._id === lessonId;
      handshakeTimer = window.setTimeout(() => { if (valid() && !socketReady) reconnect(); }, 15000);
      connection.onopen = () => { if (valid()) connection.send(JSON.stringify({ type: 'join', lessonId, tabId })); };
      connection.onmessage = event => {
        if (!valid()) return;
        let message: any;
        try { message = JSON.parse(event.data); } catch { return; }
        if (!message || typeof message !== 'object') return;
        lastServerMessageAt = now();
        if (message.type === 'ready') {
          if (message.lesson?._id !== lessonId) return;
          clearTimeout(handshakeTimer);
          recoveryQueued = false;
          socketReady = true; peerOnline = !!message.peerOnline; reconnectAttempt = 0;
          media.setConnected(true); media.receive({ type: 'peer', online: peerOnline, streamId: message.peerStreamId });
          replaceLesson(message.lesson); renderActive(); updateSharing(true);
        } else if (message.type === 'lesson' && message.lesson?._id === lessonId) replaceLesson(message.lesson);
        else if (message.type === 'ended' && (!message.lessonId || message.lessonId === lessonId)) {
          stopActive(message.reason || '课堂已结束'); void refresh();
        } else if (message.type === 'error') {
          if (message.code === 'REPLACED') {
            recoveryPaused = true; stopActive(message.message || '课堂已在另一个页面恢复。', false);
          } else if (/^(FORBIDDEN|LOGIN_REVOKED)$/.test(message.code || '')) {
            recoveryPaused = true; stopActive(message.message || '课堂权限已失效。', false);
          } else if (/^(ENDED|NOT_FOUND)$/.test(message.code || '')) {
            stopActive(message.message || '课堂已结束'); void refresh();
          } else if (/^(NOT_JOINED|JOIN_REQUIRED|OFFLINE|UNAVAILABLE|RATE_LIMIT|TOO_EARLY)$/.test(message.code || '')) reconnect();
          else { showMessage(message.message || '课堂连接暂时不可用'); renderActive(message.message); }
        } else {
          media.receive(message);
          if (message.type === 'peer') {
            peerOnline = !!message.online; updateSharing(peerOnline);
            renderActive(message.online ? '正在上课' : '对方暂时离开，等待重新加入…');
          }
        }
      };
      const disconnected = () => {
        if (!valid()) return;
        reconnect();
      };
      connection.onclose = disconnected; connection.onerror = disconnected;
    } catch {
      reconnect();
    }
  }
  async function enterLesson(lesson: Lesson, desktop?: LessonDesktopReservation) {
    if (disposed) return false;
    dataRevision++;
    recoveryPaused = false;
    active = lesson; reminderLesson = null;
    rememberActive();
    if (reminder.open) reminder.close(); if (dialog.open) dialog.close();
    renderActive(); renderSchedules();
    // This follows either an explicit join or a server-confirmed recovery of it.
    void media.start(lesson, desktop).catch(cause => { if (active?._id === lesson._id) showMessage(errorText(cause)); });
    connect();
    return true;
  }
  async function join(lesson: Lesson) {
    if (joining || active || busy || disposed) return;
    if (readHint()?.pending) { showMessage('正在同步上次离开课堂的操作，网络恢复后可继续。'); return; }
    if (lesson.teacherUid !== config.uid && !lessonIsDue(lesson, timestamp())) { showMessage('还没到上课时间。'); return; }
    const targetApiUrl = lessonApiUrl(lesson);
    if (!targetApiUrl) { showMessage('这节课的上课地址无效，请刷新课程列表。'); return; }
    dataRevision++;
    recoveryPaused = false;
    joining = true; enter.disabled = true; enter.textContent = '正在进入…';
    reminderError.hidden = true; renderSchedules();
    const version = generation;
    const desktop = prepareDesktop();
    let transferred = false;
    try {
      const result = await api({ operation: 'join', lessonId: lesson._id }, targetApiUrl);
      if (disposed || version !== generation || !result.lesson) return;
      if (config.apiUrl !== targetApiUrl) {
        scopeGeneration++; lessons = []; students = [];
        config = { ...config, apiUrl: targetApiUrl, socketUrl: `${targetApiUrl}/conn`, canTeach: result.lesson.teacherUid === config.uid };
      }
      replaceLesson(result.lesson); transferred = await enterLesson(result.lesson, desktop);
    } catch (cause) {
      if (disposed) return;
      const text = errorText(cause); showMessage(text);
      reminderError.textContent = text; reminderError.hidden = false;
    } finally {
      if (desktop) { pendingDesktop.delete(desktop); if (!transferred) media.cancelDesktop(desktop); }
      joining = false; enter.disabled = false; enter.textContent = '点击上课';
      if (!disposed) { renderSchedules(); applyPageScope(); }
      if (recoveryQueued && !active && !socket) scheduleRecovery();
    }
  }
  async function create() {
    if (busy || active || !selection || disposed) return;
    if (readHint()?.pending) { showMessage('正在同步上次离开课堂的操作，网络恢复后可继续。'); return; }
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
    recoveryPaused = false;
    busy = true; close.disabled = true; immediate.disabled = reserve.disabled = true; renderRoster();
    const version = generation;
    const desktop = booking ? undefined : prepareDesktop();
    let transferred = false;
    try {
      const result = await api({ operation: 'create', studentUid: selection, ...(startAt ? { startAt } : {}),
        durationMinutes: Number(duration.value), title: lessonTitle.value.trim() || '一对一课堂' });
      if (disposed || generation !== version || !result.lesson) return;
      replaceLesson(result.lesson);
      if (booking) { dialog.close(); showMessage(`已预约 ${timeText(result.lesson.startAt)}，到时提醒学员上课。`); }
      else transferred = await enterLesson(result.lesson, desktop);
    } catch (cause) {
      if (!disposed) { formError.textContent = errorText(cause); formError.hidden = false; }
    } finally {
      if (desktop) { pendingDesktop.delete(desktop); if (!transferred) media.cancelDesktop(desktop); }
      busy = false; close.disabled = false; immediate.disabled = reserve.disabled = false;
      if (!disposed) { renderRoster(); renderSchedules(); applyPageScope(); }
      if (recoveryQueued && !active && !socket) scheduleRecovery();
    }
  }
  async function leaveLesson(ending: boolean, confirmed = false) {
    if (!active || busy) return;
    const lesson = active;
    if (!confirmed && !confirmLessonExit(ending ? 'end' : 'leave', lesson)) return;
    const apiUrl = config.apiUrl;
    dataRevision++;
    busy = true;
    dismissed.set(lesson._id, timestamp() + 5 * 60000);
    const pendingAction: RecoveryHint = { lessonId: lesson._id, apiUrl, socketUrl: config.socketUrl, mode: currentMode,
      pending: ending ? 'end' : 'leave', tabId };
    writeHint(pendingAction);
    // Release devices immediately even when the server is unreachable.
    stopActive('', false, ending);
    try {
      const result = await api({ operation: ending ? 'end' : 'leave', lessonId: lesson._id }, apiUrl);
      if (result.lesson && !disposed) replaceLesson(result.lesson);
      clearHintIfMatches(pendingAction);
    } catch (cause) {
      if (['ENDED', 'NOT_FOUND'].includes(errorCode(cause))) clearHintIfMatches(pendingAction);
      else if (!disposed) { showMessage(ending ? '已停止上课；网络恢复后会同步下课。' : '已离开课堂；网络恢复后会同步。'); scheduleRecovery(); }
    }
    finally {
      busy = false; if (!disposed) { applyPageScope(); void refresh(); renderRoster(); renderSchedules(); }
      if (recoveryQueued && !active && !socket) scheduleRecovery();
    }
  }
  async function cancel(lessonId: string) {
    if (busy || active || disposed) return;
    const lesson = [...inboxLessons, ...lessons, ...history].find(item => item._id === lessonId);
    const apiUrl = lesson && lessonApiUrl(lesson);
    if (!apiUrl) { showMessage('这节课的上课地址无效，请刷新课程列表。'); return; }
    dataRevision++;
    busy = true; renderSchedules();
    try { const result = await api({ operation: 'cancel', lessonId }, apiUrl); if (!disposed && result.lesson) replaceLesson(result.lesson); }
    catch (cause) { showMessage(errorText(cause)); }
    finally {
      busy = false; if (!disposed) { renderSchedules(); void refresh(); }
      if (recoveryQueued && !active && !socket) scheduleRecovery();
    }
  }
  async function endHistorical(lesson: Lesson) {
    if (disposed || busy || joining || lesson.teacherUid !== config.uid || !['scheduled', 'active'].includes(lesson.status)) return;
    if (active?._id === lesson._id) { await leaveLesson(true); return; }
    if (!confirmLessonExit('end', lesson)) return;
    const targetApiUrl = lessonApiUrl(lesson);
    if (!targetApiUrl) { historyError.textContent = '课程地址无效，请刷新列表后重试。'; historyError.hidden = false; return; }
    dataRevision++; busy = true; historyError.hidden = true; renderSchedules(); renderActive();
    try {
      const result = await api({ operation: 'end', lessonId: lesson._id }, targetApiUrl);
      if (disposed) return;
      if (!result.lesson || result.lesson._id !== lesson._id || result.lesson.teacherUid !== config.uid) throw new Error('课程结束状态未能确认，请刷新后重试。');
      replaceLesson(result.lesson);
      showMessage('课程已结束，学员不会再收到这节课的上课提醒。');
    } catch (cause) {
      if (!disposed) { historyError.textContent = `未能结束课程：${errorText(cause)}`; historyError.hidden = false; }
    } finally {
      busy = false;
      if (!disposed) { renderSchedules(); renderActive(); applyPageScope(); void refresh(); }
      if (recoveryQueued && !active && !socket) scheduleRecovery();
    }
  }
  function open() {
    if (!config.canTeach || disposed) return;
    document.querySelector<HTMLButtonElement>('[data-assistant-close]')?.click();
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
    if (target.dataset.lessonJoin) { const lesson = [...inboxLessons, ...lessons, ...history].find(item => item._id === target.dataset.lessonJoin); if (lesson) { event.preventDefault(); void join(lesson); } }
    if (target.dataset.lessonCancel) { event.preventDefault(); void cancel(target.dataset.lessonCancel); }
  }
  function attachContent(page: Window) {
    try {
      if (page.location.origin !== window.location.origin) return;
      const next = page.document;
      if (contentDocument !== next) {
        clearHomeCards(); contentRelease?.(); contentDocument = next;
        if (next !== document) {
          next.addEventListener('click', action); next.addEventListener('click', guardExitLink, true); next.addEventListener('submit', guardExitSubmit, true);
          contentRelease = () => { next.removeEventListener('click', action); next.removeEventListener('click', guardExitLink, true); next.removeEventListener('submit', guardExitSubmit, true); };
        }
        else contentRelease = undefined;
      }
      renderHomeCards();
    } catch { /* A stale or external content frame cannot own schedule controls. */ }
  }
  function applyPageScope() {
    if (disposed || active || busy || joining || (config.apiUrl === pageConfig.apiUrl
      && config.socketUrl === pageConfig.socketUrl && config.canTeach === pageConfig.canTeach)) return;
    config = { ...pageConfig }; scopeGeneration++; selection = 0; lessons = []; history = []; historyHasMore = false; students = []; skew = 0;
    currentMode = 'broadcast'; reminderLesson = null;
    if (reminder.open) reminder.close();
    renderRoster(); renderSchedules(); updateReminder(); void refresh();
  }
  on(document, 'click', action);
  document.addEventListener('click', guardExitLink, true); document.addEventListener('submit', guardExitSubmit, true);
  disposers.push(() => { document.removeEventListener('click', guardExitLink, true); document.removeEventListener('submit', guardExitSubmit, true); });
  on(window, 'onebyone:lesson-before-exit', event => {
    if (!confirmNavigation((event as CustomEvent).detail?.reason || '')) event.preventDefault();
  });
  on(window, 'onebyone:lesson-exit-failed', () => { allowNavigationUntil = 0; });
  on(window, 'beforeunload', event => {
    if (!active || disposed) return;
    if (allowNavigationUntil > now()) { allowNavigationUntil = 0; return; }
    event.preventDefault(); (event as BeforeUnloadEvent).returnValue = '';
  });
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
    updateSharing(true);
  });
  on(window, 'onebyone:lesson-share-ready', () => updateSharing(true));
  on(window, 'onebyone:lesson-share-state', event => {
    const detail = (event as CustomEvent).detail;
    if (!active || detail?.lessonId !== active._id || active.teacherUid !== config.uid) return;
    if (detail.mode === 'broadcast' || detail.mode === 'assist') { currentMode = detail.mode; rememberActive(); }
    renderActive();
    shareState.hidden = false;
    shareState.textContent = detail.message || ({ pending: '正在准备分享画面…', active: '画面已分享', error: '分享暂时未能开始', ended: '分享已结束' } as Record<string, string>)[detail.state] || '';
    retryShare.hidden = !['error', 'ended'].includes(detail.state);
    if (['error', 'ended'].includes(detail.state)) scheduleSharingRecovery();
    else if (detail.state === 'active') { clearTimeout(shareRetryTimer); shareRetryAttempt = 0; }
  });
  const wake = () => {
    if (disposed) return;
    if (notificationSocket && now() - lastNotificationAt > 60000) reconnectNotifications();
    else if (!notificationSocket) scheduleNotifications(true);
    void refreshInbox();
    if (recoveryPaused) return;
    if (socketReady && now() - lastServerMessageAt > 30000) reconnect();
    else if (!socket) scheduleRecovery(true);
    void refresh(); updateReminder();
  };
  on(document, 'visibilitychange', () => { if (!document.hidden) wake(); });
  on(window, 'online', wake);
  on(window, 'storage', event => {
    if ((event as StorageEvent).key !== recoveryKey || disposed) return;
    if (hintStorageFailed && memoryHint?.pending) return;
    hintStorageFailed = false;
    memoryHint = null;
    const hint = readHint();
    if (hint?.pending && active?._id === hint.lessonId) { stopActive('', false, hint.pending === 'end'); scheduleRecovery(true); }
  });
  const pulse = window.setInterval(() => {
    if (notificationSocket?.readyState === 1) {
      if (now() - lastNotificationAt > (document.hidden ? 120000 : 60000)) reconnectNotifications();
      else if (now() - lastNotificationAt >= 20000) {
        try { notificationSocket.send(JSON.stringify({ type: 'pulse' })); } catch { reconnectNotifications(); }
      }
    }
    if (!socketReady) return;
    if (now() - lastServerMessageAt > (document.hidden ? 120000 : 30000)) reconnect();
    else send({ type: 'pulse' });
  }, 5000);
  const clock = window.setInterval(() => {
    renderHomeCards(); updateReminder();
  }, 1000);
  function dispose() {
    if (disposed) return;
    disposed = true; generation++; cancelPendingDesktop(); closeSocket(); closeNotifications(); clearTimeout(shareRetryTimer); media.dispose();
    clearTimeout(inboxTimer); clearTimeout(pollTimer); clearTimeout(messageTimer); clearInterval(pulse); clearInterval(clock);
    fetches.forEach(abort => abort.abort()); fetches.clear();
    disposers.forEach(remove => remove()); contentRelease?.(); clearHomeCards();
    if (dialog.open) dialog.close(); if (reminder.open) reminder.close();
    dialog.remove(); reminder.remove(); invitationNotice.remove(); lessonBar.remove(); toast.remove(); installed = undefined;
  }
  on(window, 'onebyone:session-ended', dispose);
  on(window, 'pagehide', () => {
    dispose();
    window.addEventListener('pageshow', event => {
      if ((event as PageTransitionEvent).persisted) installLesson(pageConfig, options);
    }, { once: true });
  });
  setBooking(false); renderRoster();
  const currentPage = (window as any).__onebyonePlatformShell?.contentWindow(); if (currentPage) attachContent(currentPage);
  installed = dispose; void refresh(); void recover(); void refreshInbox(); connectNotifications();
  return dispose;
}
