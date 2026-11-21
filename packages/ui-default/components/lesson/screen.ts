import { LessonCameraFlow } from './camera_flow';

export interface LessonScreenRoom { _id: string; teacherUid: number; studentUid: number }
export interface LessonEntryScreen {
  room: LessonScreenRoom;
  selection: Promise<MediaStream>;
  cancel(): void;
}
function selectMonitor() {
  if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) throw new Error('当前网页无法打开系统选屏窗口。请在电脑浏览器中通过 HTTPS 打开课堂。');
  return navigator.mediaDevices.getDisplayMedia({
    audio: false,
    video: { displaySurface: 'monitor', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 8 } },
    monitorTypeSurfaces: 'include',
  } as DisplayMediaStreamOptions);
}
export interface LessonScreenSnapshot {
  watching: boolean;
  requested: boolean;
  requestPending: boolean;
  sharing: boolean;
  starting: boolean;
  error: string;
  peerSharing: boolean;
  remoteSource: string | null;
  remoteAt: number;
  needsPageAuthorization: boolean;
  entryRetry: boolean;
  permissionHelp: boolean;
  statusText: string;
}
interface ScreenOptions {
  send(message: any): boolean;
  canSendPicture?(): boolean;
  preparePicture?(data: string): Promise<() => void>;
  onChange(): void;
}
type ScreenState = 'sharing' | 'stopped' | 'declined';

export const SCREEN_INTERVAL = 125;
const MAX_FRAME = 262144;
const BYTES_PER_SECOND = 1024 * 1024;
const TARGET_FRAME = Math.floor(BYTES_PER_SECOND / 8) - 256;
const screenProfiles = [
  { width: 960, height: 540, fps: 2, bytes: 6000 },
  { width: 1280, height: 720, fps: 4, bytes: 14000 },
  { width: 1280, height: 720, fps: 6, bytes: 36000 },
  { width: 1280, height: 720, fps: 8, bytes: TARGET_FRAME },
];
const STALE_MS = 1800;
const HEARTBEAT_MS = 2000;

/** Independent, live-only screen transport. A teacher request never opens a
 * device: only the learner's explicit click may invoke the browser picker. */
