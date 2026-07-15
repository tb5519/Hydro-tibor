export interface BadgeAcTheme {
  acImage?: string;
  name?: string;
  themeSound?: string;
}

const CELEBRATION_VOLUME = 0.25;

/**
 * Display a badge's full-score celebration. The sound is primed on the first
 * user gesture so Chrome can play it when an asynchronous judge result arrives.
 */
export function createBadgeAcThemePlayer(theme: BadgeAcTheme | null | undefined) {
  const acImage = String(theme?.acImage || '');
  const themeSound = String(theme?.themeSound || '');
  let activeEffect: Promise<void> | null = null;
  let audio: HTMLAudioElement | null = null;
  let audioSource = '';
  let audioPrimed = false;
  let audioPriming = false;
  let audioGeneration = 0;

  function getAudio() {
    if (!themeSound) return null;
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
      player.pause();
      player.currentTime = 0;
      restoreAudio();
      if (audio !== player || generation !== audioGeneration) return;
      audioPrimed = true;
      audioPriming = false;
    }).catch(() => {
      restoreAudio();
      if (audio === player && generation === audioGeneration) audioPriming = false;
    });
  }

  if (themeSound) {
    document.addEventListener('pointerdown', primeAudio, { capture: true });
    document.addEventListener('keydown', primeAudio, { capture: true });
  }

  function play() {
    if ((!acImage && !themeSound) || activeEffect) return activeEffect || Promise.resolve();

    const effect = document.createElement('div');
    effect.className = 'badge-ac-theme-effect';
    effect.setAttribute('aria-hidden', 'true');
    const frame = document.createElement('div');
    frame.className = 'badge-ac-theme-effect__frame';
    const burst = document.createElement('div');
    burst.className = 'badge-ac-theme-effect__burst';
    frame.appendChild(burst);

    if (acImage) {
      const image = new Image();
      image.className = 'badge-ac-theme-effect__image';
      image.src = acImage;
      image.alt = '';
      frame.appendChild(image);
    } else {
      const label = document.createElement('div');
      label.className = 'badge-ac-theme-effect__label';
      label.textContent = `${theme?.name || '徽章主题'} · 满分 AC`;
      frame.appendChild(label);
    }

    effect.appendChild(frame);
    document.body.appendChild(effect);
    window.requestAnimationFrame(() => effect.classList.add('is-visible'));

    const effectPromise = new Promise<void>((resolve) => {
      let finished = false;
      let timeout = 0;
      const player = getAudio();
      const finish = () => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timeout);
        if (player) {
          player.onended = null;
          player.onerror = null;
        }
        effect.classList.remove('is-visible');
        effect.classList.add('is-leaving');
        window.setTimeout(() => {
          effect.remove();
          resolve();
        }, 340);
      };

      if (player) {
        // A pending muted-prime callback must not pause the real celebration.
        audioGeneration++;
        audioPriming = false;
        player.pause();
        player.currentTime = 0;
        player.muted = false;
        player.volume = CELEBRATION_VOLUME;
        audioPrimed = true;
        player.onended = finish;
        player.onerror = finish;
        timeout = window.setTimeout(finish, 12000);
        player.play().catch(() => {
          window.clearTimeout(timeout);
          timeout = window.setTimeout(finish, 2200);
        });
      } else {
        timeout = window.setTimeout(finish, 2200);
      }
    });
    activeEffect = effectPromise.finally(() => {
      activeEffect = null;
    });
    return activeEffect;
  }

  return { play };
}
