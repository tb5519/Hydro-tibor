export interface LessonScreenRoom { _id: string; teacherUid: number; studentUid: number }
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
  statusText: string;
}
interface ScreenOptions { send(message: any): boolean; onChange(): void }
type ScreenState = 'sharing' | 'stopped' | 'declined';

const INTERVAL = 125;
const MAX_FRAME = 262144;
const BYTES_PER_SECOND = 1024 * 1024;
const TARGET_FRAME = Math.floor(BYTES_PER_SECOND / 8) - 256;
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

  const teacher = () => !!current && config.uid === current.teacherUid;
  const learner = () => !!current && config.uid === current.studentUid;
  const available = () => !!current && !disposed && connected && peerOnline;
  const notify = () => { if (!disposed) options.onChange(); };
  function send(message: any) {
    if (!available()) return false;
    try { return options.send({ ...message, lessonId: current!._id }); } catch { return false; }
  }
  function clearRemote() {
    remoteSource = null; remoteAt = 0; remoteSequence = -1;
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
    generation++; starting = false; detachStream(); remoteWatching = false;
    dismissed = true; needsPageAuthorization = false;
    if (learner()) report(state);
    notify();
  }
  function reset() {
    generation++; starting = false; detachStream();
    watching = false; pendingView = false; remoteWatching = false; dismissed = false; peerSharing = false;
    error = ''; needsPageAuthorization = false; pendingState = null;
    clearRemote(); peerStream = ''; retiredStreams.clear();
    connected = false; peerOnline = false; lastControl = -Infinity;
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
    if (starting) return '请在浏览器中选择「整个屏幕」。';
    if (stream) return connected && peerOnline && remoteWatching
      ? '正在共享整个电脑屏幕，老师可见；你可以随时停止。' : '屏幕共享已暂停，老师当前查看摄像头。';
    return remoteWatching && !dismissed ? '老师申请查看你的整个电脑屏幕，请点击后选择「整个屏幕」。' : '';
  }

  return {
    start(room: LessonScreenRoom) {
      reset(); current = null;
      if (!disposed && room && typeof room._id === 'string' && room._id
        && room.teacherUid !== room.studentUid && [room.teacherUid, room.studentUid].includes(config.uid)) current = room;
      notify();
    },
    stop() { reset(); current = null; notify(); },
    dispose() { if (disposed) return; reset(); current = null; disposed = true; },
    setConnected(value: boolean) {
      if (disposed) return;
      const next = !!value && !!current;
      if (connected === next) return;
      connected = next;
      if (!connected) {
        if (starting) { generation++; starting = false; }
        // The controller fences the departed socket. Bind the replacement peer
        // from the next authenticated ready/peer message, including reused tabs.
        peerStream = ''; retiredStreams.clear();
        peerOnline = false; remoteWatching = false; peerSharing = false; clearRemote();
      } else announce();
      notify();
    },
    setPeerOnline(value: boolean, streamId?: string) {
      if (disposed || !current) return;
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
        if (starting) { generation++; starting = false; }
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
    async startSharing() {
      if (disposed || !learner() || !available() || !remoteWatching || dismissed || starting || stream) return;
      const attempt = ++generation; const lessonId = current!._id;
      starting = true; error = ''; needsPageAuthorization = false;
      let selection: Promise<MediaStream>;
      try {
        if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) throw new Error('当前浏览器不支持整个屏幕共享，请使用电脑端 Chrome 或 Edge。');
        // Run in the original learner click, before any await or render callback.
        selection = navigator.mediaDevices.getDisplayMedia({
          audio: false,
          video: { displaySurface: 'monitor', width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 8, max: 8 } },
          monitorTypeSurfaces: 'include',
        } as DisplayMediaStreamOptions);
        notify();
        const selected = await selection;
        if (disposed || attempt !== generation || current?._id !== lessonId || !available() || !remoteWatching || dismissed) {
          selected.getTracks().forEach(track => track.stop()); return;
        }
        const track = selected.getVideoTracks()[0];
        if (!track || track.readyState === 'ended' || track.getSettings().displaySurface !== 'monitor') {
          selected.getTracks().forEach(item => item.stop());
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
        try { await video.play(); } catch { /* The first decoded frame can arrive after play resolves. */ }
      } catch (cause: any) {
        if (disposed || attempt !== generation || current?._id !== lessonId) return;
        needsPageAuthorization = cause?.name === 'InvalidStateError';
        error = needsPageAuthorization ? '请回到课堂页面，点击「选择整个屏幕」授权共享。'
          : cause?.name === 'NotAllowedError' || cause?.name === 'PermissionDeniedError'
            ? '尚未获得屏幕共享授权。' : cause?.message || '屏幕共享未能开启，请重试。';
        // A focus error keeps the request so the learner can continue on the page.
        if (!needsPageAuthorization) { remoteWatching = false; dismissed = true; report('declined'); }
      } finally {
        if (attempt === generation) { starting = false; notify(); }
      }
    },
    stopSharing() { if (!disposed && learner()) { error = ''; stopSharing(); } },
    declineSharing() {
      if (!disposed && learner()) { error = ''; stopSharing('declined'); }
    },
    receive(message: any) {
      if (!validPeer(message)) return;
      if (learner() && message.type === 'screen-view' && typeof message.watching === 'boolean') {
        if (!message.watching) {
          remoteWatching = false; dismissed = false;
          if (starting) { generation++; starting = false; }
          error = ''; needsPageAuthorization = false; notify(); return;
        }
        if (dismissed) { if (pendingState) report(pendingState); return; }
        if (!remoteWatching) { error = ''; needsPageAuthorization = false; }
        remoteWatching = true;
        if (stream) report('sharing');
        notify(); return;
      }
      if (!teacher()) return;
      if (message.type === 'screen-state' && ['sharing', 'stopped', 'declined'].includes(message.state)) {
        if (message.state !== 'sharing') {
          viewCamera(message.state === 'declined' ? '学员暂未同意共享屏幕，可再次点击请求。' : '学员已停止共享屏幕。'); return;
        }
        peerSharing = true; notify(); return;
      }
      if (message.type !== 'screen' || !watching || !peerSharing || !Number.isSafeInteger(message.seq) || message.seq < 0
        || message.seq <= remoteSequence || typeof message.data !== 'string' || message.data.length > MAX_FRAME
        || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(message.data)) return;
      remoteSequence = message.seq; remoteAt = Date.now(); remoteSource = message.data; notify();
    },
    capture() {
      if (disposed || !current) return;
      const now = Date.now();
      if (teacher() && remoteAt && now - remoteAt > STALE_MS) viewCamera('学员屏幕画面已暂停，请重新请求查看。');
      if (available() && now - lastControl >= HEARTBEAT_MS && (teacher() ? watching || pendingView : !!stream || !!pendingState)) announce();
      if (!learner() || !available() || !remoteWatching || !stream || starting || video.readyState < 2 || now - lastCapture < INTERVAL) return;
      lastCapture = now;
      const sourceWidth = video.videoWidth; const sourceHeight = video.videoHeight;
      if (!sourceWidth || !sourceHeight) return;
      budget = Math.min(TARGET_FRAME * 2, budget + Math.max(0, now - budgetAt) * BYTES_PER_SECOND / 1000); budgetAt = now;
      const limit = Math.min(TARGET_FRAME, MAX_FRAME, Math.floor(budget) - 256);
      if (limit < 2048) return;
      try {
        context ||= canvas.getContext('2d'); if (!context) return;
        let data = ''; let nextQuality = quality;
        for (const [maxWidth, maxHeight] of [[1280, 720], [960, 540], [640, 360]]) {
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
        if (send({ type: 'screen', seq: sequence++, data })) {
          budget -= data.length + 256; quality = Math.min(.85, nextQuality + .02);
        }
      } catch { /* Drop undecoded or oversize frames; never queue an old desktop. */ }
    },
    snapshot(): LessonScreenSnapshot {
      return { watching, requested: learner() && remoteWatching && !stream && !dismissed,
        requestPending: teacher() && watching && !remoteSource, sharing: !!stream, starting, error, peerSharing,
        remoteSource, remoteAt, needsPageAuthorization, statusText: statusText() };
    },
  };
}