export function mountLessonScreen(config: { uid: number }, options: ScreenOptions) {
  const video = document.createElement('video');
  video.autoplay = true; video.muted = true; video.playsInline = true;
  const canvas = document.createElement('canvas');
  let context: CanvasRenderingContext2D | null = null;
  let current: LessonScreenRoom | null = null;
  let disposed = false;
  let generation = 0;
  let connected = false;
  let peerOnline = false;
  let peerStream = '';
  const retiredStreams = new Set<string>();
  let stream: MediaStream | null = null;
  let starting = false;
  let choosingAtEntry = false;
  let entryRetry = false;
  let permissionHelp = false;
  let watching = false;
  let pendingView = false;
  let remoteWatching = false;
  let dismissed = false;
  let peerSharing = false;
  let error = '';
  let needsPageAuthorization = false;
  let pendingState: ScreenState | null = null;
  let remoteSource: string | null = null;
  let remoteAt = 0;
  let remoteSequence = -1;
  let sequence = Date.now() * 100;
  let lastCapture = -Infinity;
  let budget = TARGET_FRAME * 2;
  let budgetAt = Date.now();
  let quality = .8;
  let lastControl = -Infinity;
  let serverFlow = false;
  let peerFlow = false;
  const flow = new LessonCameraFlow(() => window.performance.now(), screenProfiles);
  let pendingPicture: { data: string; ticket: number } | null = null;
  let decoding: object | null = null;

  const teacher = () => !!current && config.uid === current.teacherUid;
  const learner = () => !!current && config.uid === current.studentUid;
  const available = () => !!current && !disposed && connected && peerOnline;
  const notify = () => { if (!disposed) options.onChange(); };
  function send(message: any) {
    if (!available()) return false;
    const advertise = serverFlow && (message.type === 'screen-view' && message.watching
      || message.type === 'screen-state' && message.state === 'sharing');
    try { return options.send({ ...message, ...(advertise && { flow: true }), lessonId: current!._id }); } catch { return false; }
  }
  function clearRemote() {
    remoteSource = null; remoteAt = 0; remoteSequence = -1;
    pendingPicture = null; decoding = null; peerFlow = false; flow.reset();
  }
  function requestScreenWindow() {
    if (teacher() && available() && watching && peerSharing && peerFlow) {
      flow.request((seq, level, seen) => send({ type: 'screen-window', seq, level, seen }));
    }
  }
  function showLatestPicture() {
    if (decoding || !pendingPicture) return;
    const picture = pendingPicture; pendingPicture = null;
    if (!flow.fresh(picture.ticket)) return;
    const publish = (display?: () => void) => {
      if (!flow.fresh(picture.ticket)) return;
      display?.(); flow.displayed(picture.ticket);
      remoteSource = picture.data; remoteAt = Date.now(); notify();
    };
    if (!options.preparePicture) { publish(); return; }
    decoding = picture;
    void options.preparePicture(picture.data).then(display => {
      if (decoding === picture) publish(display);
    }).catch(() => { /* Skip this image when the decoder cannot display it. */ }).finally(() => {
      if (decoding === picture) { decoding = null; showLatestPicture(); }
    });
  }
  function report(state: ScreenState) {
    pendingState = state;
    if (send({ type: 'screen-state', state })) {
      pendingState = null; lastControl = Date.now(); return true;
    }
    return false;
  }
  function announce() {
    if (!available()) return;
    if (teacher()) {
      if ((watching || pendingView) && send({ type: 'screen-view', watching })) {
        pendingView = false; lastControl = Date.now();
      }
    } else if (learner()) {
      if (pendingState) report(pendingState);
      else if (stream) report('sharing');
    }
  }
  function detachStream() {
    const previous = stream; stream = null;
    previous?.getTracks().forEach(track => track.stop());
    video.srcObject = null;
  }
  function stopSharing(state: ScreenState = 'stopped') {
    generation++; starting = false; choosingAtEntry = false; entryRetry = false; detachStream(); remoteWatching = false;
    clearRemote();
    dismissed = true; needsPageAuthorization = false; permissionHelp = false;
    if (learner()) report(state);
    notify();
  }
  function reset() {
    generation++; starting = false; choosingAtEntry = false; entryRetry = false; detachStream();
    watching = false; pendingView = false; remoteWatching = false; dismissed = false; peerSharing = false;
    error = ''; needsPageAuthorization = false; permissionHelp = false; pendingState = null;
    clearRemote(); peerStream = ''; retiredStreams.clear();
    connected = false; peerOnline = false; serverFlow = false; lastControl = -Infinity;
    lastCapture = -Infinity; budget = TARGET_FRAME * 2; budgetAt = Date.now(); quality = .8;
  }
  function validPeer(message: any) {
    if (!available() || !message || message.lessonId !== current!._id
      || message.uid !== (teacher() ? current!.studentUid : current!.teacherUid)) return false;
    if (message.streamId !== undefined) {
      if (typeof message.streamId !== 'string' || !message.streamId || message.streamId.length > 96
        || retiredStreams.has(message.streamId)) return false;
      if (peerStream && message.streamId !== peerStream) return false;
      if (!peerStream) peerStream = message.streamId;
    }
    return true;
  }
  function viewCamera(message = '') {
    const hadView = watching || !!remoteSource || pendingView;
    watching = false; peerSharing = false; clearRemote();
    error = message; needsPageAuthorization = false;
    if (teacher() && hadView) { pendingView = true; announce(); }
    notify();
  }
  function statusText() {
    if (!current) return '';
    if (error) return error;
    if (teacher()) {
      if (!watching) return '';
      if (!connected || !peerOnline) return '连接恢复后继续请求学员屏幕。';
      if (remoteSource) return '正在查看学员的整个电脑屏幕。';
      return peerSharing ? '正在接收学员屏幕…' : '已请求学员共享整个屏幕，等待学员授权。';
    }
    if (starting) return '在弹出的窗口中选择整个屏幕，然后确认共享。也可以取消后继续上课。';
    if (stream) return connected && peerOnline && remoteWatching
      ? '正在共享整个电脑屏幕，老师可见；你可以随时停止。' : '本节课已获屏幕授权。老师查看时才会发送画面，你可以随时停止。';
    return remoteWatching && !dismissed ? '老师申请查看你的整个电脑屏幕，请点击后选择「整个屏幕」。' : '';
  }

  async function authorize(entry?: LessonEntryScreen) {
    if (disposed || !learner() || starting || stream) return;
    const atEntry = !!entry || entryRetry;
    if (!atEntry && (!available() || !remoteWatching || dismissed)) return;
    const attempt = ++generation; const lessonId = current!._id;
    starting = true; choosingAtEntry = atEntry; entryRetry = false; error = ''; permissionHelp = false; needsPageAuthorization = false;
    try {
      const selection = entry ? entry.selection : selectMonitor();
      notify();
      const selected = await selection;
      if (disposed || attempt !== generation || current?._id !== lessonId || (!atEntry && (!available() || !remoteWatching || dismissed))) {
        selected.getTracks().forEach(track => track.stop()); return;
      }
      const track = selected.getVideoTracks()[0];
      let surface: string | undefined;
      try { surface = track?.getSettings?.()?.displaySurface; } catch { /* The browser may not expose capture settings. */ }
      const live = track && track.readyState !== 'ended';
      if (!live || surface !== 'monitor') {
        selected.getTracks().forEach(item => item.stop());
        if (!live) throw new Error('这次屏幕采集已结束，可以重新选择整个屏幕。');
        if (!surface) throw new Error('浏览器没有报告共享类型，课堂无法确认是整个屏幕。可以继续上课，需要共享时请改用电脑端 Chrome 或 Edge。');
        throw new Error('请选择「整个屏幕」，不能选择单个窗口或浏览器标签页。');
      }
      selected.getAudioTracks().forEach(item => item.stop());
      stream = selected; video.srcObject = selected;
      track.addEventListener('ended', () => {
        if (stream !== selected) return;
        error = '屏幕共享已停止。'; stopSharing();
      }, { once: true });
      budget = TARGET_FRAME * 2; budgetAt = Date.now(); lastCapture = -Infinity; quality = .8;
      report('sharing'); notify();
      void video.play().catch(() => {}); // A delayed first screen frame must not postpone the microphone.
    } catch (cause: any) {
      if (disposed || attempt !== generation || current?._id !== lessonId) return;
      needsPageAuthorization = cause?.name === 'InvalidStateError';
      permissionHelp = cause?.name === 'NotAllowedError' || cause?.name === 'PermissionDeniedError';
      error = needsPageAuthorization ? '请回到课堂页面，点击「选择整个屏幕」授权共享。'
        : permissionHelp
          ? '尚未获得屏幕共享授权。' : cause?.message || '屏幕共享未能开启，请重试。';
      // A focus error keeps the request so the learner can continue on the page.
      if (!needsPageAuthorization && remoteWatching) { remoteWatching = false; dismissed = true; report('declined'); }
      entryRetry = atEntry || permissionHelp;
      if (atEntry && permissionHelp) error = '已进入课堂，本次尚未共享屏幕。';
    } finally {
      if (attempt === generation) { starting = false; choosingAtEntry = false; notify(); }
    }
  }

  return {
    // Only the learner's join click opens this picker. Hold its result until
    // the server confirms the same class and both participant identities.
    prepareEntryScreen(room: LessonScreenRoom): LessonEntryScreen | undefined {
      if (disposed || current || !room?._id || room.studentUid !== config.uid || room.teacherUid === config.uid
        || !window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) return;
      const selection = (async () => selectMonitor())();
      // The chooser can settle before the asynchronous class join has returned.
      selection.catch(() => {});
      return { room: { ...room }, selection, cancel() {
        void selection.then(value => value.getTracks().forEach(track => track.stop()), () => {});
      } };
    },
    start(room: LessonScreenRoom, entry?: LessonEntryScreen) {
      reset(); current = null;
      if (!disposed && room && typeof room._id === 'string' && room._id
        && room.teacherUid !== room.studentUid && [room.teacherUid, room.studentUid].includes(config.uid)) current = room;
      notify();
      if (!entry) return;
      if (!learner() || entry.room._id !== room._id || entry.room.studentUid !== room.studentUid || entry.room.teacherUid !== room.teacherUid) {
        entry.cancel(); return;
      }
      return authorize(entry);
    },
    stop() { reset(); current = null; notify(); },
    dispose() { if (disposed) return; reset(); current = null; disposed = true; },
    setConnected(value: boolean) {
      if (disposed) return;
      const next = !!value && !!current;
      if (connected === next) return;
      connected = next;
      if (!connected) {
        if (starting && !choosingAtEntry) { generation++; starting = false; }
        // The controller fences the departed socket. Bind the replacement peer
        // from the next authenticated ready/peer message, including reused tabs.
        peerStream = ''; retiredStreams.clear();
        peerOnline = false; remoteWatching = false; peerSharing = false; clearRemote();
      } else announce();
      notify();
    },
    setPeerOnline(value: boolean, streamId?: string, supportsFlow?: boolean) {
      if (disposed || !current) return;
      if (typeof supportsFlow === 'boolean') serverFlow = supportsFlow;
      const nextStream = typeof streamId === 'string' && streamId.length <= 96 ? streamId : '';
      const changed = !!nextStream && !!peerStream && nextStream !== peerStream;
      if (changed) {
        retiredStreams.add(peerStream); clearRemote(); peerSharing = false; remoteWatching = false; dismissed = false;
      }
      // This method is fed only authoritative ready/peer bindings, never media
      // payloads. A formerly retired tab may legitimately own a fresh lease.
      if (nextStream) retiredStreams.delete(nextStream);
      if (nextStream) peerStream = nextStream;
      const wasOnline = peerOnline;
      peerOnline = !!value && connected;
      if (!peerOnline) {
        if (starting && !choosingAtEntry) { generation++; starting = false; }
        remoteWatching = false; peerSharing = false; clearRemote();
      }
      if (peerOnline && (!wasOnline || changed)) announce();
      notify();
    },
    toggleView() {
      if (disposed || !teacher()) return;
      error = ''; needsPageAuthorization = false;
      if (watching) { viewCamera(); return; }
      if (!available()) { error = '请等待学员连接后再查看屏幕。'; notify(); return; }
      // A declined request is reset by false -> true. Preserve that order even
      // when the previous return-to-camera control met transport backpressure.
      if (pendingView) {
        announce();
        if (pendingView) { error = '连接正在恢复，请稍后重试。'; notify(); return; }
      }
      if (!send({ type: 'screen-view', watching: true })) {
        error = '连接正在恢复，请稍后重试。'; notify(); return;
      }
      watching = true; pendingView = false; peerSharing = false; clearRemote(); lastControl = Date.now(); notify();
    },
    startSharing() { return authorize(); },
    stopSharing() { if (!disposed && learner()) { error = ''; stopSharing(); } },
    declineSharing() {
      if (!disposed && learner()) { error = ''; stopSharing('declined'); }
    },
    receive(message: any) {
      if (!validPeer(message)) return;
      if (learner() && message.type === 'screen-view' && typeof message.watching === 'boolean') {
        if (!message.watching) {
          remoteWatching = false; dismissed = false;
          clearRemote();
          if (starting && !choosingAtEntry) { generation++; starting = false; }
          error = ''; needsPageAuthorization = false; notify(); return;
        }
        if (dismissed) { if (pendingState) report(pendingState); return; }
        if (!remoteWatching) { error = ''; needsPageAuthorization = false; }
        remoteWatching = true; peerFlow = serverFlow && message.flow === true;
        if (stream) report('sharing');
        notify(); return;
      }
      if (message.type === 'screen-window') {
        if (learner() && stream && remoteWatching && peerFlow) flow.acceptWindow(message.seq, message.level, message.seen);
        return;
      }
      if (!teacher()) return;
      if (message.type === 'screen-state' && ['sharing', 'stopped', 'declined'].includes(message.state)) {
        if (message.state !== 'sharing') {
          viewCamera(message.state === 'declined' ? '学员暂未同意共享屏幕，可再次点击请求。' : '学员已停止共享屏幕。'); return;
        }
        peerSharing = true; peerFlow = serverFlow && message.flow === true;
        requestScreenWindow(); notify(); return;
      }
      if (message.type !== 'screen' || !watching || !peerSharing || !Number.isSafeInteger(message.seq) || message.seq < 0
        || message.seq <= remoteSequence || typeof message.data !== 'string' || message.data.length > MAX_FRAME
        || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(message.data)) return;
      if (peerFlow) {
        flow.arrived(message.seq, message.ticket);
        if (message.ticket === undefined || !flow.fresh(message.ticket)) return;
        remoteSequence = message.seq; pendingPicture = { data: message.data, ticket: message.ticket };
        showLatestPicture(); return;
      }
      remoteSequence = message.seq; remoteAt = Date.now(); remoteSource = message.data; notify();
    },
    capture() {
      if (disposed || !current) return;
      const now = Date.now();
      if (teacher() && remoteAt && now - remoteAt > STALE_MS) {
        if (peerFlow) { remoteSource = null; remoteAt = 0; notify(); }
        else viewCamera('学员屏幕画面已暂停，请重新请求查看。');
      }
      if (available() && now - lastControl >= HEARTBEAT_MS && (teacher() ? watching || pendingView : !!stream || !!pendingState)) announce();
      requestScreenWindow();
      if (!learner() || !available() || !remoteWatching || !stream || starting || video.readyState < 2 || now - lastCapture < SCREEN_INTERVAL - 1) return;
      if (options.canSendPicture?.() === false) return;
      const mode = peerFlow ? flow.nextPicture() : undefined;
      if (peerFlow && !mode) return;
      lastCapture = now;
      const sourceWidth = video.videoWidth; const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) return;
      budget = Math.min(TARGET_FRAME * 2, budget + Math.max(0, now - budgetAt) * BYTES_PER_SECOND / 1000); budgetAt = now;
      const limit = Math.min(mode?.profile.bytes ?? TARGET_FRAME, MAX_FRAME, Math.floor(budget) - 256);
      if (limit < 2048) return;
      try {
        context ||= canvas.getContext('2d'); if (!context) return;
        let data = ''; let nextQuality = quality;
        const sizes = mode ? [[1280, 720], [960, 540], [640, 360], [480, 270], [320, 180], [240, 135]] : [[1280, 720], [960, 540], [640, 360]];
        for (const [maxWidth, maxHeight] of sizes) {
          if (mode && maxWidth > mode.profile.width) continue;
          const ratio = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1);
          canvas.width = Math.max(1, Math.floor(sourceWidth * ratio));
          canvas.height = Math.max(1, Math.floor(sourceHeight * ratio));
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          for (let attempt = 0; attempt < 5; attempt++) {
            data = canvas.toDataURL('image/jpeg', nextQuality);
            if (data.length <= limit) break;
            nextQuality = Math.max(.2, nextQuality * .7);
          }
          if (data.length <= limit) break;
          nextQuality = .5;
        }
        if (data.length > limit || !data.startsWith('data:image/jpeg;base64,')) return;
        const seq = sequence++;
        if (send({ type: 'screen', seq, data, ...(mode && { ticket: mode.ticket }) })) {
          if (mode) flow.sent(seq, data.length);
          budget -= data.length + 256; quality = Math.min(.85, nextQuality + .02);
        }
      } catch { /* Drop undecoded or oversize frames; never queue an old desktop. */ }
    },
    snapshot(): LessonScreenSnapshot {
      return { watching, requested: learner() && remoteWatching && !stream && !dismissed,
        requestPending: teacher() && watching && !remoteSource, sharing: !!stream, starting, error, peerSharing,
        remoteSource, remoteAt, needsPageAuthorization, entryRetry, permissionHelp: learner() && !!error && permissionHelp, statusText: statusText() };
    },
  };
}
