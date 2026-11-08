import { VoiceTransport } from './transport';
import { mountVoiceCallWindow } from './window';
import { createCallRinger } from './ringtone';
import { positionVoiceOverlays } from './position';

interface VoiceConfig { enabled: boolean; uid: number; canTeach: boolean; socketUrl: string; windowUrl?: string }
interface Student { uid: number; name: string; online: boolean; busy?: boolean }
interface Call {
  callId: string; status: 'ringing' | 'active'; teacherUid: number; teacherName: string;
  studentUid: number; studentName: string; acceptedAt?: string | number; isOwner?: boolean;
}
interface Transport { start(): void; send(data: any): boolean; dispose(): void; readonly ready: boolean }
let installed: (() => void) | undefined;

const phoneSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 2a14 14 0 0 1-7-7l2-2-2-5Z"/></svg>';
const closeSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg>';

export function installVoiceCall(config: VoiceConfig, options: {
  transportFactory?: (config: VoiceConfig, handlers: any) => Transport;
  controllerFactory?: typeof mountVoiceCallWindow;
} = {}) {
  if (installed || !config?.enabled || !config.uid || window.top !== window) return installed;
  let disposed = false;
  let connected = false;
  let students: Student[] = [];
  let call: Call | null = null;
  let pendingStudent = 0;
  let accepting = false;
  let mediaShown = false;
  let messageTimer = 0;
  let rosterTimer = 0;
  let titleBeforeRing: string | null = null;
  const disposers: (() => void)[] = [];
  const ringer = createCallRinger();
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text = '') => {
    const node = document.createElement(tag); node.className = cls; node.textContent = text; return node;
  };
  const on = (target: EventTarget, event: string, fn: EventListener) => {
    target.addEventListener(event, fn); disposers.push(() => target.removeEventListener(event, fn));
  };
  const button = (label: string, cls: string, run: () => void) => {
    const node = el('button', cls, label); node.type = 'button'; on(node, 'click', run); return node;
  };
  const privateRoot = <T extends HTMLElement>(node: T): T => {
    node.setAttribute('data-live-share-private', ''); node.setAttribute('data-live-share-ui', ''); return node;
  };
  const picker = privateRoot(el('dialog', 'voice-call-picker'));
  picker.setAttribute('aria-labelledby', 'voice-call-picker-title');
  const header = el('header', 'voice-call-picker__header');
  const heading = el('div', 'voice-call-picker__heading');
  heading.append(el('span', 'voice-call-picker__eyebrow', '老师助手 · 随时聊一聊'));
  const title = el('h2', '', '拨给一位学员'); title.id = 'voice-call-picker-title'; heading.append(title);
  const close = button('', 'voice-call-picker__close', () => picker.close());
  close.setAttribute('aria-label', '关闭语音拨号'); close.innerHTML = closeSvg;
  header.append(heading, close);
  const intro = el('p', 'voice-call-picker__intro', '学员接听后就能说话，共享模式也可以同时使用。');
  const searchLabel = el('label', 'voice-call-picker__search');
  searchLabel.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>';
  const search = el('input', ''); search.type = 'search'; search.placeholder = '搜索学员姓名或 UID'; search.setAttribute('aria-label', '搜索学员'); search.autocomplete = 'off'; searchLabel.append(search);
  const listStatus = el('p', 'voice-call-picker__status', '正在连接…'); listStatus.setAttribute('role', 'status');
  const list = el('div', 'voice-call-picker__list'); list.setAttribute('aria-label', '可拨打学员');
  const error = el('p', 'voice-call-picker__error'); error.setAttribute('role', 'alert'); error.hidden = true;
  const foot = el('p', 'voice-call-picker__foot', '通话留在这里，切换平台页面也可以继续聊。');
  picker.append(header, intro, searchLabel, listStatus, list, error, foot);

  const card = privateRoot(el('aside', 'voice-call-card')); card.hidden = true;
  card.setAttribute('aria-label', '语音通话');
  const cardTop = el('div', 'voice-call-card__top');
  const icon = el('span', 'voice-call-card__icon'); icon.innerHTML = phoneSvg;
  const copy = el('div', 'voice-call-card__copy');
  const cardName = el('strong', 'voice-call-card__name');
  const cardStatus = el('span', 'voice-call-card__status'); cardStatus.setAttribute('role', 'status');
  copy.append(cardName, cardStatus); cardTop.append(icon, copy);
  const actions = el('div', 'voice-call-card__actions');
  const accept = button('接听', 'voice-call-card__button is-accept', () => { if (call) launch('accept', call.callId); });
  const reject = button('暂不接听', 'voice-call-card__button', () => { if (call) sendControl('reject'); });
  const hangup = button('挂断', 'voice-call-card__button is-hangup', () => sendControl('hangup'));
  actions.append(reject, accept, hangup);
  const cardError = el('p', 'voice-call-card__error'); cardError.hidden = true; cardError.setAttribute('role', 'alert');
  const notification = privateRoot(el('div', 'voice-call-toast')); notification.hidden = true; notification.setAttribute('role', 'status');
  card.append(cardTop, actions, cardError);
  const floating = privateRoot(el('aside', 'voice-call-floating')); floating.hidden = true;
  floating.setAttribute('aria-label', '当前语音通话');
  const floatingHeader = el('header', 'voice-call-floating__header');
  const floatingLabel = el('span', 'voice-call-floating__label', '语音通话');
  const collapse = button('收起', 'voice-call-floating__collapse', () => {
    const compact = floating.classList.toggle('is-compact');
    collapse.textContent = compact ? '展开' : '收起'; collapse.setAttribute('aria-expanded', String(!compact));
  });
  collapse.setAttribute('aria-expanded', 'true'); collapse.setAttribute('aria-label', '收起或展开通话详情');
  const compactHangup = button('挂断', 'voice-call-floating__hangup', () => {
    controller.hangup();
  });
  const compactMute = button('静音', 'voice-call-floating__mute', () => {
    mediaRoot.querySelector<HTMLButtonElement>('.voice-call-window__button:not(.is-danger)')?.click();
  });
  compactMute.setAttribute('aria-pressed', 'false');
  floatingHeader.append(floatingLabel, collapse, compactMute, compactHangup);
  const mediaRoot = el('div', 'voice-call-window');
  floating.append(floatingHeader, mediaRoot);
  document.body.append(picker, card, floating, notification);
  const releasePositioning = positionVoiceOverlays([card, floating]);

  function showError(text: string) {
    const node = picker.open ? error : cardError;
    node.textContent = text; node.hidden = false;
    if (!picker.open && !call) toast(text);
  }
  function toast(text: string) {
    window.clearTimeout(messageTimer); notification.textContent = text; notification.hidden = false;
    messageTimer = window.setTimeout(() => { notification.hidden = true; }, 5000);
  }
  function closePicker() {
    picker.close(); window.clearInterval(rosterTimer); rosterTimer = 0;
  }
  function launch(intent: 'dial' | 'accept', id: string | number) {
    error.hidden = true; cardError.hidden = true;
    if (!connected) { showError('语音连接正在恢复，请稍等一下。'); return; }
    if (intent === 'dial' && call) { focusCall(); return; }
    if (intent === 'dial') pendingStudent = Number(id); else accepting = true;
    ringer.setIncoming(false);
    mediaShown = true; floating.hidden = false; floating.classList.remove('is-compact');
    closePicker(); renderCard(); renderStudents();
    if (intent === 'dial') controller.dial(Number(id), students.find((student) => student.uid === Number(id))?.name);
    else controller.accept(String(id));
  }
  function focusCall() {
    if (call?.isOwner || mediaShown) {
      floating.hidden = false; floating.classList.remove('is-compact'); collapse.textContent = '收起'; collapse.setAttribute('aria-expanded', 'true');
      collapse.focus();
    } else { card.hidden = false; hangup.focus(); }
  }
  function sendControl(type: 'reject' | 'hangup') {
    ringer.setIncoming(false);
    if (!call || !transport.send({ type, callId: call.callId })) showError('连接正在恢复，请稍后再试。');
  }
  function renderStudents() {
    const query = search.value.trim().toLocaleLowerCase();
    const shown = students.filter((student) => !query || `${student.name} ${student.uid}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => Number(b.online && !b.busy) - Number(a.online && !a.busy) || a.name.localeCompare(b.name, 'zh'));
    list.replaceChildren();
    listStatus.textContent = !connected ? '正在连接语音服务…' : `${students.filter((student) => student.online && !student.busy).length} 位学员可以接听`;
    if (!shown.length) {
      list.append(el('div', 'voice-call-picker__empty', query ? '没有找到这位学员，换个名字试试。' : '学员进入平台后，就可以在这里拨打。'));
      return;
    }
    for (const student of shown) {
      const row = el('button', 'voice-call-student'); row.type = 'button'; row.dataset.voiceStudent = String(student.uid);
      row.disabled = !connected || !student.online || !!student.busy || !!call || !!pendingStudent;
      const avatar = el('span', 'voice-call-student__avatar', Array.from(student.name)[0] || '同');
      const text = el('span', 'voice-call-student__copy');
      const state = student.busy ? '正在通话' : student.online ? '在线 · 可以接听' : '暂时离线';
      text.append(el('strong', '', student.name), el('small', student.online ? 'is-online' : '', state));
      const action = el('span', 'voice-call-student__action');
      action.innerHTML = phoneSvg; action.append(document.createTextNode(student.uid === pendingStudent ? '连接中' : '拨打'));
      row.append(avatar, text, action); row.addEventListener('click', () => launch('dial', student.uid)); list.append(row);
    }
  }
  function renderCard() {
    card.hidden = !call || mediaShown;
    floating.hidden = !mediaShown;
    if (!call) {
      ringer.setIncoming(false);
      if (titleBeforeRing !== null) { document.title = titleBeforeRing; titleBeforeRing = null; }
      return;
    }
    const incoming = call.status === 'ringing' && call.studentUid === config.uid;
    ringer.setIncoming(incoming && !accepting && !mediaShown && connected);
    const name = call.teacherUid === config.uid ? call.studentName : call.teacherName;
    cardName.textContent = name;
    card.classList.toggle('is-incoming', incoming);
    accept.hidden = reject.hidden = !incoming;
    hangup.hidden = incoming;
    accept.disabled = reject.disabled = !connected || accepting;
    hangup.disabled = !connected;
    accept.textContent = accepting ? '正在接听…' : '接听';
    cardStatus.textContent = !connected ? '连接恢复中…' : incoming ? '邀请你语音通话' : '通话正在另一个页面进行';
    floatingLabel.textContent = `与 ${name} 语音通话`;
    if (incoming && titleBeforeRing === null) { titleBeforeRing = document.title; document.title = `语音来电 · ${name}`; }
    else if (!incoming && titleBeforeRing !== null) { document.title = titleBeforeRing; titleBeforeRing = null; }
  }
  function receive(message: any) {
    if (disposed || !message || typeof message !== 'object') return;
    if (controller.receive(message) === false) return;
    if (message.type === 'ready') {
      connected = true;
      if (picker.open) transport.send({ type: 'list' });
      renderCard(); renderStudents();
    } else if (message.type === 'students') {
      students = Array.isArray(message.students) ? message.students.filter((student: Student) => Number.isSafeInteger(student.uid) && typeof student.name === 'string') : [];
      renderStudents();
    } else if (message.type === 'snapshot') {
      const next = message.callId ? message : message.call;
      if (!next?.callId) { call = null; renderCard(); return; }
      if (next.teacherUid !== config.uid && next.studentUid !== config.uid) return;
      call = next; pendingStudent = 0; accepting = false; error.hidden = cardError.hidden = true;
      mediaShown = !!next.isOwner; renderCard(); renderStudents();
      if (picker.open) closePicker();
    } else if (message.type === 'ended' || message.type === 'terminated') {
      if (message.type === 'ended' && call && message.callId !== call.callId) return;
      call = null; pendingStudent = 0; accepting = false; mediaShown = false;
      renderCard(); renderStudents();
      const reason: Record<string, string> = { rejected: '对方暂时不方便接听', declined: '对方暂时不方便接听', timeout: '暂时无人接听，稍后再试', no_answer: '暂时无人接听，稍后再试', disconnected: '语音连接已断开', hangup: '通话已结束', ended: '通话已结束' };
      toast(reason[message.reason] || (typeof message.reason === 'string' && /[\u4e00-\u9fff]/.test(message.reason) ? message.reason : '通话已结束'));
    } else if (message.type === 'error') {
      pendingStudent = 0; accepting = false;
      showError(typeof message.message === 'string' ? message.message : '暂时无法连接，请稍后重试。');
      renderCard(); renderStudents();
    }
  }
  const handlers = { mediaOwner: true, onMessage: receive, onConnection(value: boolean) {
    connected = value; if (!value) { pendingStudent = 0; accepting = false; }
    controller.setConnected(value);
    renderCard(); renderStudents();
  } };
  const transport = options.transportFactory ? options.transportFactory(config, handlers) : new VoiceTransport(config, handlers);
  const controller = (options.controllerFactory || mountVoiceCallWindow)(mediaRoot, config, { transport, onEnded() {
    mediaShown = false; call = null; pendingStudent = 0; accepting = false; renderCard(); renderStudents();
  } });
  const muteObserver = new MutationObserver(() => {
    const original = mediaRoot.querySelector<HTMLButtonElement>('.voice-call-window__button:not(.is-danger)');
    compactMute.disabled = !original || original.disabled;
    compactMute.textContent = original?.getAttribute('aria-pressed') === 'true' ? '取消静音' : '静音';
    compactMute.setAttribute('aria-pressed', original?.getAttribute('aria-pressed') || 'false');
  });
  muteObserver.observe(mediaRoot, { attributes: true, subtree: true, attributeFilter: ['aria-pressed', 'disabled'] });
  function openPicker() {
    if (call || mediaShown) { focusCall(); return; }
    document.querySelector<HTMLButtonElement>('[data-assistant-close]')?.click();
    error.hidden = true; search.value = ''; renderStudents();
    if (!picker.open) picker.showModal();
    search.focus(); transport.send({ type: 'list' });
    window.clearInterval(rosterTimer);
    rosterTimer = window.setInterval(() => { if (picker.open) transport.send({ type: 'list' }); }, 10000);
  }
  // The server-rendered assistant menu follows the current classroom. Delegate
  // its action so replacing that menu does not replace the call or microphone.
  on(document, 'click', ((event: MouseEvent) => {
    const opener = (event.target as Element)?.closest?.('[data-voice-call-open]');
    if (!opener || !config.canTeach) return;
    event.preventDefault(); openPicker();
  }) as EventListener);
  if (!config.canTeach) document.querySelectorAll<HTMLElement>('[data-voice-call-open]').forEach((opener) => { opener.hidden = true; });
  on(search, 'input', renderStudents);
  on(picker, 'close', () => { window.clearInterval(rosterTimer); rosterTimer = 0; });
  on(picker, 'click', ((event: MouseEvent) => {
    if (event.target !== picker) return;
    const rect = picker.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closePicker();
  }) as EventListener);
  const dispose = () => {
    if (disposed) return; disposed = true;
    window.clearInterval(rosterTimer); window.clearTimeout(messageTimer);
    for (const off of disposers) off(); releasePositioning(); ringer.dispose(); muteObserver.disconnect(); controller.dispose(); transport.dispose();
    picker.remove(); card.remove(); floating.remove(); notification.remove();
    if (titleBeforeRing !== null) document.title = titleBeforeRing;
    installed = undefined;
  };
  // Application pages navigate below this host. Only leaving the host, losing
  // the authenticated account, or hanging up releases the microphone.
  on(window, 'pagehide', dispose);
  on(window, 'onebyone:session-ended', dispose);
  const restore = (event: PageTransitionEvent) => {
    if (event.persisted) {
      window.removeEventListener('pageshow', restore);
      installVoiceCall(config, options);
    }
  };
  window.addEventListener('pageshow', restore);
  installed = dispose; transport.start(); return dispose;
}
