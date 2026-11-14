import { microphoneError, VoiceAudio } from '../voice_call/audio';
import { createTeacherCameraBeauty, DEFAULT_TEACHER_BEAUTY, normalizeBeautySettings, type CameraBeautySettings } from './beauty';

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
  beautyFactory?: typeof createTeacherCameraBeauty;
}
type PictureInPictureWindow = Window & { document: Document };
type DesktopWindow = Window & { documentPictureInPicture?: { requestWindow(options: { width: number; height: number }): Promise<PictureInPictureWindow> } };
type PictureVideo = HTMLVideoElement & { webkitSetPresentationMode?: (mode: string) => void };
export interface LessonDesktopReservation {
  cancelled: boolean;
  claimed: boolean;
  window: PictureInPictureWindow | null;
  promise: Promise<PictureInPictureWindow>;
  timer: number;
  abort?: () => void;
}

const VIDEO_WIDTH = 1280;
const VIDEO_HEIGHT = 720;
const VIDEO_FPS = 30;
const VIDEO_INTERVAL = Math.round(1000 / VIDEO_FPS);
const VIDEO_BYTES_PER_SECOND = 3 * 1024 * 1024;
const VIDEO_FRAME_TARGET = Math.floor(VIDEO_BYTES_PER_SECOND / VIDEO_FPS) - 256;
const MAX_VIDEO_LENGTH = 262144;
const STALE_VIDEO_MS = 1800;
const PIP_STYLE = `
*{box-sizing:border-box}body{margin:0;background:#111827;color:#f8fafc;font:13px system-ui,sans-serif}
.lesson-media{position:static!important;inset:auto!important;transform:none!important;width:100%!important;max-width:none!important;max-height:100vh;overflow:auto;border:0!important;border-radius:0!important;box-shadow:none!important;background:#111827;color:#f8fafc}
.lesson-media__header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:10px 12px;font-size:13px}.lesson-media__header strong{font-size:14px}
.lesson-media__eyebrow{color:#a5b4fc;font-size:10px;margin-right:8px}.lesson-media__grid{display:grid;grid-template-columns:1fr;gap:6px;padding:0 8px}
.lesson-media__tile{position:relative;aspect-ratio:16/9;background:#243044;border-radius:9px;overflow:hidden;display:grid;place-items:center}
.lesson-media__tile video,.lesson-media__tile img,.lesson-media__tile canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.lesson-media__tile video,.lesson-media__preview{transform:scaleX(-1)}
.lesson-media__placeholder{color:#cbd5e1;font-size:12px;padding:16px;text-align:center}.lesson-media__name{position:absolute;bottom:5px;left:5px;border-radius:5px;background:#111827cc;padding:3px 6px;font-size:11px}
.lesson-media__status{font-size:11px;color:#cbd5e1;padding:7px 10px;margin:0;line-height:1.5}.lesson-media__controls{padding:0 8px 8px;display:flex;gap:5px;flex-wrap:wrap}
.lesson-media__beauty{display:grid;gap:6px;margin:8px 8px 0;padding:8px;border:1px solid #34435b;border-radius:8px}.lesson-media__beauty-title{font-size:11px;color:#cbd5e1}.lesson-media__beauty label{display:grid;grid-template-columns:30px 1fr 24px;align-items:center;gap:7px;font-size:11px}.lesson-media__beauty input{min-width:0;width:100%;height:18px;margin:0;accent-color:#a5b4fc}.lesson-media__beauty output{text-align:right;color:#cbd5e1}
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
  const localPreview = el('canvas', 'lesson-media__preview'); localPreview.dataset.lessonLocalPreview = '';
  localPreview.setAttribute('aria-label', '老师美颜预览'); localPreview.hidden = true;
  const localName = el('span', 'lesson-media__name', '我'); localTile.append(localPlaceholder, localVideo, localPreview, localName); grid.append(localTile, remoteTile);
  const beautyControls = el('div', 'lesson-media__beauty'); beautyControls.hidden = true;
  beautyControls.setAttribute('role', 'group'); beautyControls.setAttribute('aria-label', '老师摄像头美颜');
  beautyControls.append(el('strong', 'lesson-media__beauty-title', '摄像头美颜'));
  const beautySlider = (label: string, key: keyof CameraBeautySettings) => {
    const field = el('label'); field.append(el('span', '', label));
    const input = el('input'); input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '1';
    input.value = String(DEFAULT_TEACHER_BEAUTY[key]); input.dataset.lessonBeauty = key;
    input.setAttribute('aria-label', `摄像头${label}`);
    const output = el('output', '', input.value); field.append(input, output); beautyControls.append(field);
    return { input, output };
  };
  const whitening = beautySlider('美白', 'whitening'); const smoothing = beautySlider('磨皮', 'smoothing');
  const status = el('p', 'lesson-media__status'); status.dataset.lessonMediaStatus = ''; status.setAttribute('role', 'status');
  const controls = el('div', 'lesson-media__controls');
  const control = (label: string, attribute: string) => {
    const value = el('button', '', label); value.type = 'button'; value.setAttribute(attribute, ''); controls.append(value); return value;
  };
  const camera = control('开启摄像头', 'data-lesson-camera');
  const microphone = control('开启麦克风', 'data-lesson-microphone');
  const desktop = control('重新打开悬浮窗', 'data-lesson-desktop'); desktop.hidden = true;
  const retry = control('重试设备', 'data-lesson-device-retry'); retry.hidden = true;
  const leave = control('离开课堂', 'data-lesson-media-leave'); leave.className = 'is-danger';
  root.append(header, grid, beautyControls, status, controls); doc.body.append(root);

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
  let audioResuming = false;
  let cameraFailure = '';
  let audioFailure = '';
  let desktopFailure = '';
  let beautyFailure = '';
  let beautySettings: CameraBeautySettings = { ...DEFAULT_TEACHER_BEAUTY };
  let beautyProcessor: ReturnType<typeof createTeacherCameraBeauty> | null = null;
  let beautyPreview = false;
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
  let desktopReservation: LessonDesktopReservation | null = null;
  const reservations = new Set<LessonDesktopReservation>();
  let captureBudget = VIDEO_FRAME_TARGET * 2;
  let captureBudgetAt = Date.now();
  let jpegQuality = .72;
  let captureTimer = 0;
  let captureTimerWindow: Window = win;
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

  function devicePreferences(lesson: LessonMediaRoom) {
    try {
      const value = JSON.parse(win.localStorage.getItem(`onebyone.lesson.devices.v1:${config.uid}:${lesson._id}`) || 'null');
      return value && typeof value.cameraWanted === 'boolean' && typeof value.muted === 'boolean'
        ? { cameraWanted: value.cameraWanted as boolean, muted: value.muted as boolean } : undefined;
    } catch { return undefined; }
  }
  function saveDevicePreferences() {
    if (!current) return;
    try {
      win.localStorage.setItem(`onebyone.lesson.devices.v1:${config.uid}:${current._id}`,
        JSON.stringify({ cameraWanted, muted }));
    } catch { /* Optional preferences must never prevent a live class. */ }
  }
  function loadBeautyPreferences() {
    try {
      beautySettings = normalizeBeautySettings(JSON.parse(win.localStorage.getItem(`onebyone.lesson.beauty.v1:${config.uid}`) || 'null'));
    } catch { beautySettings = { ...DEFAULT_TEACHER_BEAUTY }; }
    whitening.input.value = String(beautySettings.whitening); whitening.output.textContent = whitening.input.value;
    smoothing.input.value = String(beautySettings.smoothing); smoothing.output.textContent = smoothing.input.value;
  }
  function stopBeauty() {
    beautyProcessor?.dispose(); beautyProcessor = null; beautyPreview = false; beautyFailure = ''; localPreview.hidden = true;
  }
  function localCameraFrame(): HTMLVideoElement | HTMLCanvasElement {
    if (!current || config.uid !== current.teacherUid || (!beautySettings.whitening && !beautySettings.smoothing)) {
      if (beautyPreview) { beautyPreview = false; render(); }
      return localVideo;
    }
    if (!beautyProcessor) {
      const attempt = generation;
      beautyProcessor = (options.beautyFactory || createTeacherCameraBeauty)(localPreview, message => {
        if (disposed || attempt !== generation || !current) return;
        beautyFailure = message; if (message) beautyPreview = false; render();
      });
    }
    const source = beautyProcessor.process(localVideo, beautySettings);
    const filtered = source === localPreview;
    if (filtered !== beautyPreview) { beautyPreview = filtered; render(); }
    return source;
  }
  const updateBeauty = () => {
    if (!current || config.uid !== current.teacherUid) return;
    beautySettings = normalizeBeautySettings({ whitening: Number(whitening.input.value), smoothing: Number(smoothing.input.value) });
    whitening.output.textContent = String(beautySettings.whitening); smoothing.output.textContent = String(beautySettings.smoothing);
    try { win.localStorage.setItem(`onebyone.lesson.beauty.v1:${config.uid}`, JSON.stringify(beautySettings)); } catch { /* Optional settings. */ }
    if (!beautySettings.whitening && !beautySettings.smoothing) stopBeauty();
    render();
  };
  whitening.input.addEventListener('input', updateBeauty); smoothing.input.addEventListener('input', updateBeauty);

  function render() {
    if (disposed) return;
    const cameraOn = !!cameraStream;
    localVideo.hidden = !cameraOn || beautyPreview; localPreview.hidden = !cameraOn || !beautyPreview; localPlaceholder.hidden = cameraOn;
    beautyControls.hidden = !current || config.uid !== current.teacherUid;
    camera.textContent = cameraOn ? '关闭摄像头' : '开启摄像头'; camera.setAttribute('aria-pressed', String(cameraOn)); camera.disabled = cameraStarting;
    microphone.textContent = !audio.ready ? '开启麦克风' : muted ? '打开声音' : '静音';
    microphone.setAttribute('aria-pressed', String(audio.ready && !muted)); microphone.disabled = audioStarting;
    desktop.hidden = !!pip || !!fallbackVideo || pipPending || !desktopFailure; desktop.disabled = pipPending;
    retry.hidden = !cameraFailure && !audioFailure && (!!cameraStream || !cameraWanted) && audio.ready;
    peerLabel.textContent = peerOnline ? '双方已连接' : '等待对方';
    const base = !connected ? '正在自动恢复课堂连接，恢复后继续上课。'
      : !peerOnline ? '等待对方进入课堂。' : '课堂已连接，双方可以边看边讲。';
    status.textContent = [base, cameraFailure, audioFailure, desktopFailure, beautyFailure].filter(Boolean).join(' ');
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
    stopBeauty();
    const previous = cameraStream; cameraStream = null;
    previous?.getTracks().forEach((track) => track.stop()); localVideo.srcObject = null; localVideo.hidden = true;
  }
  async function startCamera(attempt = generation) {
    if (!current || disposed || cameraStream || cameraStarting || !cameraWanted) return;
    cameraStarting = true; cameraFailure = ''; render();
    try {
      if (!win.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('摄像头需要 HTTPS 或本机 localhost 安全连接。');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        width: { ideal: VIDEO_WIDTH }, height: { ideal: VIDEO_HEIGHT }, frameRate: { ideal: 30, max: 30 }, facingMode: 'user',
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
    if (!current || disposed || audioStarting || audioResuming) return;
    if (audio.ready) audioResuming = true; else audioStarting = true;
    audio.setTransmitting(false); audioFailure = ''; render();
    try {
      await audio.start();
      if (attempt !== generation || disposed || !current || !audio.ready) return;
      audio.setMuted(muted); audio.setTransmitting(connected);
    } catch (cause) { if (attempt === generation && current) audioFailure = microphoneError(cause); }
    finally { if (attempt === generation) { audioStarting = false; audioResuming = false; render(); } }
  }
  function stopFallback() {
    win.clearInterval(compositeTimer); compositeTimer = 0;
    fallbackStream?.getTracks().forEach((track) => track.stop()); fallbackStream = null;
    if (fallbackVideo) { fallbackVideo.srcObject = null; fallbackVideo.remove(); fallbackVideo = null; }
    composite = null;
  }
  function restorePanel() {
    if (root.ownerDocument !== doc && !disposed) doc.body.append(root);
    pip = null; root.classList.remove('is-desktop'); startCaptureClock(win); render();
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
    if (!composite || !current) return;
    const context = composite.getContext('2d'); if (!context) return;
    context.fillStyle = '#111827'; context.fillRect(0, 0, 320, 408);
    const isTeacher = config.uid === current.teacherUid;
    const image = (source: CanvasImageSource, top: number, enabled: boolean) => {
      if (!enabled) return;
      try { context.drawImage(source, 0, top, 320, 180); } catch { /* First frame may still be decoding. */ }
    };
    image(beautyPreview ? localPreview : localVideo, isTeacher ? 0 : 204, !!cameraStream && localVideo.readyState >= 2);
    image(remoteVideo, isTeacher ? 204 : 0, !remoteVideo.hidden && remoteVideo.complete && remoteVideo.naturalWidth > 0);
    context.fillStyle = '#f8fafc'; context.font = '14px sans-serif';
    context.fillText(`${current.teacherName} · 老师`, 10, 198);
    context.fillText(`${current.studentName} · 学员`, 10, 402);
  }
  function cancelDesktop(reservation?: LessonDesktopReservation) {
    if (!reservation || reservation.cancelled) return;
    reservation.cancelled = true; reservations.delete(reservation); win.clearTimeout(reservation.timer); reservation.abort?.();
    if (desktopReservation === reservation) desktopReservation = null;
    try { reservation.window?.close(); } catch { /* The user may already have closed it. */ }
  }
  function prepareDesktop(): LessonDesktopReservation | undefined {
    if (disposed) return;
    const picture = (win as DesktopWindow).documentPictureInPicture;
    if (!picture?.requestWindow) return;
    const reservation: LessonDesktopReservation = { cancelled: false, claimed: false, window: null,
      promise: null as unknown as Promise<PictureInPictureWindow>, timer: 0 };
    reservations.add(reservation);
    // This call must run synchronously in the join click, before its REST await.
    try { reservation.promise = picture.requestWindow({ width: 320, height: 520 }); }
    catch (cause) { reservation.promise = Promise.reject(cause); }
    const request = reservation.promise.then(next => {
      reservation.window = next;
      if (disposed || reservation.cancelled || next.closed) { next.close(); return next; }
      const style = next.document.createElement('style'); style.textContent = PIP_STYLE; next.document.head.append(style);
      next.document.title = 'OneByOne 上课';
      const waiting = next.document.createElement('p'); waiting.textContent = '正在进入课堂…';
      waiting.style.cssText = 'padding:24px;margin:0;color:#cbd5e1'; next.document.body.append(waiting);
      next.addEventListener('pagehide', () => {
        reservation.cancelled = true; reservations.delete(reservation); win.clearTimeout(reservation.timer);
        if (desktopReservation === reservation) desktopReservation = null;
        if (pip === next) {
          desktopFailure = current ? '桌面悬浮已关闭，可点击重新打开悬浮窗。' : '';
          restorePanel();
        }
      }, { once: true });
      return next;
    });
    const cancelled = new Promise<PictureInPictureWindow>((_resolve, reject) => {
      reservation.abort = () => reject(new Error('桌面悬浮未能开启，请点击重新打开悬浮窗。'));
    });
    reservation.promise = Promise.race([request, cancelled]);
    // A rejected browser request is inspected on join, never an unhandled rejection.
    void reservation.promise.catch(() => {});
    reservation.timer = win.setTimeout(() => {
      if (!reservation.window || !reservation.claimed) cancelDesktop(reservation);
    }, 30000);
    return reservation;
  }
  async function adoptDesktop(reservation: LessonDesktopReservation, attempt = generation) {
    reservation.claimed = true; desktopReservation = reservation;
    desktopFailure = ''; pipPending = true; render();
    try {
      const next = await reservation.promise;
      win.clearTimeout(reservation.timer);
      if (disposed || reservation.cancelled || next.closed || !current || generation !== attempt
        || desktopReservation !== reservation) {
        if (!disposed && current && generation === attempt && (reservation.cancelled || next.closed)) {
          desktopFailure = '桌面悬浮已关闭，可点击重新打开悬浮窗。';
        }
        cancelDesktop(reservation); return;
      }
      pip = next; next.document.body.replaceChildren(root); root.classList.add('is-desktop'); startCaptureClock(next);
    } catch (cause: any) {
      if (attempt === generation && current && !disposed) {
        desktopFailure = cause?.name === 'NotAllowedError'
          ? '浏览器拦截了桌面悬浮，请点击重新打开悬浮窗。' : cause?.message || '桌面悬浮未能开启，请点击重新打开悬浮窗。';
      }
      cancelDesktop(reservation);
    } finally { if (attempt === generation) { pipPending = false; render(); } }
  }
  async function openDesktop() {
    if (!current || disposed || pipPending || pip || fallbackVideo) return;
    const attempt = generation;
    const reservation = prepareDesktop();
    if (reservation) { await adoptDesktop(reservation, attempt); return; }
    desktopFailure = ''; pipPending = true; render();
    try {
      // Standard video PiP displays a live, vertical canvas containing both cameras.
      composite = doc.createElement('canvas'); composite.width = 320; composite.height = 408;
      if (!composite.captureStream) throw new Error('当前浏览器不支持桌面悬浮，请使用支持画中画的浏览器。');
      const video = el('video', 'lesson-media__pip-composite') as PictureVideo;
      video.muted = true; video.autoplay = true; video.playsInline = true;
      if (!video.requestPictureInPicture && !video.webkitSetPresentationMode) throw new Error('当前浏览器不支持桌面悬浮，请使用支持画中画的浏览器。');
      fallbackStream = composite.captureStream(VIDEO_FPS); video.srcObject = fallbackStream; fallbackVideo = video; root.append(video);
      drawComposite(); compositeTimer = win.setInterval(drawComposite, VIDEO_INTERVAL);
      await video.play();
      if (disposed || generation !== attempt || !current) { stopFallback(); return; }
      video.addEventListener('leavepictureinpicture', () => {
        stopFallback(); desktopFailure = current ? '桌面悬浮已关闭，可点击重新打开悬浮窗。' : ''; render();
      }, { once: true });
      video.addEventListener('webkitpresentationmodechanged', () => {
        if ((video as PictureVideo & { webkitPresentationMode?: string }).webkitPresentationMode === 'inline') {
          stopFallback(); desktopFailure = current ? '桌面悬浮已关闭，可点击重新打开悬浮窗。' : ''; render();
        }
      });
      if (video.requestPictureInPicture) await video.requestPictureInPicture();
      else video.webkitSetPresentationMode!('picture-in-picture');
      if (disposed || generation !== attempt || !current) closeDesktop();
    } catch (cause: any) {
      closeDesktop();
      desktopFailure = cause?.name === 'NotAllowedError' ? '浏览器拦截了桌面悬浮，请点击重新打开悬浮窗。'
        : cause?.message || '桌面悬浮未能开启，请点击重新打开悬浮窗。';
    } finally { if (attempt === generation) { pipPending = false; render(); } }
  }
  function release(preserve?: LessonDesktopReservation) {
    for (const reservation of reservations) if (reservation !== preserve) cancelDesktop(reservation);
    generation++; cameraStarting = false; audioStarting = false; audioResuming = false; pipPending = false;
    stopCamera(); audio.stop(); clearRemote(); closeDesktop();
  }
  function stop(preserve?: LessonDesktopReservation) {
    release(preserve); current = null; connected = false; peerOnline = false; root.hidden = true;
  }
  camera.addEventListener('click', () => {
    if (!current) return;
    if (cameraStream) { cameraWanted = false; saveDevicePreferences(); stopCamera(); cameraFailure = ''; render(); }
    else if (connected) { cameraWanted = true; saveDevicePreferences(); void startCamera(); }
  });
  microphone.addEventListener('click', () => {
    if (!current) return;
    if (!audio.ready) { if (connected) { muted = false; saveDevicePreferences(); void startAudio(); } }
    else { muted = !muted; saveDevicePreferences(); audio.setMuted(muted); render(); }
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
  function captureFrame() {
    if (!current || disposed || !cameraStream || localVideo.readyState < 2) return;
    const frame = localCameraFrame();
    if (!connected) return;
    const now = Date.now();
    captureBudget = Math.min(VIDEO_FRAME_TARGET * 2,
      captureBudget + Math.max(0, now - captureBudgetAt) * VIDEO_BYTES_PER_SECOND / 1000);
    captureBudgetAt = now;
    const limit = Math.min(VIDEO_FRAME_TARGET, Math.floor(captureBudget) - 256);
    if (limit < 2048) return;
    try {
      let data = '';
      let quality = jpegQuality;
      // Keep a steady cadence within a byte budget instead of queuing large frames.
      for (const [width, height] of [[VIDEO_WIDTH, VIDEO_HEIGHT], [960, 540], [640, 360]]) {
        if (captureCanvas.width !== width) captureCanvas.width = width;
        if (captureCanvas.height !== height) captureCanvas.height = height;
        captureContext ||= captureCanvas.getContext('2d'); if (!captureContext) return;
        captureContext.drawImage(frame, 0, 0, width, height);
        for (let attempt = 0; attempt < 4; attempt++) {
          data = captureCanvas.toDataURL('image/jpeg', quality);
          if (data.length <= limit) break;
          quality = Math.max(.18, quality * .7);
        }
        if (data.length <= limit) break;
        quality = .4;
      }
      if (data.length > limit || data.length > MAX_VIDEO_LENGTH) return;
      if (options.send({ type: 'video', lessonId: current._id, seq: sequence++, data })) {
        captureBudget -= data.length + 256;
        jpegQuality = Math.min(.72, quality + .02);
      }
    } catch { /* Drop an undecoded or oversize frame, never queue stale video. */ }
  }
  function startCaptureClock(host: Window) {
    try { captureTimerWindow.clearInterval(captureTimer); } catch { /* Its desktop window may already be gone. */ }
    captureTimerWindow = host;
    if (!disposed) captureTimer = host.setInterval(captureFrame, VIDEO_INTERVAL);
  }
  startCaptureClock(win);
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
    async start(lesson: LessonMediaRoom, reservation?: LessonDesktopReservation) {
      if (disposed) return;
      stop(reservation); current = lesson;
      const preferences = devicePreferences(lesson);
      cameraWanted = preferences?.cameraWanted ?? true; muted = preferences?.muted ?? false;
      cameraFailure = ''; audioFailure = ''; desktopFailure = ''; root.hidden = false;
      const isTeacher = config.uid === lesson.teacherUid;
      if (isTeacher) loadBeautyPreferences();
      localName.textContent = `${isTeacher ? lesson.teacherName : lesson.studentName} · ${isTeacher ? '老师' : '学员'}`;
      remoteName.textContent = `${isTeacher ? lesson.studentName : lesson.teacherName} · ${isTeacher ? '学员' : '老师'}`;
      localTile.dataset.lessonParticipant = isTeacher ? 'teacher' : 'student';
      remoteTile.dataset.lessonParticipant = isTeacher ? 'student' : 'teacher';
      grid.replaceChildren(...(isTeacher ? [localTile, remoteTile] : [remoteTile, localTile]));
      captureBudget = VIDEO_FRAME_TARGET * 2; captureBudgetAt = Date.now(); jpegQuality = .72;
      leave.textContent = config.uid === lesson.teacherUid ? '结束上课' : '离开课堂'; render();
      if (reservation) void adoptDesktop(reservation); else void openDesktop();
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
      const wasConnected = connected;
      connected = value && !!current;
      // Renewing a transport lease does not end the accepted classroom or
      // discard devices that the user has already permitted for this class.
      if (!connected) { peerOnline = false; audio.setTransmitting(false); clearRemote(); }
      else {
        if (!wasConnected && audio.ready) void startAudio();
        else if (!audioResuming) audio.setTransmitting(audio.ready);
      }
      render();
    },
    prepareDesktop,
    cancelDesktop,
    openDesktop,
    stop,
    dispose() {
      if (disposed) return;
      stop(); disposed = true;
      try { captureTimerWindow.clearInterval(captureTimer); } catch { /* Its desktop window may already be gone. */ }
      win.clearInterval(staleTimer);
      win.removeEventListener('resize', resize); root.remove();
    },
  };
}
