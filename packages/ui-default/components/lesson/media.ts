import { microphoneError, VoiceAudio } from '../voice_call/audio';
import { macBrowser, macSystemPermission, mountLessonDeviceGuides, permissionDenied } from '../voice_call/permission_guide';
import { watchLostDevice } from './device_recovery';
import { createTeacherCameraBeauty, DEFAULT_TEACHER_BEAUTY, normalizeBeautySettings, type CameraBeautySettings } from './beauty';
import { LessonCameraFlow } from './camera_flow';
import { mountLessonScreen, SCREEN_INTERVAL, type LessonEntryScreen } from './screen';

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
  canSendCamera?(): boolean;
  canSendScreen?(): boolean;
  onLeave(confirmation?: { confirmed: boolean; lessonId: string }): void;
  audioFactory?: (options: ConstructorParameters<typeof VoiceAudio>[0]) => VoiceAudio;
  beautyFactory?: typeof createTeacherCameraBeauty;
}
type PictureInPictureWindow = Window & { document: Document };
type DesktopWindow = Window & { documentPictureInPicture?: { requestWindow(options: { width: number; height: number; preferInitialWindowPlacement?: boolean }): Promise<PictureInPictureWindow> } };
type PictureVideo = HTMLVideoElement & {
  webkitPresentationMode?: string;
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
};
export interface LessonDesktopReservation {
  cancelled: boolean;
  claimed: boolean;
  window: PictureInPictureWindow | null;
  promise: Promise<PictureInPictureWindow>;
  timer: number;
  abort?: () => void;
}

