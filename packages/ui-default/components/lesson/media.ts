import { microphoneError, VoiceAudio } from '../voice_call/audio';

export interface LessonMediaRoom {
  _id: string;
  teacherUid: number;
  studentUid: number;
  teacherName: string;
  studentName: string;
  title?: string;
}
interface MediaOptions {
  send(message: any): boolean;
  onLeave(): void;
  audioFactory?: (options: ConstructorParameters<typeof VoiceAudio>[0]) => VoiceAudio;
}
type PictureInPictureWindow = Window & { document: Document };
type DesktopWindow = Window & { documentPictureInPicture?: { requestWindow(options: { width: number; height: number }): Promise<PictureInPictureWindow> } };
type PictureVideo = HTMLVideoElement & { webkitSetPresentationMode?: (mode: string) => void };

const VIDEO_WIDTH = 320;
const VIDEO_HEIGHT = 240;
const VIDEO_INTERVAL = 250;
const MAX_VIDEO_LENGTH = 32768;
const STALE_VIDEO_MS = 1800;
const PIP_STYLE = `
*{box-sizing:border-box}body{margin:0;background:#111827;color:#f8fafc;font:13px system-ui,sans-serif}
.lesson-media{position:static!important;inset:auto!important;transform:none!important;width:100%!important;max-width:none!important;border:0!important;border-radius:0!important;box-shadow:none!important;background:#111827;color:#f8fafc}
.lesson-media__header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;font-size:13px}.lesson-media__header strong{font-size:14px}
.lesson-media__eyebrow{color:#a5b4fc;font-size:10px;margin-right:8px}.lesson-media__grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:0 8px}
.lesson-media__tile{position:relative;aspect-ratio:4/3;background:#243044;border-radius:9px;overflow:hidden;display:grid;place-items:center}
.lesson-media__tile video,.lesson-media__tile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.lesson-media__tile video{transform:scaleX(-1)}
.lesson-media__placeholder{color:#cbd5e1;font-size:12px;padding:16px;text-align:center}.lesson-media__name{position:absolute;bottom:5px;left:5px;border-radius:5px;background:#111827cc;padding:3px 6px;font-size:11px}
.lesson-media__status{font-size:11px;color:#cbd5e1;padding:7px 10px;margin:0;line-height:1.5}.lesson-media__controls{padding:0 8px 8px;display:flex;gap:5px;flex-wrap:wrap}
.lesson-media__controls button{border:1px solid #475569;background:#263449;color:#f8fafc;font:inherit;border-radius:6px;padding:7px 9px;cursor:pointer;font-size:11px}.lesson-media__controls .is-danger{background:#b91c1c;border-color:#dc2626}.lesson-media__controls button[aria-pressed="true"]{background:#334779}
[hidden]{display:none!important}.lesson-media__pip-composite{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
`;

function cameraError(cause: any) {
  if (cause?.name === 'NotAllowedError' || cause?.name === 'PermissionDeniedError') return '摄像头权限未开启，可在地址栏允许后重试。';
  if (cause?.name === 'NotFoundError') return '没有找到摄像头，请连接设备后重试。';
  if (cause?.name === 'NotReadableError') return '摄像头暂时无法使用，请检查是否被其他软件占用。';
  return cause?.message || '摄像头未能开启，请重试。';
}

/** One persistent, explicitly joined classroom owns all camera and audio tracks.
 * The server only relays bounded live frames; this module never records media. */
