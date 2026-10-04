export interface BadgeAcTheme {
  acImage?: string;
  name?: string;
  themeSound?: string;
}

const CELEBRATION_VOLUME = 0.25;
const IMAGE_WAIT_MS = 4000;

/**
 * Warm the exact image used by the celebration, and keep it detached until it
 * is fully decoded. Sound and animation start together once the image is ready.
 */
export function createBadgeAcThemePlayer(theme: BadgeAcTheme | null | undefined) {
  const acImage = String(theme?.acImage || '');
  const themeSound = String(theme?.themeSound || '');
  let activeEffect: Promise<void> | null = null;
  let playGeneration = 0;
  let preparedImage: Promise<HTMLImageElement | null> | null = null;
  let cancelImage: (() => void) | null = null;
  let cancelImageWait: (() => void) | null = null;
  let finishEffect: (() => void) | null = null;
  let audio: HTMLAudioElement | null = null;
  let audioSource = '';
  let audioPrimed = false;
  let audioPriming = false;
  let audioGeneration = 0;
  let disposed = false;

  function prepareImage() {
    if (!acImage || disposed) return Promise.resolve(null);
    if (preparedImage) return preparedImage;
    preparedImage = new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      let settled = false;
      const finish = (ready: boolean) => {
        if (settled) return;
        settled = true;
        image.onload = null;
        image.onerror = null;
        resolve(ready && !disposed ? image : null);
      };
      cancelImage = () => {
        finish(false);
        image.removeAttribute('src');
      };
      const decode = () => {
        if (!image.naturalWidth) { finish(false); return; }
        if (typeof image.decode !== 'function') { finish(true); return; }
        image.decode().then(() => finish(true), () => finish(false));
      };
      image.className = 'badge-ac-theme-effect__image';
      image.alt = '';
      image.decoding = 'async';
      image.setAttribute('fetchpriority', 'low');
      image.onload = decode;
      image.onerror = () => finish(false);
      image.src = acImage;
      // Cached images can complete synchronously without a later load event.
      if (image.complete) decode();
    });
    return preparedImage;
  }

  function readyImage() {
    if (!acImage) return Promise.resolve(null);
    return new Promise<HTMLImageElement | null>((resolve) => {
      let finished = false;
      const done = (image: HTMLImageElement | null) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        cancelImageWait = null;
        resolve(image);
      };
      const timeout = window.setTimeout(() => done(null), IMAGE_WAIT_MS);
      cancelImageWait = () => done(null);
      void prepareImage().then(done);
    });
  }

  // The normal problem and record templates also preload this versioned URL
  // before the main UI starts. No decoded bytes persist beyond this player.
  const connection = (navigator as any).connection;
  if (!connection?.saveData) void prepareImage();

  function getAudio() {
    if (!themeSound || disposed) return null;
    if (!audio || audioSource !== themeSound) {
      audio?.pause();
      audioGeneration++;
      audioPrimed = false;
      audioPriming = false;
      audio = new Audio(themeSound);
      audioSource = themeSound;
      audio.preload = 'auto';
      audio.volume = CELEBRATION_VOLUME;
      audio.load();
    }
    return audio;
  }

  function primeAudio() {
    if (disposed) return;
    const player = getAudio();
    if (!player || audioPrimed || audioPriming) return;
    const generation = ++audioGeneration;
    audioPriming = true;
    const restoreAudio = () => {
      player.volume = CELEBRATION_VOLUME;
      player.muted = false;
    };
    player.muted = false;
    player.volume = 0;
    player.play().then(() => {
      // A delayed prime callback must not pause an already-started effect.
      if (audio !== player || generation !== audioGeneration) return;
      player.pause();
      player.currentTime = 0;
      restoreAudio();
      audioPrimed = true;
      audioPriming = false;
    }).catch(() => {
      if (audio !== player || generation !== audioGeneration) return;
      restoreAudio();
      audioPriming = false;
    });
  }

  if (themeSound) {
    document.addEventListener('pointerdown', primeAudio, { capture: true });
    document.addEventListener('keydown', primeAudio, { capture: true });
  }

  function display(image: HTMLImageElement | null) {
    if (disposed) return Promise.resolve();
    const effect = document.createElement('div');
    effect.className = 'badge-ac-theme-effect';
    effect.setAttribute('aria-hidden', 'true');
    const frame = document.createElement('div');
    frame.className = 'badge-ac-theme-effect__frame';
    const burst = document.createElement('div');
    burst.className = 'badge-ac-theme-effect__burst';
    frame.appendChild(burst);

    if (image) frame.appendChild(image);
    else {
      const label = document.createElement('div');
      label.className = 'badge-ac-theme-effect__label';
      label.textContent = `${theme?.name || '徽章主题'} · 满分 AC`;
      frame.appendChild(label);
    }

    effect.appendChild(frame);
    document.body.appendChild(effect);

    return new Promise<void>((resolve) => {
      let finished = false;
      let timeout = 0;
      const player = getAudio();
      const finish = (immediate = false) => {
        if (finished) return;
        finished = true;
        finishEffect = null;
        window.clearTimeout(timeout);
        if (player) {
          player.onended = null;
          player.onerror = null;
          player.pause();
        }
        if (immediate) {
          effect.remove();
          resolve();
          return;
        }
        effect.classList.remove('is-visible');
        effect.classList.add('is-leaving');
        window.setTimeout(() => {
          effect.remove();
          resolve();
        }, 340);
      };
      finishEffect = () => finish(true);
      window.requestAnimationFrame(() => {
        if (!finished && !disposed) effect.classList.add('is-visible');
      });

      if (player) {
        audioGeneration++;
        audioPriming = false;
        player.pause();
        player.currentTime = 0;
        player.muted = false;
        player.volume = CELEBRATION_VOLUME;
        audioPrimed = true;
        player.onended = () => finish();
        player.onerror = () => finish();
        timeout = window.setTimeout(() => finish(), 12000);
        player.play().catch(() => {
          if (finished) return;
          window.clearTimeout(timeout);
          timeout = window.setTimeout(() => finish(), 2200);
        });
      } else {
        timeout = window.setTimeout(() => finish(), 2200);
      }
    });
  }

  function play() {
    if (disposed || (!acImage && !themeSound) || activeEffect) return activeEffect || Promise.resolve();
    // Preserve user-gesture audio permission for the badge preview while the
    // detached image is still loading. The real sound starts in display().
    primeAudio();
    const generation = ++playGeneration;
    activeEffect = readyImage().then((image) => {
      if (generation === playGeneration) return display(image);
      return undefined;
    }).finally(() => {
      activeEffect = null;
    });
    return activeEffect;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelImageWait?.();
    finishEffect?.();
    cancelImage?.();
    preparedImage = null;
    cancelImage = null;
    window.removeEventListener('pagehide', onPageHide);
    if (themeSound) {
      document.removeEventListener('pointerdown', primeAudio, { capture: true });
      document.removeEventListener('keydown', primeAudio, { capture: true });
    }
    audioGeneration++;
    audioPriming = false;
    audioPrimed = false;
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio = null;
      audioSource = '';
    }
  }
  function onPageHide(event: PageTransitionEvent) {
    if (!event.persisted) { dispose(); return; }
    // A restored back/forward-cache page keeps its player, but must not resume
    // an old celebration or sound after the student has navigated away.
    playGeneration++;
    cancelImageWait?.();
    finishEffect?.();
    audioGeneration++;
    audioPriming = false;
    audioPrimed = false;
    audio?.pause();
  }
  window.addEventListener('pagehide', onPageHide);

  return { dispose, play };
}