const VIDEO_WIDTH = 960;
const VIDEO_HEIGHT = 540;
const VIDEO_FPS = 25;
const VIDEO_INTERVAL = Math.round(1000 / VIDEO_FPS);
const VIDEO_BYTES_PER_SECOND = 3 * 1024 * 1024;
const VIDEO_FRAME_TARGET = Math.floor(VIDEO_BYTES_PER_SECOND / VIDEO_FPS) - 256;
const MAX_VIDEO_LENGTH = 262144;
const STALE_VIDEO_MS = 1800;
const PIP_STYLE = `
*{box-sizing:border-box}body{margin:0;background:#111827;color:#f8fafc;font:13px system-ui,sans-serif}
.lesson-media{position:relative!important;inset:auto!important;transform:none!important;display:flex;flex-direction:column;width:100%!important;max-width:none!important;height:100vh;max-height:100vh;overflow:hidden;border:0!important;border-radius:0!important;box-shadow:none!important;background:#111827;color:#f8fafc}
.lesson-media__header{display:flex;flex-shrink:0;align-items:center;justify-content:space-between;gap:8px;padding:5px 8px;font-size:12px}.lesson-media__header strong{font-size:13px}.lesson-media__content{display:flex;flex-direction:column;min-height:0;overflow:auto;flex:1 1 auto;scrollbar-width:thin}.lesson-media__content>*{flex-shrink:0}
.lesson-media__eyebrow{color:#a5b4fc;font-size:10px;margin-right:6px}.lesson-media__peer{font-size:10px;color:#cbd5e1}.lesson-media__grid{display:flex;flex-direction:column;flex:1 0 auto;gap:1px;width:100%}
.lesson-media__tile{position:relative;flex:1 1 0;min-width:0;min-height:58px;background:#243044;overflow:hidden;display:grid;place-items:center}
.lesson-media__tile video,.lesson-media__tile img,.lesson-media__tile canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.lesson-media__tile video,.lesson-media__preview{transform:scaleX(-1)}
.lesson-media__tile img[data-lesson-remote-screen]{object-fit:contain;transform:none;background:#0b1220}.lesson-media__tile.is-screen .lesson-media__name{max-width:calc(100% - 42px)}
.lesson-media__name{z-index:2;max-width:calc(100% - 90px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lesson-media__screen-consent{margin:6px 8px;padding:8px;border:1px solid #64748b;border-radius:8px;background:#1e293b;font-size:11px;line-height:1.5}.lesson-media__screen-consent strong{display:block;font-size:12px}.lesson-media__screen-consent p{margin:4px 0 6px;color:#cbd5e1}.lesson-media__screen-actions{display:flex;gap:5px;flex-wrap:wrap}.lesson-media__screen-actions button{border:1px solid #64748b;border-radius:6px;background:#334155;color:#f8fafc;padding:5px 7px;font:inherit;cursor:pointer}.lesson-media__screen-actions button:first-child{background:#4338ca}.lesson-media__screen-status{font-size:10px;line-height:1.5;margin:5px 10px;color:#cbd5e1}.lesson-media__icon[data-lesson-screen-toggle][aria-pressed="true"]{background:#4338ca}.lesson-media__icon[data-lesson-screen-stop]{background:#7f1d1de8;color:#fecaca}
.lesson-media__placeholder{color:#cbd5e1;font-size:12px;padding:16px;text-align:center}.lesson-media__name{position:absolute;bottom:5px;left:5px;border-radius:5px;background:#111827cc;padding:3px 6px;font-size:11px}
.lesson-media__status{font-size:11px;color:#cbd5e1;padding:6px 10px;margin:0;line-height:1.5}.lesson-media__controls{position:relative;z-index:5;flex-shrink:0;padding:8px;display:flex;gap:5px;flex-wrap:wrap;background:#111827;border-top:1px solid #34435b}
.lesson-media__tile-controls{position:absolute;bottom:5px;right:5px;z-index:4;display:flex;gap:4px}.lesson-media__icon{display:grid;place-items:center;width:28px;height:28px;padding:5px;margin:0;border:1px solid #ffffff40;border-radius:7px;background:#111827db;color:#f8fafc;cursor:pointer}.lesson-media__icon svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.lesson-media__icon[data-state="off"]{color:#fecaca;background:#7f1d1de8;border-color:#f8717180}.lesson-media__icon[data-state="on"] .lesson-media__icon-slash{display:none}.lesson-media__icon[aria-expanded="true"]{background:#4338ca}.lesson-media__icon:disabled{opacity:.55;cursor:wait}
.lesson-media__beauty{display:grid;gap:5px;padding:8px;border:1px solid #475569;border-radius:8px;background:#1e293b}.lesson-media__beauty-title{font-size:11px;color:#e2e8f0}.lesson-media__beauty label{display:grid;grid-template-columns:26px 1fr 22px;align-items:center;gap:5px;font-size:11px;color:#f8fafc}.lesson-media__beauty input{min-width:0;width:100%;height:18px;margin:0;accent-color:#a5b4fc}.lesson-media__beauty output{text-align:right;color:#cbd5e1}
.lesson-media__controls button,.lesson-media__exit-actions button{border:1px solid #475569;background:#263449;color:#f8fafc;font:inherit;border-radius:6px;padding:6px 8px;cursor:pointer;font-size:11px}.lesson-media .is-danger{background:#b91c1c;border-color:#dc2626}.lesson-media button:focus-visible{outline:2px solid #a5b4fc;outline-offset:2px}
.lesson-media__exit{position:absolute;inset:0;z-index:20;display:grid;place-items:center;padding:14px;background:#0f172aeb}.lesson-media__exit-card{width:100%;padding:16px 12px;border:1px solid #64748b;border-radius:12px;background:#1e293b}.lesson-media__exit-card strong{font-size:16px}.lesson-media__exit-card p{font-size:12px;line-height:1.7;color:#cbd5e1;margin:12px 0 18px}.lesson-media__exit-actions{display:flex;gap:8px;justify-content:flex-end}
.lesson-media__tile.is-compact{flex:0 0 40px;min-height:40px}.is-compact .lesson-media__name,.is-compact .lesson-media__placeholder{position:absolute;left:6px;right:var(--controls-space,6px);max-width:none;padding:0;line-height:14px;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.is-compact .lesson-media__name{top:4px;bottom:auto;background:transparent}.is-compact .lesson-media__placeholder{bottom:4px;font-size:10px}
@media(min-aspect-ratio:3/2) and (min-width:320px){.lesson-media__grid.has-two-pictures{flex-direction:row}.lesson-media__grid.has-two-pictures .lesson-media__tile{min-width:0}}
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
  function createScreenImage() {
    const image = remoteTile.ownerDocument.createElement('img'); image.dataset.lessonRemoteScreen = ''; image.hidden = true;
    image.alt = '学员授权共享的整个电脑屏幕'; image.draggable = false; return image;
  }
  let remoteScreen = createScreenImage(); remoteTile.append(remoteScreen);
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
  const eyeBrightening = beautySlider('亮眼', 'eyeBrightening');
  const status = el('p', 'lesson-media__status'); status.dataset.lessonMediaStatus = ''; status.setAttribute('role', 'status');
  const controls = el('div', 'lesson-media__controls');
  const control = (label: string, attribute: string) => {
    const value = el('button', '', label); value.type = 'button'; value.setAttribute(attribute, ''); controls.append(value); return value;
  };
  const camera = control('开启摄像头', 'data-lesson-camera');
  const microphone = control('开启麦克风', 'data-lesson-microphone');
  const tileControls = el('div', 'lesson-media__tile-controls');
  const beautyToggle = el('button', 'lesson-media__icon'); beautyToggle.type = 'button'; beautyToggle.dataset.lessonBeautyToggle = '';
  beautyToggle.setAttribute('aria-label', '调节摄像头美颜'); beautyToggle.title = '调节摄像头美颜'; beautyToggle.setAttribute('aria-expanded', 'false');
  const icon = (button: HTMLButtonElement, path: string, toggle = false) => {
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const shape = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); shape.setAttribute('d', path); svg.append(shape);
    if (toggle) {
      const slash = doc.createElementNS('http://www.w3.org/2000/svg', 'path'); slash.setAttribute('d', 'M4 4 20 20');
      slash.classList.add('lesson-media__icon-slash'); svg.append(slash);
    }
    button.replaceChildren(svg); button.classList.add('lesson-media__icon');
  };
  icon(camera, 'M4 7h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm12 3 6-3v10l-6-3', true);
  icon(microphone, 'M9 5a3 3 0 0 1 6 0v7a3 3 0 0 1-6 0V5Zm-3 6v1a6 6 0 0 0 12 0v-1M12 18v4m-4 0h8', true);
  icon(beautyToggle, 'm12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4L12 3Zm7-2v4m-2-2h4');
  tileControls.append(camera, microphone, beautyToggle); localTile.append(tileControls);
  const screenToggle = el('button', 'lesson-media__icon'); screenToggle.type = 'button'; screenToggle.dataset.lessonScreenToggle = '';
  icon(screenToggle, 'M3 4h18v13H3zM12 17v4m-4 0h8');
  const remoteControls = el('div', 'lesson-media__tile-controls'); remoteControls.append(screenToggle); remoteTile.append(remoteControls);
  const screenStop = el('button', 'lesson-media__icon'); screenStop.type = 'button'; screenStop.dataset.lessonScreenStop = '';
  screenStop.title = '停止共享整个屏幕'; screenStop.setAttribute('aria-label', '停止共享整个屏幕');
  icon(screenStop, 'M3 4h18v13H3zM12 17v4m-4 0h8M4 3l16 18'); tileControls.append(screenStop);
  const screenConsent = el('div', 'lesson-media__screen-consent'); screenConsent.dataset.lessonScreenConsent = ''; screenConsent.hidden = true;
  screenConsent.setAttribute('role', 'group'); screenConsent.setAttribute('aria-label', '学员屏幕共享授权');
  const screenHeading = el('strong');
  screenConsent.append(screenHeading, el('p', '', '点击后请选择“整个屏幕”。你可以随时停止共享。'));
  const screenActions = el('div', 'lesson-media__screen-actions');
  const shareScreen = el('button', '', '选择整个屏幕'); shareScreen.type = 'button'; shareScreen.dataset.lessonScreenShare = '';
  const declineScreen = el('button', '', '暂不共享'); declineScreen.type = 'button'; declineScreen.dataset.lessonScreenDecline = '';
  const screenPage = el('button', '', '回页面授权'); screenPage.type = 'button'; screenPage.dataset.lessonScreenOpenPage = ''; screenPage.hidden = true;
  screenActions.append(shareScreen, declineScreen, screenPage); screenConsent.append(screenActions);
  const screenStatus = el('p', 'lesson-media__screen-status'); screenStatus.dataset.lessonScreenStatus = ''; screenStatus.setAttribute('role', 'status'); screenStatus.hidden = true;
  const desktop = control('重新打开悬浮窗', 'data-lesson-desktop'); desktop.hidden = true;
  const retry = control('重试设备', 'data-lesson-device-retry'); retry.hidden = true;
  const outputRetry = control('点一下，听课堂声音', 'data-lesson-resume-sound'); outputRetry.hidden = true;
  outputRetry.addEventListener('click', () => { void restoreOutput(); });
  const leave = control('离开课堂', 'data-lesson-media-leave'); leave.className = 'is-danger';
  const exitOverlay = el('div', 'lesson-media__exit'); exitOverlay.hidden = true; exitOverlay.dataset.lessonExitDialog = '';
  exitOverlay.setAttribute('role', 'dialog'); exitOverlay.setAttribute('aria-modal', 'true'); exitOverlay.setAttribute('aria-label', '确认退出课堂');
  const exitCard = el('div', 'lesson-media__exit-card'); const exitTitle = el('strong'); const exitDetail = el('p');
  const exitActions = el('div', 'lesson-media__exit-actions');
  const exitCancel = el('button', '', '继续上课'); exitCancel.type = 'button'; exitCancel.dataset.lessonExitCancel = '';
  const exitConfirm = el('button', 'is-danger', '确认退出'); exitConfirm.type = 'button'; exitConfirm.dataset.lessonExitConfirm = '';
  exitActions.append(exitCancel, exitConfirm); exitCard.append(exitTitle, exitDetail, exitActions); exitOverlay.append(exitCard);
  const content = el('div', 'lesson-media__content'); content.append(grid, screenConsent, screenStatus, status);
  const browser = macBrowser(win.navigator);
  const macScreenHelp = el('details', 'lesson-media__screen-consent');
  if (browser) {
    macScreenHelp.hidden = true;
    macScreenHelp.append(el('summary', '', '在 Mac 上检查屏幕录制权限'));
    if (browser === 'Safari') macScreenHelp.append(el('p', '', '在「Safari 浏览器 → 设置 → 网站 → 屏幕共享」中，把课堂网站设为「询问」或「请求」。'));
    macScreenHelp.append(el('p', '', macSystemPermission(browser, '屏幕录制')), el('p', '', '设置好后回到课堂，点「选择整个屏幕」。'));
    screenStatus.after(macScreenHelp);
  }
  const deviceHelp = el('div'); content.insertBefore(deviceHelp, status);
  const deviceGuides = mountLessonDeviceGuides(deviceHelp,
    () => { recoverAudio.clear(); void startAudio(); },
    () => { recoverCamera.clear(); void startCamera(); });
  root.append(header, content, controls, exitOverlay); doc.body.append(root);

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
  let inputPaused = false;
  let desktopFailure = '';
  let openDesktopManually = false;
  let beautyFailure = '';
  let beautySettings: CameraBeautySettings = { ...DEFAULT_TEACHER_BEAUTY };
  let beautyProcessor: ReturnType<typeof createTeacherCameraBeauty> | null = null;
  let beautyPreview = false;
  let beautyExpanded = false;
  let beautyDesktopSize: { window: PictureInPictureWindow; width: number; height: number } | null = null;
  let exitLessonId = '';
  let sequence = Date.now() * 100;
  let remoteSequence = -1;
  let remoteAudioSequence = -1;
  let remoteAudioStream = '';
  let remoteVideoStream = '';
  let remoteAt = 0;
  let remotePending = false;
  let decodingTicket: number | undefined;
  let newestVideo: { data: string; ticket?: number } | null = null;
  const cameraFlow = new LessonCameraFlow();
  let negotiatedFlow = false;
  let authoritativePeer = '';
  let remoteReady = false;
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
  let screenTimer = 0;
  let captureTimerWindow: Window = win;
  let fallbackVideo: PictureVideo | null = null;
  let fallbackStream: MediaStream | null = null;
  let composite: HTMLCanvasElement | null = null;
  let compositeTimer = 0;
  const captureCanvas = doc.createElement('canvas'); captureCanvas.width = VIDEO_WIDTH; captureCanvas.height = VIDEO_HEIGHT;
  let captureContext: CanvasRenderingContext2D | null = null;
  let screen: ReturnType<typeof mountLessonScreen> | undefined;
  screen = mountLessonScreen(config, {
    send: options.send, canSendPicture: options.canSendScreen, onChange: () => { if (screen) render(); },
    async preparePicture(data) {
      const image = createScreenImage(); image.src = data; await image.decode();
      return () => { remoteScreen.replaceWith(image); remoteScreen = image; };
    },
  });
  let separateCallActive = win.__onebyoneVoiceAudioUid === config.uid;
  function renewCameraWindow() {
    if (current && connected && peerOnline && negotiatedFlow) {
      cameraFlow.request((seq, level, seen) => options.send({ type: 'camera-window', lessonId: current!._id, seq, level, seen }));
    }
  }
  const audioOptions = {
    onInputEnded: microphoneLost,
    onInputPaused(paused: boolean) { inputPaused = paused; if (current && !disposed) render(); },
    onPlaybackPaused(paused: boolean) { if (current && !disposed) outputRetry.hidden = !paused; },
    onFrame(data: string) {
      if (!current || !connected || disposed || separateCallActive) return;
      renewCameraWindow();
      const ticket = negotiatedFlow ? cameraFlow.speechTicket() : undefined;
      if (ticket !== null) options.send({ type: 'audio', lessonId: current._id, seq: sequence++, data, ...(ticket !== undefined && { ticket }) });
    },
    onSetupState(state: string) {
      if (!current || disposed) return;
      if (state === 'microphone-pending') deviceGuides.microphone.begin();
      if (state === 'microphone-granted') deviceGuides.microphone.granted();
    },
    onError(cause: Error) {
      audioFailure = microphoneError(cause); audio.stop(); outputRetry.hidden = !current; render();
    },
  };
  const audio = options.audioFactory ? options.audioFactory(audioOptions) : new VoiceAudio(audioOptions);
  async function restoreOutput() {
    if (!current || disposed || !audio.listen || separateCallActive) return;
    const attempt = generation;
    try { await audio.listen(); if (attempt === generation) outputRetry.hidden = true; }
    catch { if (attempt === generation) outputRetry.hidden = false; }
  }
  function syncCallAudio() {
    const active = win.__onebyoneVoiceAudioUid === config.uid;
    if (active === separateCallActive) return;
    separateCallActive = active;
    // Drop already scheduled speech so the two conversations cannot overlap.
    audio.resetReceive();
    audio.setTransmitting(!!current && connected && audio.ready && !active && !audioResuming);
    if (!active && current) void restoreOutput();
    if (current) render();
  }
  win.addEventListener('onebyone:voice-audio-change', syncCallAudio);
  const canRecover = () => !!current && connected && !disposed && (!doc.hidden || !!pip && !pip.closed);
  const recoverCamera = watchLostDevice('camera', {
    active: () => canRecover() && cameraWanted && !cameraStream,
    restart: async () => { await startCamera(); return !!cameraStream; }, denied: deviceGuides.camera.blocked,
  });
  const recoverAudio = watchLostDevice('microphone', {
    active: () => canRecover() && !muted && !audio.ready,
    restart: async () => { await startAudio(); return audio.ready; }, denied: deviceGuides.microphone.blocked,
  });

  function cameraLost(stream: MediaStream) {
    if (cameraStream !== stream) return;
    stopCamera(); cameraFailure = '摄像头已断开。接好设备后，可点摄像头按钮重新开启。';
    render(); recoverCamera.lost();
  }
  function microphoneLost() {
    if (!current || disposed) return;
    audio.releaseInput(); audioFailure = '麦克风已断开。接好设备后，可点麦克风按钮重新开启。';
    render(); recoverAudio.lost();
  }
  function checkDevices() {
    if (!canRecover()) return;
    if (cameraStream?.getVideoTracks().some(track => track.readyState === 'ended')) cameraLost(cameraStream);
    if (audio.inputEnded) microphoneLost();
    if (audio.needsResume) void restoreOutput();
    if (cameraStream && localVideo.paused) void localVideo.play().catch(() => {});
    void recoverCamera.check(); void recoverAudio.check();
  }
  doc.addEventListener('visibilitychange', checkDevices);
  win.addEventListener('pageshow', checkDevices);
  win.addEventListener('focus', checkDevices);
  win.navigator.mediaDevices?.addEventListener?.('devicechange', checkDevices);

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
    eyeBrightening.input.value = String(beautySettings.eyeBrightening); eyeBrightening.output.textContent = eyeBrightening.input.value;
  }
  function stopBeauty() {
    beautyProcessor?.dispose(); beautyProcessor = null; beautyPreview = false; beautyFailure = ''; localPreview.hidden = true;
  }
  function localCameraFrame(): HTMLVideoElement | HTMLCanvasElement {
    if (!current || config.uid !== current.teacherUid || (!beautySettings.whitening && !beautySettings.smoothing && !beautySettings.eyeBrightening)) {
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
    beautySettings = normalizeBeautySettings({ whitening: Number(whitening.input.value), smoothing: Number(smoothing.input.value), eyeBrightening: Number(eyeBrightening.input.value) });
    whitening.output.textContent = String(beautySettings.whitening); smoothing.output.textContent = String(beautySettings.smoothing);
    eyeBrightening.output.textContent = String(beautySettings.eyeBrightening);
    try { win.localStorage.setItem(`onebyone.lesson.beauty.v1:${config.uid}`, JSON.stringify(beautySettings)); } catch { /* Optional settings. */ }
    if (!beautySettings.whitening && !beautySettings.smoothing && !beautySettings.eyeBrightening) stopBeauty();
    render();
  };
  whitening.input.addEventListener('input', updateBeauty); smoothing.input.addEventListener('input', updateBeauty);
  eyeBrightening.input.addEventListener('input', updateBeauty);

  function render() {
    if (disposed) return;
    const cameraOn = !!cameraStream;
    localVideo.hidden = !cameraOn || beautyPreview; localPreview.hidden = !cameraOn || !beautyPreview; localPlaceholder.hidden = cameraOn;
    const isTeacher = !!current && config.uid === current.teacherUid;
    const screenState = screen!.snapshot();
    const showingScreen = isTeacher && screenState.watching && !!screenState.remoteSource;
    const remotePicture = remoteReady || showingScreen;
    localTile.classList.toggle('is-compact', !cameraOn && remotePicture);
    remoteTile.classList.toggle('is-compact', !remotePicture && cameraOn);
    grid.classList.toggle('has-two-pictures', cameraOn && remotePicture && !beautyExpanded);
    remoteTile.classList.toggle('is-screen', showingScreen);
    remoteVideo.hidden = !remoteReady || showingScreen; remotePlaceholder.hidden = remoteReady || showingScreen;
    remoteScreen.hidden = !showingScreen;
    if (showingScreen) { if (remoteScreen.getAttribute('src') !== screenState.remoteSource) remoteScreen.src = screenState.remoteSource!; }
    else remoteScreen.removeAttribute('src');
    remoteName.textContent = current ? `${isTeacher ? current.studentName : current.teacherName} · ${showingScreen ? '屏幕' : isTeacher ? '学员' : '老师'}` : '对方';
    screenToggle.hidden = !isTeacher;
    screenToggle.disabled = !connected || !peerOnline;
    const screenLabel = screenState.watching ? '返回学员摄像头' : '查看学员整个屏幕';
    screenToggle.title = screenLabel; screenToggle.setAttribute('aria-label', screenLabel);
    screenToggle.setAttribute('aria-pressed', String(screenState.watching));
    screenStop.hidden = isTeacher || !screenState.sharing;
    localTile.style.setProperty('--controls-space', isTeacher || screenState.sharing ? '102px' : '70px');
    remoteTile.style.setProperty('--controls-space', isTeacher ? '38px' : '6px');
    screenHeading.textContent = screenState.requested ? '老师请求查看你的整个屏幕' : '为这节课准备屏幕共享';
    screenConsent.hidden = isTeacher || (!screenState.requested && !screenState.starting && !screenState.entryRetry && !screenState.needsPageAuthorization);
    shareScreen.disabled = screenState.starting || (!screenState.entryRetry && (!connected || !peerOnline));
    shareScreen.textContent = screenState.starting ? '正在等待授权…' : '选择整个屏幕';
    declineScreen.disabled = screenState.starting;
    screenPage.hidden = !pip || !screenState.needsPageAuthorization;
    screenStatus.textContent = screenState.statusText || screenState.error;
    screenStatus.hidden = !screenStatus.textContent;
    if (browser) {
      macScreenHelp.hidden = !screenState.permissionHelp;
      if (macScreenHelp.hidden) macScreenHelp.open = false;
    }
    beautyToggle.hidden = !isTeacher; beautyControls.hidden = !isTeacher || !beautyExpanded;
    beautyToggle.setAttribute('aria-expanded', String(isTeacher && beautyExpanded));
    const cameraLabel = cameraOn ? '摄像头已开启，点击关闭' : '摄像头已关闭，点击开启';
    camera.title = cameraLabel; camera.setAttribute('aria-label', cameraLabel); camera.dataset.state = cameraOn ? 'on' : 'off';
    camera.setAttribute('aria-pressed', String(cameraOn)); camera.disabled = cameraStarting;
    const microphoneLabel = !audio.ready ? '麦克风未开启，点击开启' : muted ? '麦克风已静音，点击取消静音' : '麦克风已开启，点击静音';
    microphone.title = microphoneLabel; microphone.setAttribute('aria-label', microphoneLabel); microphone.dataset.state = audio.ready && !muted ? 'on' : 'off';
    microphone.setAttribute('aria-pressed', String(audio.ready && !muted)); microphone.disabled = audioStarting;
    desktop.hidden = !!pip || !!fallbackVideo || pipPending || (!openDesktopManually && !desktopFailure);
    desktop.textContent = openDesktopManually && !desktopFailure ? '打开悬浮窗' : '重新打开悬浮窗'; desktop.disabled = pipPending;
    retry.hidden = !cameraFailure && !audioFailure && (!!cameraStream || !cameraWanted) && audio.ready;
    peerLabel.textContent = peerOnline ? '双方已连接' : '等待对方';
    const base = !connected ? '正在恢复连接…' : separateCallActive ? '独立语音通话中，挂断后自动恢复课堂声音。' : '';
    const inputStatus = inputPaused && !muted && !separateCallActive ? '麦克风暂时收不到声音，请检查耳机连接或系统的输入设备。' : '';
    status.textContent = [base, cameraFailure, audioFailure, inputStatus, desktopFailure, beautyFailure].filter(Boolean).join(' ');
    status.hidden = !status.textContent;
  }
  function clearRemote() {
    newestVideo = null; decodingTicket = undefined; cameraFlow.reset();
    remoteAt = 0; remotePending = false; remoteReady = false; remoteSequence = -1;
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
      deviceGuides.camera.begin();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: {
        width: { ideal: VIDEO_WIDTH }, height: { ideal: VIDEO_HEIGHT }, frameRate: { ideal: VIDEO_FPS, max: VIDEO_FPS }, facingMode: 'user',
      } });
      if (attempt !== generation || disposed || !current || !cameraWanted) { stream.getTracks().forEach((track) => track.stop()); return; }
      deviceGuides.camera.granted();
      cameraStream = stream; localVideo.srcObject = stream;
      for (const track of stream.getVideoTracks()) track.addEventListener('ended', () => cameraLost(stream));
      try { await localVideo.play(); } catch { /* A muted preview may become ready after metadata arrives. */ }
    } catch (cause) {
      if (attempt === generation && current) {
        cameraFailure = browser && permissionDenied(cause) ? '摄像头还没有打开。' : cameraError(cause);
        if (permissionDenied(cause)) deviceGuides.camera.blocked(); else deviceGuides.camera.hide();
      }
    }
    finally { if (attempt === generation) { cameraStarting = false; render(); } }
  }
  async function startAudio(attempt = generation) {
    if (!current || disposed || audioStarting || audioResuming) return;
    if (!audio.ready) void restoreOutput();
    if (audio.ready) audioResuming = true; else audioStarting = true;
    audio.setTransmitting(false); audioFailure = ''; render();
    try {
      await audio.start();
      if (attempt !== generation || disposed || !current || !audio.ready) return;
      deviceGuides.microphone.granted();
      audio.setMuted(muted); audio.setTransmitting(connected && !separateCallActive);
    } catch (cause) {
      if (attempt === generation && current) {
        audioFailure = browser && permissionDenied(cause) ? '麦克风还没有打开。' : microphoneError(cause);
        if (permissionDenied(cause)) deviceGuides.microphone.blocked();
        else if ((cause as Error)?.name === 'VoicePlaybackBlockedError') deviceGuides.microphone.playbackBlocked();
        else deviceGuides.microphone.hide();
      }
    }
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
    beautyDesktopSize = null; beautyExpanded = false;
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
    const isTeacher = config.uid === current.teacherUid;
    const local = cameraStream && localVideo.readyState >= 2 ? (beautyPreview ? localPreview : localVideo) : null;
    const remote = !remoteScreen.hidden ? remoteScreen : remoteVideo;
    const remotePicture = !remote.hidden && remote.complete && remote.naturalWidth ? remote : null;
    const tiles = [
      { source: isTeacher ? local : remotePicture, label: `${current.teacherName} · 老师` },
      { source: isTeacher ? remotePicture : local, label: `${current.studentName} · 学员` },
    ].filter(tile => tile.source);
    const height = 180 * Math.max(1, tiles.length);
    if (composite.height !== height) composite.height = height;
    context.fillStyle = '#243044'; context.fillRect(0, 0, 320, height);
    context.font = '14px sans-serif';
    if (!tiles.length) { context.fillStyle = '#cbd5e1'; context.fillText('等待摄像头画面', 12, 92); }
    tiles.forEach(({ source, label }, index) => {
      const top = 180 * index;
      try {
        if (source === remoteScreen) {
          const scale = Math.min(320 / remoteScreen.naturalWidth, 180 / remoteScreen.naturalHeight);
          const width = remoteScreen.naturalWidth * scale; const h = remoteScreen.naturalHeight * scale;
          context.drawImage(remoteScreen, (320 - width) / 2, top + (180 - h) / 2, width, h);
        } else context.drawImage(source!, 0, top, 320, 180);
      } catch { /* First frame may still be decoding. */ }
      context.fillStyle = '#111827cc'; context.fillRect(5, top + 154, Math.min(310, context.measureText(label).width + 12), 21);
      context.fillStyle = '#f8fafc'; context.fillText(label, 11, top + 169, 298);
    });
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
    try { reservation.promise = picture.requestWindow({ width: 220, height: 350, preferInitialWindowPlacement: true }); }
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
      // Standard video PiP has no HTML controls; the controls stay on the page.
      composite = doc.createElement('canvas'); composite.width = 320; composite.height = 180;
      if (!composite.captureStream) throw new Error('当前浏览器不支持桌面悬浮，请使用支持画中画的浏览器。');
      const video = el('video', 'lesson-media__pip-composite') as PictureVideo;
      video.muted = true; video.autoplay = true; video.playsInline = true;
      if (!video.requestPictureInPicture && !video.webkitSetPresentationMode) throw new Error('当前浏览器不支持桌面悬浮，请使用支持画中画的浏览器。');
      fallbackStream = composite.captureStream(VIDEO_FPS); video.srcObject = fallbackStream; fallbackVideo = video; root.append(video);
      drawComposite(); compositeTimer = win.setInterval(drawComposite, VIDEO_INTERVAL);
      await video.play();
      if (disposed || generation !== attempt || !current || fallbackVideo !== video) return;
      const leftVideoWindow = () => {
        if (fallbackVideo !== video) return;
        stopFallback(); desktopFailure = current ? '桌面悬浮已关闭，可点击重新打开悬浮窗。' : ''; render();
      };
      video.addEventListener('leavepictureinpicture', leftVideoWindow, { once: true });
      video.addEventListener('webkitpresentationmodechanged', () => {
        if (video.webkitPresentationMode === 'inline') leftVideoWindow();
      });
      if (video.requestPictureInPicture) {
        try {
          await video.requestPictureInPicture();
          if (fallbackVideo !== video && doc.pictureInPictureElement === video) await doc.exitPictureInPicture();
          return;
        } catch (cause: any) {
          if (cause?.name !== 'NotSupportedError' || !video.webkitSetPresentationMode) throw cause;
        }
      }
      if (disposed || generation !== attempt || !current || fallbackVideo !== video) return;
      if (!video.webkitSetPresentationMode || video.webkitSupportsPresentationMode?.('picture-in-picture') === false) {
        throw new Error('这个浏览器暂时无法打开视频画中画，可继续使用网页摄像头。');
      }
      video.webkitSetPresentationMode('picture-in-picture');
      win.setTimeout(() => {
        if (fallbackVideo !== video || video.webkitPresentationMode !== 'inline') return;
        stopFallback(); desktopFailure = '画中画未打开，可在网页中重新打开悬浮窗。'; render();
      }, 1000);
    } catch (cause: any) {
      if (generation !== attempt || disposed || !current) return;
      closeDesktop();
      desktopFailure = cause?.name === 'NotAllowedError' ? '浏览器拦截了桌面悬浮，请点击重新打开悬浮窗。'
        : cause?.message || '桌面悬浮未能开启，请点击重新打开悬浮窗。';
    } finally { if (attempt === generation) { pipPending = false; render(); } }
  }
  function release(preserve?: LessonDesktopReservation) {
    outputRetry.hidden = true;
    recoverCamera.clear(); recoverAudio.clear();
    deviceGuides.microphone.hide(); deviceGuides.camera.hide();
    for (const reservation of reservations) if (reservation !== preserve) cancelDesktop(reservation);
    generation++; cameraStarting = false; audioStarting = false; audioResuming = false; pipPending = false;
    authoritativePeer = ''; negotiatedFlow = false; screen?.stop(); stopCamera(); audio.stop(); clearRemote(); closeDesktop();
  }
  function stop(preserve?: LessonDesktopReservation) {
    dismissExit(); beautyExpanded = false;
    release(preserve); current = null; connected = false; peerOnline = false; root.hidden = true;
  }
  function dismissExit() {
    exitLessonId = ''; exitOverlay.hidden = true;
    header.inert = false; grid.inert = false; controls.inert = false;
  }
  function requestExit() {
    if (!current || disposed || exitLessonId) return;
    exitLessonId = current._id;
    const isTeacher = config.uid === current.teacherUid;
    exitTitle.textContent = isTeacher ? '结束本次上课？' : '离开课堂？';
    exitDetail.textContent = isTeacher ? '确认后老师和学员都会结束本次课堂。' : '确认后将关闭你的摄像头和麦克风。';
    exitConfirm.textContent = isTeacher ? '确认结束' : '确认离开';
    header.inert = true; grid.inert = true; controls.inert = true;
    exitOverlay.hidden = false; exitCancel.focus();
  }
  exitCancel.addEventListener('click', () => { dismissExit(); if (current) leave.focus(); });
  exitConfirm.addEventListener('click', () => {
    const lessonId = exitLessonId;
    if (!lessonId || disposed || current?._id !== lessonId) { dismissExit(); return; }
    dismissExit();
    options.onLeave({ confirmed: true, lessonId });
  });
  exitOverlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); exitCancel.click(); }
    if (event.key === 'Tab') {
      event.preventDefault();
      (root.ownerDocument.activeElement === exitCancel ? exitConfirm : exitCancel).focus();
    }
  });
  function resizeBeautyDesktop(expanded: boolean) {
    if (!expanded) {
      const previous = beautyDesktopSize; beautyDesktopSize = null;
      if (previous && pip === previous.window && !pip.closed) {
        try { pip.resizeTo(pip.outerWidth || previous.width, previous.height); } catch { /* A compact window can always scroll instead. */ }
      }
      return;
    }
    if (!pip || beautyDesktopSize || !(pip.outerHeight > 0)) return;
    const previous = { window: pip, width: pip.outerWidth, height: pip.outerHeight };
    try {
      // Called only from the local icon's user gesture; browsers may deny resizing.
      pip.resizeBy(0, 120); beautyDesktopSize = previous;
    } catch { /* The independent panel remains reachable in the scroll area. */ }
  }
  beautyToggle.addEventListener('click', () => {
    if (!current || config.uid !== current.teacherUid) return;
    beautyExpanded = !beautyExpanded; render(); resizeBeautyDesktop(beautyExpanded);
  });
  screenToggle.addEventListener('click', () => screen?.toggleView());
  shareScreen.addEventListener('click', () => { void screen?.startSharing(); });
  declineScreen.addEventListener('click', () => screen?.declineSharing());
  screenStop.addEventListener('click', () => screen?.stopSharing());
  screenPage.addEventListener('click', () => { closeDesktop(); win.focus(); shareScreen.focus(); });
  beautyControls.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); beautyExpanded = false; render(); resizeBeautyDesktop(false); beautyToggle.focus(); }
  });
  camera.addEventListener('click', () => {
    if (!current) return;
    recoverCamera.clear();
    if (cameraStream) { cameraWanted = false; saveDevicePreferences(); stopCamera(); cameraFailure = ''; render(); }
    else if (connected) { cameraWanted = true; saveDevicePreferences(); void startCamera(); }
  });
  microphone.addEventListener('click', () => {
    if (!current) return;
    recoverAudio.clear();
    if (!audio.ready) { if (connected) { muted = false; saveDevicePreferences(); void startAudio(); } }
    else { muted = !muted; saveDevicePreferences(); audio.setMuted(muted); render(); }
  });
  desktop.addEventListener('click', () => { void openDesktop(); });
  retry.addEventListener('click', () => {
    if (!current || !connected) return;
    recoverCamera.clear(); recoverAudio.clear();
    void Promise.all([startCamera(), startAudio()]);
  });
  leave.addEventListener('click', requestExit);
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
    renewCameraWindow();
    if (!current || disposed || !cameraStream || localVideo.readyState < 2) return;
    const frame = localCameraFrame();
    if (!connected || (negotiatedFlow && !peerOnline) || options.canSendCamera?.() === false) return;
    const mode = negotiatedFlow ? cameraFlow.nextPicture() : undefined;
    if (mode === null) return;
    const now = Date.now();
    captureBudget = Math.min(VIDEO_FRAME_TARGET * 2,
      captureBudget + Math.max(0, now - captureBudgetAt) * VIDEO_BYTES_PER_SECOND / 1000);
    captureBudgetAt = now;
    const limit = Math.min(mode?.profile.bytes ?? VIDEO_FRAME_TARGET, Math.floor(captureBudget) - 256);
    if (limit < 2048) return;
    try {
      let data = '';
      let quality = jpegQuality;
      // Keep a steady cadence within a byte budget instead of queuing large frames.
      const sizes = [[VIDEO_WIDTH, VIDEO_HEIGHT], [640, 360], [480, 270], [320, 180]];
      for (const [width, height] of sizes) {
        if (mode && width > mode.profile.width) continue;
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
      const seq = sequence++;
      if (options.send({ type: 'video', lessonId: current._id, seq, data, ...(mode && { ticket: mode.ticket }) })) {
        if (mode) cameraFlow.sent(seq, data.length + 256);
        captureBudget -= data.length + 256;
        jpegQuality = Math.min(.72, quality + .02);
      }
    } catch { /* Drop an undecoded or oversize frame, never queue stale video. */ }
  }
  function startCaptureClock(host: Window) {
    stopCaptureClocks();
    captureTimerWindow = host;
    if (!disposed) {
      captureTimer = host.setInterval(captureFrame, VIDEO_INTERVAL);
      // A freshly queued camera frame must get a chance to drain before the desktop tests the same socket.
      screenTimer = host.setInterval(() => screen?.capture(), SCREEN_INTERVAL);
    }
  }
  function stopCaptureClocks() {
    try {
      captureTimerWindow.clearInterval(captureTimer); captureTimerWindow.clearInterval(screenTimer);
    } catch { /* Its desktop window may already be gone. */ }
  }
  startCaptureClock(win);
  function showNewestVideo() {
    if (remotePending || !newestVideo) return;
    const next = newestVideo; newestVideo = null;
    if (!cameraFlow.fresh(next.ticket)) return;
    remotePending = true; decodingTicket = next.ticket;
    remoteAt = Date.now(); remoteVideo.src = next.data;
  }
  const staleTimer = win.setInterval(() => {
    if (remoteAt && Date.now() - remoteAt > STALE_VIDEO_MS) {
      remoteReady = false; remoteVideo.removeAttribute('src'); remoteVideo.hidden = true; remotePlaceholder.hidden = false;
      remotePlaceholder.textContent = peerOnline ? '对方摄像头已暂停' : '等待对方加入'; remoteAt = 0; remotePending = false;
      render(); showNewestVideo();
    }
  }, 300);
  remoteVideo.addEventListener('load', () => {
    remotePending = false;
    if (current && connected && remoteAt && Date.now() - remoteAt <= STALE_VIDEO_MS && cameraFlow.fresh(decodingTicket)) {
      cameraFlow.displayed(decodingTicket);
      if (!remoteReady) { remoteReady = true; render(); }
    } else if (remoteReady) { remoteReady = false; render(); }
    showNewestVideo();
  });
  remoteVideo.addEventListener('error', () => { remoteReady = false; remotePending = false; render(); showNewestVideo(); });

  return {
    async start(lesson: LessonMediaRoom, reservation?: LessonDesktopReservation, entryScreen?: LessonEntryScreen) {
      if (disposed) return;
      stop(reservation); current = lesson;
      const attempt = generation;
      const screenChoice = screen?.start(lesson, entryScreen);
      openDesktopManually = !!entryScreen;
      const preferences = devicePreferences(lesson);
      cameraWanted = preferences?.cameraWanted ?? true; muted = preferences?.muted ?? false;
      cameraFailure = ''; audioFailure = ''; desktopFailure = ''; root.hidden = false;
      const isTeacher = config.uid === lesson.teacherUid;
      if (isTeacher) loadBeautyPreferences();
      localName.textContent = `${isTeacher ? lesson.teacherName : lesson.studentName} · ${isTeacher ? '老师' : '学员'}`;
      remoteName.textContent = `${isTeacher ? lesson.studentName : lesson.teacherName} · ${isTeacher ? '学员' : '老师'}`;
      localTile.dataset.lessonParticipant = isTeacher ? 'teacher' : 'student';
      remoteTile.dataset.lessonParticipant = isTeacher ? 'student' : 'teacher';
      grid.replaceChildren(...(isTeacher ? [localTile, beautyControls, remoteTile] : [remoteTile, beautyControls, localTile]));
      captureBudget = VIDEO_FRAME_TARGET * 2; captureBudgetAt = Date.now(); jpegQuality = .72;
      leave.textContent = config.uid === lesson.teacherUid ? '结束上课' : '离开课堂'; render();
      if (reservation) void adoptDesktop(reservation); else if (!openDesktopManually) void openDesktop();
      if (screenChoice) {
        // The teacher can guide the learner by voice while the system picker is open.
        // Listening opens no microphone or camera prompt.
        void restoreOutput();
        await screenChoice;
      }
      if (attempt !== generation || disposed || current?._id !== lesson._id) return;
      await Promise.all([startAudio(), startCamera()]);
    },
    receive(message: any) {
      if (disposed || !current) return;
      if (message.type === 'peer') {
        peerOnline = !!message.online;
        if (typeof message.cameraFlow === 'boolean') negotiatedFlow = message.cameraFlow;
        screen?.setPeerOnline(peerOnline, message.streamId, message.screenFlow);
        if (!peerOnline || (message.streamId && authoritativePeer !== message.streamId)) clearRemote();
        authoritativePeer = peerOnline ? message.streamId || authoritativePeer : '';
        render(); return;
      }
      const peerUid = config.uid === current.teacherUid ? current.studentUid : current.teacherUid;
      if (!connected || message.lessonId !== current._id || message.uid !== peerUid) return;
      if (['screen', 'screen-state', 'screen-view', 'screen-window'].includes(message.type)) { screen?.receive(message); return; }
      if (authoritativePeer && message.streamId !== authoritativePeer) return;
      if (negotiatedFlow && !peerOnline) return;
      if (message.type === 'camera-window') {
        if (negotiatedFlow) { cameraFlow.acceptWindow(message.seq, message.level, message.seen); renewCameraWindow(); }
        return;
      }
      if (message.type === 'video') {
        if (typeof message.data !== 'string' || message.data.length > MAX_VIDEO_LENGTH
          || !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(message.data)
          || !Number.isSafeInteger(message.seq) || message.seq < 0) return;
        if (typeof message.streamId === 'string' && message.streamId !== remoteVideoStream) {
          remoteVideoStream = message.streamId; remoteSequence = -1;
        }
        cameraFlow.arrived(message.seq, message.ticket);
        if (message.seq <= remoteSequence || !cameraFlow.fresh(message.ticket)) return;
        remoteSequence = message.seq; newestVideo = { data: message.data, ticket: message.ticket }; showNewestVideo();
      } else if (message.type === 'audio') {
        if (!Number.isSafeInteger(message.seq) || message.seq < 0) return;
        if (typeof message.streamId === 'string' && message.streamId !== remoteAudioStream) {
          remoteAudioStream = message.streamId; remoteAudioSequence = -1; audio.resetReceive();
        }
        if (message.seq <= remoteAudioSequence) return;
        remoteAudioSequence = message.seq;
        if (!separateCallActive && cameraFlow.acceptSpeech(message.ticket)) audio.receive(message.seq, message.data);
      }
    },
    setConnected(value: boolean) {
      if (disposed) return;
      const wasConnected = connected;
      connected = value && !!current;
      screen?.setConnected(connected);
      // Renewing a transport lease does not end the accepted classroom or
      // discard devices that the user has already permitted for this class.
      if (!connected) { peerOnline = false; authoritativePeer = ''; negotiatedFlow = false; audio.setTransmitting(false); clearRemote(); }
      else {
        if (!wasConnected) checkDevices();
        if (!wasConnected && audio.ready) void startAudio();
        else if (!audioResuming) audio.setTransmitting(audio.ready && !separateCallActive);
      }
      render();
    },
    prepareEntryScreen: screen.prepareEntryScreen,
    prepareDesktop,
    cancelDesktop,
    openDesktop,
    stop,
    dispose() {
      if (disposed) return;
      stop(); disposed = true;
      win.removeEventListener('onebyone:voice-audio-change', syncCallAudio);
      deviceGuides.microphone.dispose(); deviceGuides.camera.dispose();
      doc.removeEventListener('visibilitychange', checkDevices);
      win.removeEventListener('pageshow', checkDevices); win.removeEventListener('focus', checkDevices);
      win.navigator.mediaDevices?.removeEventListener?.('devicechange', checkDevices);
      screen?.dispose();
      stopCaptureClocks();
      win.clearInterval(staleTimer);
      win.removeEventListener('resize', resize); root.remove();
    },
  };
}
