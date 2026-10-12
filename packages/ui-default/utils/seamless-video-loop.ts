export interface SeamlessVideoLoopOptions {
  isActive: () => boolean;
  onSwitch: (next: HTMLVideoElement) => void;
}

export interface SeamlessVideoLoop {
  pause: () => void;
  /** Re-arm the loop observer; the outer player owns starting the current video. */
  resume: () => void;
  dispose: () => void;
}

type MediaWindow = Window & typeof globalThis;
type Handoff = {
  generation: number;
  from: HTMLVideoElement;
  to: HTMLVideoElement;
  frame: number;
  requestedAt: number;
  measured: boolean;
};
type Priming = { generation: number; video: HTMLVideoElement; frame: number; requestedAt: number };

/**
 * Keep one decoded opening frame beside the playing video. At the loop boundary,
 * swap only after that second decoder has presented a real frame. Native looping
 * remains enabled throughout, so a slow/unsupported decoder cannot create a blank
 * background. The visible decoder is never manually rewound.
 */
export function createSeamlessVideoLoop(
  primary: HTMLVideoElement,
  win: MediaWindow = primary.ownerDocument.defaultView as MediaWindow,
  options: SeamlessVideoLoopOptions,
): SeamlessVideoLoop {
  let current = primary;
  let secondary: HTMLVideoElement | null = null;
  let disposed = false;
  let suspended = false;
  let disabled = !primary.requestVideoFrameCallback || !primary.cancelVideoFrameCallback;
  let generation = 0;
  let handoff: Handoff | null = null;
  let priming: Priming | null = null;
  const primed = new WeakSet<HTMLVideoElement>();
  const primeBlocked = new WeakSet<HTMLVideoElement>();
  let watched: HTMLVideoElement | null = null;
  let watchFrame = 0;
  let previousTime: number | null = null;
  let frameDuration = 1 / 60;
  let resumeLatency = 0;
  primary.loop = true;
  primary.setAttribute('data-loop-current', 'true');

  const active = () => !disposed && !suspended && options.isActive();
  const boundaryWindow = () => Math.min(0.07, Math.max(1 / 120, frameDuration * 2));
  const measureLatency = (requestedAt: number, now: number) => {
    const seconds = (now - requestedAt) / 1000;
    if (!Number.isFinite(seconds) || seconds < 0.001) return;
    const observed = Math.min(0.25, seconds);
    resumeLatency = resumeLatency ? resumeLatency * 0.65 + observed * 0.35 : observed;
  };
  const stopWatching = () => {
    if (watchFrame && watched?.cancelVideoFrameCallback) watched.cancelVideoFrameCallback(watchFrame);
    watched = null;
    watchFrame = 0;
  };
  const openingReady = (video: HTMLVideoElement) => video.readyState >= 2 && !video.seeking && !video.error
    && video.currentTime <= 0.04;
  const prepareOpening = (video: HTMLVideoElement) => {
    video.pause();
    primed.delete(video);
    try {
      if (video.readyState >= 1 && video.currentTime !== 0) video.currentTime = 0;
    } catch { /* Retain native looping when the inactive decoder cannot seek. */ }
  };
  const cancelPriming = () => {
    const pending = priming;
    if (!pending) return;
    priming = null;
    generation++;
    pending.video.cancelVideoFrameCallback?.(pending.frame);
    if (pending.video !== current) prepareOpening(pending.video);
  };
  const cancelHandoff = () => {
    const pending = handoff;
    if (!pending) return;
    handoff = null;
    generation++;
    pending.to.cancelVideoFrameCallback?.(pending.frame);
    // A promise/frame can arrive after cancellation; the generation guard ignores it.
    if (pending.to !== current) prepareOpening(pending.to);
  };
  const disable = () => {
    disabled = true;
    cancelHandoff();
    cancelPriming();
    stopWatching();
    current.loop = true;
    const other = current === primary ? secondary : primary;
    other?.pause();
    // Retire the failed spare without resetting the visible video or its buffer.
    if (secondary && secondary !== current) {
      secondary.removeEventListener('playing', onPlaying);
      secondary.removeEventListener('error', onError);
      for (const event of ['loadeddata', 'canplay', 'seeked']) secondary.removeEventListener(event, onReady);
      secondary.removeAttribute('src');
      secondary.load();
      secondary.remove();
      secondary = null;
    }
  };

  const ensureSecondary = () => {
    if (secondary || disabled || !active() || !primary.parentElement) return;
    const source = primary.currentSrc || primary.getAttribute('src');
    if (!source) return;
    const next = win.document.createElement('video');
    next.className = primary.className;
    next.muted = true;
    next.defaultMuted = true;
    next.volume = 0;
    next.playsInline = true;
    next.loop = true;
    next.autoplay = false;
    next.controls = false;
    next.preload = 'auto';
    next.tabIndex = -1;
    next.setAttribute('aria-hidden', 'true');
    next.setAttribute('muted', '');
    next.setAttribute('playsinline', '');
    next.setAttribute('disablepictureinpicture', '');
    next.setAttribute('disableremoteplayback', '');
    // The spare has identical layout, but no current marker and no autoplay.
    next.addEventListener('playing', onPlaying);
    next.addEventListener('error', onError);
    for (const event of ['loadeddata', 'canplay', 'seeked']) next.addEventListener(event, onReady);
    secondary = next;
    primary.parentElement.append(next);
    next.src = source;
  };

  const primeOpening = (video: HTMLVideoElement) => {
    if (disabled || !active() || current.paused || video === current || handoff || priming
      || primeBlocked.has(video) || primed.has(video) || !openingReady(video)) return;
    const pending: Priming = { generation: ++generation, video, frame: 0, requestedAt: win.performance.now() };
    priming = pending;
    try {
      pending.frame = video.requestVideoFrameCallback((now) => {
        if (disposed || disabled || priming !== pending || generation !== pending.generation) return;
        pending.frame = 0;
        if (!active() || video === current || video.readyState < 2 || video.paused) {
          cancelPriming();
          return;
        }
        priming = null;
        measureLatency(pending.requestedAt, now);
        video.pause();
        // ReadyState alone does not warm the 4K compositor. Keep this decoder alive
        // after its first real frame so the boundary only resumes a hot pipeline.
        primed.add(video);
        if (video.currentTime > 0.04) {
          try { video.currentTime = 0; } catch { primed.delete(video); }
        }
      });
      Promise.resolve(video.play()).catch(() => {
        if (priming === pending && generation === pending.generation) {
          primeBlocked.add(video);
          cancelPriming();
        }
      });
    } catch {
      primeBlocked.add(video);
      cancelPriming();
    }
  };

  const startHandoff = (from: HTMLVideoElement, to: HTMLVideoElement) => {
    if (handoff || priming || !active() || disabled || !openingReady(to) || !primed.has(to)) return;
    const pending: Handoff = {
      generation: ++generation, from, to, frame: 0,
      requestedAt: win.performance.now(), measured: false,
    };
    handoff = pending;
    to.playbackRate = from.playbackRate;
    try {
      const presented: VideoFrameRequestCallback = (now, metadata) => {
        if (disposed || disabled || handoff !== pending || generation !== pending.generation) return;
        pending.frame = 0;
        if (!pending.measured) {
          pending.measured = true;
          measureLatency(pending.requestedAt, now);
        }
        if (!active() || current !== from || to.paused || to.readyState < 2
          || metadata.mediaTime > Math.max(0.08, frameDuration * 3)) {
          cancelHandoff();
          return;
        }
        // A hot decoder may respond earlier than its measured 4K wake-up delay.
        // Keep its frames hidden until the visible timeline reaches the boundary,
        // rather than cutting a large piece off the tail to gain an early switch.
        if (from.duration - from.currentTime > boundaryWindow()) {
          pending.frame = to.requestVideoFrameCallback(presented);
          return;
        }
        handoff = null;
        stopWatching();
        from.removeAttribute('data-loop-current');
        to.setAttribute('data-loop-current', 'true');
        current = to;
        previousTime = null;
        // Change the visible layer synchronously before rewinding the hidden layer.
        from.pause();
        options.onSwitch(to);
        prepareOpening(from);
        primeOpening(from);
        watch();
      };
      pending.frame = to.requestVideoFrameCallback(presented);
      Promise.resolve(to.play()).catch(() => {
        if (handoff === pending && generation === pending.generation) cancelHandoff();
      });
    } catch { cancelHandoff(); }
  };

  const watch = () => {
    if (disabled || !active() || current.paused || watchFrame) return;
    ensureSecondary();
    const video = current;
    const spare = video === primary ? secondary : primary;
    if (spare) primeOpening(spare);
    watched = video;
    watchFrame = video.requestVideoFrameCallback((_, metadata) => {
      watchFrame = 0;
      watched = null;
      if (disabled || !active() || video !== current || video.paused) return;
      const time = metadata.mediaTime;
      if (previousTime !== null) {
        const delta = time - previousTime;
        if (delta < -0.1) {
          // Native looping beat the spare: do not perform a late backwards jump.
          cancelHandoff();
        } else if (delta > 0.001 && delta < 0.12) {
          frameDuration = frameDuration * 0.75 + delta * 0.25;
        }
      }
      previousTime = time;
      const spare = video === primary ? secondary : primary;
      if (spare) primeOpening(spare);
      const duration = video.duration;
      // Measured decoder/compositor wake-up is often longer than two frames at 4K.
      // Start that work early, but retain the exact same narrow visible cut window.
      const lead = Math.min(0.25, Math.max(boundaryWindow(), resumeLatency * 1.15 + frameDuration));
      if (spare && Number.isFinite(duration) && duration > 0.2
        && time >= duration - lead && time < duration) startHandoff(video, spare);
      watch();
    });
  };
  function onPlaying(event: Event) {
    if (event.target === current) watch();
  }
  function onReady(event: Event) {
    const target = event.target as HTMLVideoElement;
    if (target !== current) primeOpening(target);
  }
  function onError() { disable(); }
  primary.addEventListener('playing', onPlaying);
  primary.addEventListener('error', onError);
  for (const event of ['loadeddata', 'canplay', 'seeked']) primary.addEventListener(event, onReady);

  const resume = () => {
    if (disposed) return;
    suspended = false;
    ensureSecondary();
    const spare = current === primary ? secondary : primary;
    if (spare) { primeBlocked.delete(spare); primeOpening(spare); }
    watch();
  };
  resume();
  return {
    pause() {
      if (disposed) return;
      suspended = true;
      cancelHandoff();
      cancelPriming();
      stopWatching();
      primary.pause();
      secondary?.pause();
    },
    resume,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelHandoff();
      cancelPriming();
      stopWatching();
      primary.removeEventListener('playing', onPlaying);
      primary.removeEventListener('error', onError);
      for (const event of ['loadeddata', 'canplay', 'seeked']) primary.removeEventListener(event, onReady);
      primary.pause();
      if (secondary) {
        secondary.removeEventListener('playing', onPlaying);
        secondary.removeEventListener('error', onError);
        for (const event of ['loadeddata', 'canplay', 'seeked']) secondary.removeEventListener(event, onReady);
        secondary.pause();
        secondary.removeAttribute('src');
        secondary.load();
        secondary.remove();
        secondary = null;
      }
    },
  };
}