export function mountLessonMedia(config: { uid: number }, options: MediaOptions) {
  const doc = document;
  const win = window;
  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
    const value = doc.createElement(tag); value.className = cls; value.textContent = text; return value;
  };
  const root = el('section', 'lesson-media'); root.hidden = true;
  root.dataset.lessonMedia = ''; root.dataset.liveSharePrivate = ''; root.dataset.lessonUi = '';
  root.setAttribute('role', 'complementary'); root.setAttribute('aria-label', '上课摄像头与语音');
  const header = el('header', 'lesson-media__header'); header.tabIndex = 0;
  header.setAttribute('aria-label', '拖动摄像头窗口，或按 Alt 加方向键移动');
  const heading = el('span'); heading.append(el('span', 'lesson-media__eyebrow', '正在上课'), el('strong', '', '课堂摄像头'));
  const peerLabel = el('span', 'lesson-media__peer', '等待学员'); header.append(heading, peerLabel);
  const grid = el('div', 'lesson-media__grid');
  const remoteTile = el('div', 'lesson-media__tile');
  const remotePlaceholder = el('span', 'lesson-media__placeholder', '等待对方加入');
  const remoteVideo = el('img'); remoteVideo.dataset.lessonRemoteVideo = ''; remoteVideo.hidden = true;
  remoteVideo.alt = '对方的实时摄像头画面'; remoteVideo.draggable = false;
  const remoteName = el('span', 'lesson-media__name', '对方'); remoteTile.append(remotePlaceholder, remoteVideo, remoteName);
  const localTile = el('div', 'lesson-media__tile');
  const localPlaceholder = el('span', 'lesson-media__placeholder', '摄像头未开启');
  const localVideo = el('video'); localVideo.dataset.lessonLocalVideo = ''; localVideo.autoplay = true;
  localVideo.muted = true; localVideo.playsInline = true; localVideo.hidden = true;
  localTile.append(localPlaceholder, localVideo, el('span', 'lesson-media__name', '我')); grid.append(remoteTile, localTile);
  const status = el('p', 'lesson-media__status'); status.dataset.lessonMediaStatus = ''; status.setAttribute('role', 'status');
  const controls = el('div', 'lesson-media__controls');
  const control = (label: string, attribute: string) => {
    const value = el('button', '', label); value.type = 'button'; value.setAttribute(attribute, ''); controls.append(value); return value;
  };
  const camera = control('开启摄像头', 'data-lesson-camera');
  const microphone = control('开启麦克风', 'data-lesson-microphone');
  const desktop = control('桌面悬浮', 'data-lesson-desktop');
  const retry = control('重试设备', 'data-lesson-device-retry'); retry.hidden = true;
  const leave = control('离开课堂', 'data-lesson-media-leave'); leave.className = 'is-danger';
  root.append(header, grid, status, controls); doc.body.append(root);

  let current: LessonMediaRoom | null = null;
  let connected = false;
  let peerOnline = false;
  let disposed = false;
  let generation = 0;
  let cameraStream: MediaStream | null = null;
  let cameraWanted = true;
  let muted = false;
  let cameraStarting = false;
  let audioStarting = false;
  let cameraFailure = '';
  let audioFailure = '';
  let desktopFailure = '';
  let sequence = Date.now() * 100;
  let remoteSequence = -1;
  let remoteAudioSequence = -1;
  let remoteAudioStream = '';
  let remoteVideoStream = '';
  let remoteAt = 0;
  let remotePending = false;
  let position: { x: number; y: number } | null = null;
  let drag: { x: number; y: number; left: number; top: number; pointerId: number } | null = null;
  let pip: PictureInPictureWindow | null = null;
  let pipPending = false;
  let fallbackVideo: PictureVideo | null = null;
  let fallbackStream: MediaStream | null = null;
  let composite: HTMLCanvasElement | null = null;
  let compositeTimer = 0;
  const captureCanvas = doc.createElement('canvas'); captureCanvas.width = VIDEO_WIDTH; captureCanvas.height = VIDEO_HEIGHT;
  let captureContext: CanvasRenderingContext2D | null = null;
  const audioOptions = {
    onFrame(data: string) { if (current && connected && !disposed) options.send({ type: 'audio', lessonId: current._id, seq: sequence++, data }); },
    onError(cause: Error) { audioFailure = microphoneError(cause); audio.stop(); render(); },
  };
  const audio = options.audioFactory ? options.audioFactory(audioOptions) : new VoiceAudio(audioOptions);

  function render() {
    if (disposed) return;
    const cameraOn = !!cameraStream;
    localVideo.hidden = !cameraOn; localPlaceholder.hidden = cameraOn;
    camera.textContent = cameraOn ? '关闭摄像头' : '开启摄像头'; camera.setAttribute('aria-pressed', String(cameraOn)); camera.disabled = cameraStarting;
    microphone.textContent = !audio.ready ? '开启麦克风' : muted ? '打开声音' : '静音';
    microphone.setAttribute('aria-pressed', String(audio.ready && !muted)); microphone.disabled = audioStarting;
    desktop.textContent = pip || fallbackVideo ? '返回页面' : '桌面悬浮'; desktop.disabled = pipPending;
    retry.hidden = !cameraFailure && !audioFailure && (!!cameraStream || !cameraWanted) && audio.ready;
    peerLabel.textContent = peerOnline ? '双方已连接' : '等待对方';
    const base = !connected ? '正在连接课堂，连接恢复后可点击重试设备。'
      : !peerOnline ? '等待对方进入课堂。' : '课堂已连接，双方可以边看边讲。';
    status.textContent = [base, cameraFailure, audioFailure, desktopFailure].filter(Boolean).join(' ');
  }
  function clearRemote() {
    remoteAt = 0; remotePending = false; remoteSequence = -1;
    remoteVideo.removeAttribute('src'); remoteVideo.hidden = true;
    remotePlaceholder.hidden = false; remotePlaceholder.textContent = peerOnline ? '对方摄像头未开启' : '等待对方加入';
    audio.resetReceive(); remoteAudioStream = ''; remoteVideoStream = ''; remoteAudioSequence = -1;
  }
  function place(next: { x: number; y: number }) {
    const width = root.offsetWidth || 360; const height = root.offsetHeight || 230;
    position = { x: Math.max(8, Math.min(Math.max(8, win.innerWidth - width - 8), next.x)),
      y: Math.max(8, Math.min(Math.max(8, win.innerHeight - height - 8), next.y)) };
    root.style.left = `${position.x}px`; root.style.top = `${position.y}px`; root.style.right = 'auto'; root.style.bottom = 'auto';
  }
  function stopCamera() {
    const previous = cameraStream; cameraStream = null;
    previous?.getTracks().forEach((track) => track.stop()); localVideo.srcObject = null; localVideo.hidden = true;
  }
  async function startCamera(attempt = generation) {
    if (!current || disposed || cameraStream || cameraStarting || !cameraWanted) return;
    cameraStarting = true; cameraFailure = ''; render();
    try {
      if (!win.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('摄像头需要 HTTPS 或本机 localhost 安全连接。');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        width: { ideal: VIDEO_WIDTH }, height: { ideal: VIDEO_HEIGHT }, frameRate: { ideal: 6, max: 10 }, facingMode: 'user',
      } });
      if (attempt !== generation || disposed || !current || !cameraWanted) { stream.getTracks().forEach((track) => track.stop()); return; }
      cameraStream = stream; localVideo.srcObject = stream;
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => {
        if (cameraStream === stream) { stopCamera(); cameraFailure = '摄像头已断开，请重新连接后重试。'; render(); }
      });
      try { await localVideo.play(); } catch { /* A muted preview may become ready after metadata arrives. */ }
    } catch (cause) { if (attempt === generation && current) cameraFailure = cameraError(cause); }
    finally { if (attempt === generation) { cameraStarting = false; render(); } }
  }
  async function startAudio(attempt = generation) {
    if (!current || disposed || audio.ready || audioStarting) return;
    audioStarting = true; audioFailure = ''; render();
    try {
      await audio.start();
      if (attempt !== generation || disposed || !current) return;
      audio.setMuted(muted); audio.setTransmitting(connected);
    } catch (cause) { if (attempt === generation && current) audioFailure = microphoneError(cause); }
    finally { if (attempt === generation) { audioStarting = false; render(); } }
  }
  function stopFallback() {
    win.clearInterval(compositeTimer); compositeTimer = 0;
    fallbackStream?.getTracks().forEach((track) => track.stop()); fallbackStream = null;
    if (fallbackVideo) { fallbackVideo.srcObject = null; fallbackVideo.remove(); fallbackVideo = null; }
    composite = null;
  }
  function restorePanel() {
    if (root.ownerDocument !== doc && !disposed) doc.body.append(root);
    pip = null; root.classList.remove('is-desktop'); render();
    if (position) place(position);
  }
  function closeDesktop() {
    const previous = pip; pip = null;
    try { previous?.close(); } catch { /* The browser may already have closed PiP. */ }
    restorePanel();
    if ((doc as Document & { pictureInPictureElement?: Element }).pictureInPictureElement === fallbackVideo) {
      void (doc as Document & { exitPictureInPicture?: () => Promise<void> }).exitPictureInPicture?.().catch(() => {});
    }
    if (fallbackVideo?.webkitSetPresentationMode) {
      try { fallbackVideo.webkitSetPresentationMode('inline'); } catch { /* Unsupported presentation mode. */ }
    }
    stopFallback();
  }
  function drawComposite() {
    if (!composite) return;
    const context = composite.getContext('2d'); if (!context) return;
    context.fillStyle = '#111827'; context.fillRect(0, 0, 640, 264);
    const image = (source: CanvasImageSource, left: number, enabled: boolean) => {
      if (!enabled) return;
      try { context.drawImage(source, left, 0, 320, 240); } catch { /* First frame may still be decoding. */ }
    };
    image(remoteVideo, 0, !remoteVideo.hidden && remoteVideo.complete && remoteVideo.naturalWidth > 0);
    image(localVideo, 320, !!cameraStream && localVideo.readyState >= 2);
    context.fillStyle = '#f8fafc'; context.font = '14px sans-serif';
    context.fillText(remoteName.textContent || '对方', 10, 258); context.fillText('我', 330, 258);
  }
  async function openDesktop() {
    if (!current || disposed || pipPending) return;
    if (pip || fallbackVideo) { closeDesktop(); render(); return; }
    const attempt = generation;
    desktopFailure = ''; pipPending = true; render();
    try {
      const picture = (win as DesktopWindow).documentPictureInPicture;
      if (picture?.requestWindow) {
        // requestWindow executes before the first await, preserving user activation.
        const next = await picture.requestWindow({ width: 440, height: 275 });
        if (disposed || !current || generation !== attempt) { next.close(); return; }
        pip = next;
        const style = next.document.createElement('style'); style.textContent = PIP_STYLE; next.document.head.append(style);
        next.document.title = 'OneByOne 上课'; next.document.body.append(root); root.classList.add('is-desktop');
        next.addEventListener('pagehide', () => { if (pip === next) restorePanel(); }, { once: true });
      } else {
        // Standard video PiP supports one <video>. Compose both cameras into a
        // transient live stream; no recording or MediaRecorder is involved.
        composite = doc.createElement('canvas'); composite.width = 640; composite.height = 264;
        if (!composite.captureStream) throw new Error('当前浏览器不支持桌面悬浮，请使用支持画中画的浏览器。');
        const video = el('video', 'lesson-media__pip-composite') as PictureVideo;
        video.muted = true; video.autoplay = true; video.playsInline = true;
        if (!video.requestPictureInPicture && !video.webkitSetPresentationMode) throw new Error('当前浏览器不支持桌面悬浮，请使用支持画中画的浏览器。');
        fallbackStream = composite.captureStream(4); video.srcObject = fallbackStream; fallbackVideo = video; root.append(video);
        drawComposite(); compositeTimer = win.setInterval(drawComposite, VIDEO_INTERVAL);
        await video.play();
        if (disposed || generation !== attempt || !current) { stopFallback(); return; }
        video.addEventListener('leavepictureinpicture', () => { stopFallback(); render(); }, { once: true });
        video.addEventListener('webkitpresentationmodechanged', () => {
          if ((video as PictureVideo & { webkitPresentationMode?: string }).webkitPresentationMode === 'inline') {
            stopFallback(); render();
          }
        });
        if (video.requestPictureInPicture) await video.requestPictureInPicture();
        else video.webkitSetPresentationMode!('picture-in-picture');
        if (disposed || generation !== attempt || !current) closeDesktop();
      }
    } catch (cause: any) {
      closeDesktop();
      desktopFailure = cause?.name === 'NotAllowedError' ? '请点击“桌面悬浮”按钮，并允许浏览器打开画中画。'
        : cause?.message || '桌面悬浮未能开启，请再点击一次。';
    } finally { pipPending = false; render(); }
  }
  function release() {
    generation++; cameraStarting = false; audioStarting = false; pipPending = false;
    stopCamera(); audio.stop(); clearRemote(); closeDesktop();
  }
  function stop() {
    release(); current = null; connected = false; peerOnline = false; root.hidden = true;
  }
  camera.addEventListener('click', () => {
    if (!current) return;
    if (cameraStream) { cameraWanted = false; stopCamera(); cameraFailure = ''; render(); }
    else if (connected) { cameraWanted = true; void startCamera(); }
  });
  microphone.addEventListener('click', () => {
    if (!current || !connected) return;
    if (!audio.ready) { muted = false; void startAudio(); }
    else { muted = !muted; audio.setMuted(muted); render(); }
  });
  desktop.addEventListener('click', () => { void openDesktop(); });
  retry.addEventListener('click', () => {
    if (!current || !connected) return;
    void Promise.all([startCamera(), startAudio()]);
  });
  leave.addEventListener('click', () => { stop(); options.onLeave(); });
  header.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || pip) return;
    const bounds = root.getBoundingClientRect(); drag = { x: event.clientX, y: event.clientY, left: bounds.left, top: bounds.top, pointerId: event.pointerId };
    header.setPointerCapture?.(event.pointerId); event.preventDefault();
  });
  header.addEventListener('pointermove', (event) => {
    if (drag && event.pointerId === drag.pointerId) place({ x: drag.left + event.clientX - drag.x, y: drag.top + event.clientY - drag.y });
  });
  const drop = () => { drag = null; };
  header.addEventListener('pointerup', drop); header.addEventListener('pointercancel', drop);
  header.addEventListener('keydown', (event) => {
    if (!event.altKey || !/^Arrow(?:Left|Right|Up|Down)$/.test(event.key) || pip) return;
    const bounds = root.getBoundingClientRect(); event.preventDefault();
    place({ x: bounds.left + (event.key === 'ArrowRight' ? 20 : event.key === 'ArrowLeft' ? -20 : 0),
      y: bounds.top + (event.key === 'ArrowDown' ? 20 : event.key === 'ArrowUp' ? -20 : 0) });
  });
  const resize = () => { if (position && !pip) place(position); };
  win.addEventListener('resize', resize);
  const captureTimer = win.setInterval(() => {
    if (!current || disposed || !connected || !cameraStream || localVideo.readyState < 2) return;
    try {
      captureContext ||= captureCanvas.getContext('2d'); if (!captureContext) return;
      captureContext.drawImage(localVideo, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
      const data = captureCanvas.toDataURL('image/jpeg', .5);
      if (data.length <= MAX_VIDEO_LENGTH) options.send({ type: 'video', lessonId: current._id, seq: sequence++, data });
    } catch { /* Drop an undecoded or oversize frame, never queue stale video. */ }
  }, VIDEO_INTERVAL);
  const staleTimer = win.setInterval(() => {
    if (remoteAt && Date.now() - remoteAt > STALE_VIDEO_MS) {
      remoteVideo.removeAttribute('src'); remoteVideo.hidden = true; remotePlaceholder.hidden = false;
      remotePlaceholder.textContent = peerOnline ? '对方摄像头已暂停' : '等待对方加入'; remoteAt = 0; remotePending = false;
    }
  }, 300);
  remoteVideo.addEventListener('load', () => {
    remotePending = false;
    if (current && connected && remoteAt && Date.now() - remoteAt <= STALE_VIDEO_MS) {
      remoteVideo.hidden = false; remotePlaceholder.hidden = true;
    }
  });
  remoteVideo.addEventListener('error', () => { remotePending = false; remoteVideo.hidden = true; remotePlaceholder.hidden = false; });

  return {
    async start(lesson: LessonMediaRoom, _isTeacher?: boolean) {
      if (disposed) return;
      stop(); current = lesson; cameraWanted = true; muted = false;
      cameraFailure = ''; audioFailure = ''; desktopFailure = ''; root.hidden = false;
      remoteName.textContent = config.uid === lesson.teacherUid ? lesson.studentName : lesson.teacherName;
      leave.textContent = config.uid === lesson.teacherUid ? '结束上课' : '离开课堂'; render();
      await Promise.all([startCamera(), startAudio()]);
    },
    receive(message: any) {
      if (disposed || !current) return;
      if (message.type === 'peer') {
        peerOnline = !!message.online;
        if (!peerOnline) clearRemote(); render(); return;
      }
      const peerUid = config.uid === current.teacherUid ? current.studentUid : current.teacherUid;
      if (!connected || message.lessonId !== current._id || message.uid !== peerUid) return;
      if (message.type === 'video') {
        if (typeof message.data !== 'string' || message.data.length > MAX_VIDEO_LENGTH
          || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(message.data)
          || !Number.isSafeInteger(message.seq) || message.seq < 0) return;
        if (typeof message.streamId === 'string' && message.streamId !== remoteVideoStream) {
          remoteVideoStream = message.streamId; remoteSequence = -1;
        }
        if (message.seq <= remoteSequence || remotePending) return;
        remoteSequence = message.seq; remoteAt = Date.now(); remotePending = true; remoteVideo.src = message.data;
      } else if (message.type === 'audio') {
        if (!Number.isSafeInteger(message.seq) || message.seq < 0) return;
        if (typeof message.streamId === 'string' && message.streamId !== remoteAudioStream) {
          remoteAudioStream = message.streamId; remoteAudioSequence = -1; audio.resetReceive();
        }
        if (message.seq <= remoteAudioSequence) return;
        remoteAudioSequence = message.seq;
        audio.receive(message.seq, message.data);
      }
    },
    setConnected(value: boolean) {
      if (disposed) return;
      connected = value;
      if (!value) { peerOnline = false; release(); }
      else audio.setTransmitting(audio.ready);
      render();
    },
    openDesktop,
    stop,
    dispose() {
      if (disposed) return;
      stop(); disposed = true; win.clearInterval(captureTimer); win.clearInterval(staleTimer);
      win.removeEventListener('resize', resize); root.remove();
    },
  };
}
