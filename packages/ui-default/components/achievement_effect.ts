import { getWarmedAchievementImage } from './achievement_assets';

export interface EarnedAchievement {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  thumbnailUrl?: string;
  seriesId?: string;
  seriesRank?: number;
}

export interface AchievementPendingResponse {
  achievements: EarnedAchievement[];
  settled?: boolean;
}

export interface AchievementSoundSettings {
  soundUrl?: string;
  volume?: number;
  enabled?: boolean;
  filename?: string;
}

interface AchievementCelebrationOptions {
  fetchPending: (rid?: string) => Promise<AchievementPendingResponse>;
  acknowledge: (ids: string[]) => Promise<unknown>;
  lockName?: string;
  canPresent?: () => boolean;
  sound?: AchievementSoundSettings;
}

export interface AchievementContext {
  achievementPendingUrl?: string;
  achievementAckUrl?: string;
  achievementScope?: string;
  achievementSound?: AchievementSoundSettings;
}

const THUMBNAIL_DELAY_MS = 3000;
const IMAGE_WAIT_MS = 30_000;
const INPUT_GUARD_MS = 700;
const EXIT_MS = 360;
const POLL_DELAYS = [0, 700, 1400, 2400, 4000, 6000];

function assetUrl(value?: string) {
  if (!value) return '';
  try {
    const url = new URL(value, window.location.href);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : '';
  } catch {
    return '';
  }
}

function seriesOf(award: EarnedAchievement) {
  return typeof award.seriesId === 'string' && award.seriesId
    && typeof award.seriesRank === 'number' && Number.isFinite(award.seriesRank) && award.seriesRank > 0
    ? { id: award.seriesId, rank: award.seriesRank } : undefined;
}

function highestAwards(awards: EarnedAchievement[]) {
  const highest = new Map<string, EarnedAchievement>();
  for (const award of awards) {
    const series = seriesOf(award);
    // Older responses without series metadata retain their ID-based behavior.
    const key = series ? `series:${series.id}` : `award:${award.id}`;
    const previous = highest.get(key);
    if (!previous || (series && series.rank > seriesOf(previous)!.rank)) highest.set(key, award);
  }
  return [...highest.values()];
}

/** One page-scoped queue. Only explicit dismissal acknowledges an award. */
export function createAchievementCelebration(options: AchievementCelebrationOptions) {
  let disposed = false;
  let suspended = false;
  let generation = 0;
  let queue = Promise.resolve();
  let finishDisplay: (() => void) | undefined;
  const records = new Map<string, Promise<void>>();
  const shown = new Set<string>();
  const shownSeries = new Map<string, number>();
  const cancellations = new Set<() => void>();
  const configuredVolume = options.sound?.volume;
  const soundVolume = Math.max(0, Math.min(100,
    typeof configuredVolume === 'number' && Number.isFinite(configuredVolume) ? configuredVolume : 25)) / 100;
  const soundUrl = options.sound?.enabled === true && soundVolume > 0 ? assetUrl(options.sound.soundUrl) : '';
  let presenting = false;
  let audio: HTMLAudioElement | null = null;
  let audioGeneration = 0;
  let audioPrimed = false;
  let audioPriming = false;
  let soundActive = false;

  function getAudio() {
    if (!soundUrl || disposed || suspended) return null;
    if (!audio) {
      try {
        const player = new Audio(soundUrl);
        player.preload = 'auto';
        player.loop = false;
        player.muted = true;
        player.volume = 0;
        player.load();
        audio = player;
      } catch { return null; }
    }
    return audio;
  }

  function stopSound(release = false) {
    audioGeneration++;
    audioPriming = false;
    soundActive = false;
    if (!audio) return;
    // Mute before pausing: a late play() or priming callback must never emit
    // sound during the exit animation, navigation or a suspended bfcache page.
    audio.muted = true;
    audio.pause();
    try { audio.currentTime = 0; } catch { /* The media may not have loaded yet. */ }
    if (release) {
      audio.removeAttribute('src');
      audio.load();
      audio = null;
      audioPrimed = false;
    }
  }

  function primeAudio() {
    if (disposed || suspended || presenting || audioPrimed || audioPriming || document.querySelector('.achievement-reveal')) return;
    const player = getAudio();
    if (!player) return;
    const version = ++audioGeneration;
    audioPriming = true;
    player.muted = true;
    player.volume = 0;
    // Match the AC player's gesture unlock: an unmuted element played at zero
    // volume can retain audible playback permission for the later reveal.
    // Some mobile engines ignore programmatic volume; keep those muted so
    // warming the asset can never make the achievement audible ahead of AC.
    player.muted = player.volume !== 0;
    const finish = (ready: boolean) => {
      if (player !== audio || version !== audioGeneration) {
        if (player !== audio || !soundActive) { player.muted = true; player.pause(); }
        return;
      }
      player.muted = true;
      player.pause();
      try { player.currentTime = 0; } catch { /* A rejected load need not have a seekable timeline. */ }
      audioPrimed = ready;
      audioPriming = false;
      // Keep the element muted until the achievement actually enters. Merely
      // finishing a silent warmup while AC plays must not restore its volume.
    };
    try { void Promise.resolve(player.play()).then(() => finish(true), () => finish(false)); } catch { finish(false); }
  }

  function playSound() {
    const player = getAudio();
    if (!player) return;
    stopSound();
    const version = audioGeneration;
    soundActive = true;
    player.muted = false;
    player.volume = soundVolume;
    // Sound is an enhancement, never a prerequisite for showing or closing
    // the artwork. Autoplay denial and a failed download leave the UI intact.
    try {
      void Promise.resolve(player.play()).then(() => {
        if (player === audio && version === audioGeneration) audioPrimed = true;
        else if (player !== audio || !soundActive) { player.muted = true; player.pause(); }
      }, () => {
        if (player === audio && version === audioGeneration) stopSound();
      });
    } catch { stopSound(); }
  }

  if (soundUrl) {
    document.addEventListener('pointerdown', primeAudio, true);
    document.addEventListener('keydown', primeAudio, true);
  }

  function wait(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolve) => {
      const cancel = () => {
        window.clearTimeout(timer);
        cancellations.delete(cancel);
        signal?.removeEventListener('abort', cancel);
        resolve();
      };
      const timer = window.setTimeout(cancel, ms);
      cancellations.add(cancel);
      signal?.addEventListener('abort', cancel, { once: true });
    });
  }

  function readyImage(src: string, signal?: AbortSignal, timeout = IMAGE_WAIT_MS) {
    const warmed = getWarmedAchievementImage(src);
    if (warmed) return Promise.resolve(warmed);
    return new Promise<HTMLImageElement | null>((resolve) => {
      const image = new Image();
      let finished = false;
      const usable = () => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
      const finish = (ready: boolean) => {
        if (finished) return;
        finished = true;
        window.clearTimeout(timer);
        cancellations.delete(cancel);
        signal?.removeEventListener('abort', cancel);
        image.onload = null;
        image.onerror = null;
        if (!ready) image.removeAttribute('src');
        resolve(ready ? image : null);
      };
      const cancel = () => finish(false);
      const timer = window.setTimeout(cancel, timeout);
      cancellations.add(cancel);
      signal?.addEventListener('abort', cancel, { once: true });
      image.alt = '';
      image.decoding = 'async';
      image.fetchPriority = 'high';
      image.onload = () => {
        image.onload = null;
        if (!usable()) { finish(false); return; }
        try {
          if (image.decode) void image.decode().then(() => finish(usable()), () => finish(false));
          else finish(true);
        } catch { finish(false); }
      };
      image.onerror = () => finish(false);
      image.src = src;
      if (image.complete) image.onload?.(new Event('load'));
    });
  }

  function element(tag: string, suffix: string, text?: string) {
    const result = document.createElement(tag);
    result.className = `achievement-reveal__${suffix}`;
    if (text) result.textContent = text;
    return result;
  }

  type IllustratedAward = EarnedAchievement & { image: HTMLImageElement };

  function display(awards: IllustratedAward[], hero: HTMLImageElement | null) {
    if (disposed || suspended || !awards.length) return Promise.resolve(false);
    presenting = true;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const effect = document.createElement('div');
    effect.className = `achievement-reveal${awards.length > 1 ? ' achievement-reveal--multiple' : ''}`;
    effect.setAttribute('role', 'dialog');
    effect.setAttribute('aria-modal', 'true');
    effect.setAttribute('aria-label', awards.length > 1 ? `解锁 ${awards.length} 项成就` : `解锁成就：${awards[0].name}`);
    effect.tabIndex = -1;
    const sky = element('div', 'sky');
    sky.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 12; i++) {
      const star = element('i', 'star');
      star.style.setProperty('--star-index', `${i}`);
      star.style.setProperty('--star-left', `${8 + (i * 37) % 86}%`);
      star.style.setProperty('--star-top', `${8 + (i * 19) % 81}%`);
      sky.appendChild(star);
    }
    effect.appendChild(sky);
    const panel = element('div', 'panel');
    const eyebrow = element('div', 'eyebrow', 'ACHIEVEMENT UNLOCKED');
    panel.appendChild(eyebrow);
    if (hero) {
      const artwork = element('div', 'artwork');
      const orbit = element('div', 'orbit');
      orbit.setAttribute('aria-hidden', 'true');
      artwork.appendChild(orbit);
      hero.className = 'achievement-reveal__image';
      artwork.appendChild(hero);
      panel.appendChild(artwork);
    }
    panel.appendChild(element('h2', 'title', awards.length === 1 ? awards[0].name : `${awards.length} 项成就，一起点亮`));
    if (awards.length === 1) panel.appendChild(element('p', 'description', awards[0].description));
    else {
      const collection = element('ul', 'collection');
      collection.setAttribute('aria-label', '本次解锁的成就');
      for (const award of awards) {
        const tile = element('li', 'tile');
        tile.title = `${award.name}：${award.description}`;
        const icon = element('span', 'thumbnail');
        icon.appendChild(award.image);
        tile.appendChild(icon);
        const text = element('span', 'tile-text');
        text.appendChild(element('strong', 'tile-name', award.name));
        text.appendChild(element('span', 'tile-description', award.description));
        tile.appendChild(text);
        collection.appendChild(tile);
      }
      panel.appendChild(collection);
    }
    panel.appendChild(element('p', 'saved', '已点亮个人主页成就墙'));
    panel.appendChild(element('p', 'hint', '点击任意处或按下任意键收起'));
    effect.appendChild(panel);
    const background = Array.from(document.body.children).map((node) => ({
      node: node as HTMLElement,
      inert: (node as HTMLElement).inert,
    }));
    for (const { node } of background) node.inert = true;
    document.body.style.overflow = 'hidden';
    document.body.appendChild(effect);
    effect.focus({ preventScroll: true });

    return new Promise<boolean>((resolve) => {
      let armed = false;
      let leaving = false;
      let finished = false;
      let exitTimer = 0;
      let pointer: { id: number, x: number, y: number } | null = null;
      const block = (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      const cleanup = (dismissed: boolean) => {
        if (finished) return;
        finished = true;
        presenting = false;
        stopSound();
        window.clearTimeout(armTimer);
        window.clearTimeout(exitTimer);
        window.cancelAnimationFrame(frame);
        document.removeEventListener('keydown', onKey, true);
        document.removeEventListener('keyup', block, true);
        document.removeEventListener('pointerdown', onPointerDown, true);
        document.removeEventListener('pointerup', onPointerUp, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('contextmenu', onContextMenu, true);
        document.removeEventListener('focusin', onFocus, true);
        effect.remove();
        for (const { node, inert } of background) node.inert = inert;
        document.body.style.overflow = previousOverflow;
        if (dismissed && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
        finishDisplay = undefined;
        resolve(dismissed);
      };
      const dismiss = () => {
        if (!armed || leaving) return;
        leaving = true;
        stopSound();
        effect.classList.add('is-leaving');
        // Keep the dialog and capture handlers through pointerup/click so the
        // dismissal can never also submit code or open a link underneath it.
        exitTimer = window.setTimeout(() => cleanup(true), reducedMotion ? 80 : EXIT_MS);
      };
      const onKey = (event: KeyboardEvent) => {
        block(event);
        if (event.repeat || event.isComposing) return;
        dismiss();
      };
      const onPointerDown = (event: PointerEvent) => {
        // A touch drag may scroll a large collection without dismissing it.
        if (event.pointerType !== 'touch') block(event);
        pointer = armed ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
      };
      const onPointerUp = (event: PointerEvent) => {
        block(event);
        if (pointer?.id === event.pointerId && Math.hypot(pointer.x - event.clientX, pointer.y - event.clientY) < 12) dismiss();
        pointer = null;
      };
      const onClick = (event: MouseEvent) => {
        block(event);
        // Keyboard/screen-reader activation has no pointerdown/up pair.
        if (event.detail === 0) dismiss();
      };
      const onContextMenu = (event: MouseEvent) => {
        block(event);
        dismiss();
      };
      const onFocus = (event: FocusEvent) => {
        if (!effect.contains(event.target as Node)) effect.focus({ preventScroll: true });
      };
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('keyup', block, true);
      document.addEventListener('pointerdown', onPointerDown, true);
      document.addEventListener('pointerup', onPointerUp, true);
      document.addEventListener('click', onClick, true);
      document.addEventListener('contextmenu', onContextMenu, true);
      document.addEventListener('focusin', onFocus, true);
      const armTimer = window.setTimeout(() => {
        armed = true;
        effect.classList.add('is-ready');
      }, INPUT_GUARD_MS);
      const frame = window.requestAnimationFrame(() => {
        if (finished || leaving || disposed || suspended) return;
        effect.classList.add('is-visible');
        playSound();
      });
      finishDisplay = () => cleanup(false);
    });
  }

  async function pending(rid: string | undefined, version: number, requireConfirmation = false) {
    let available: EarnedAchievement[] = [];
    for (const pause of POLL_DELAYS) {
      if (pause) await wait(pause);
      if (disposed || suspended || generation !== version) break;
      try {
        const result = await options.fetchPending(rid);
        if (disposed || suspended || generation !== version) break;
        available = highestAwards((result?.achievements || []).filter((item) => item && typeof item.id === 'string' && item.name));
        if (result?.settled === true || (result?.settled !== false && available.length)) return available;
      } catch {
        // A transient network failure must neither acknowledge nor suppress an
        // award: it can still be fetched on the next visit to the user's page.
      }
    }
    return disposed || suspended || generation !== version || requireConfirmation ? [] : available;
  }

  function unseenAwards(awards: EarnedAchievement[]) {
    return awards.filter((award) => {
      if (shown.has(award.id)) return false;
      const series = seriesOf(award);
      return !series || series.rank > (shownSeries.get(series.id) ?? 0);
    });
  }

  function artworkKey(awards: EarnedAchievement[]) {
    return JSON.stringify(awards.map(({ id, imageUrl, thumbnailUrl }) => [id, imageUrl, thumbnailUrl]));
  }

  async function readyAwardImage(award: EarnedAchievement, version: number) {
    const active = () => !disposed && !suspended && version === generation;
    const original = assetUrl(award.imageUrl);
    const thumbnail = assetUrl(award.thumbnailUrl);
    if (!active() || (!original && !thumbnail)) return null;
    if (!original) return readyImage(thumbnail);
    const controller = new window.AbortController();
    const { signal } = controller;
    try {
      const full = readyImage(original, signal);
      if (!thumbnail || thumbnail === original) {
        const image = await full;
        return image || (active() ? await readyImage(original, signal) : null);
      }
      // Start the alternate only on failure or a slow original. A slow
      // download stays eligible while the smaller version is being decoded.
      const quick = await Promise.race([full, wait(THUMBNAIL_DELAY_MS, signal).then(() => null)]);
      if (quick || !active()) return quick;
      const small = readyImage(thumbnail, signal);
      return await Promise.race([full, small]) || await full || await small;
    } finally {
      // Release the delay and any unfinished losing request, never the winner.
      controller.abort();
    }
  }

  async function prepareArtwork(awards: EarnedAchievement[], version: number) {
    const candidates = unseenAwards(awards);
    const prepared = await Promise.all(candidates.map(async (award) => {
      const image = await readyAwardImage(award, version);
      return image ? { ...award, image } : null;
    }));
    const illustrated = prepared.filter((item): item is IllustratedAward => item !== null);
    let hero: HTMLImageElement | null = illustrated[0]?.image ?? null;
    // A group needs an additional image node for its large illustration.
    // Keep the decoded tile nodes even if that duplicate cannot be loaded.
    if (hero && illustrated.length > 1 && !disposed && !suspended && version === generation) hero = await readyImage(hero.src, undefined, THUMBNAIL_DELAY_MS);
    return { key: artworkKey(candidates), illustrated, hero };
  }

  async function waitForTurn(version: number) {
    while (!disposed && !suspended && generation === version && options.canPresent?.() === false) await wait(150);
  }

  function enqueue(rid?: string, acFinished: Promise<unknown> = Promise.resolve()) {
    if (disposed || suspended) return Promise.resolve();
    const key = rid || '@profile';
    if (records.has(key)) return records.get(key)!;
    const version = generation;
    const present = async () => {
      if (disposed || suspended || generation !== version) return;
      // Start the small result request while AC is playing, but do not mount or
      // focus the achievement until that effect's exit animation has finished.
      const loaded = pending(rid, version);
      const prepared = loaded.then((awards) => prepareArtwork(awards, version));
      await acFinished.catch(() => undefined);
      let awards = await loaded;
      let artwork = await prepared;
      await waitForTurn(version);
      if (disposed || suspended || generation !== version) return;
      if (awards.some(seriesOf)) {
        // The prefetched level may have been superseded (or read in another
        // tab) during AC, image loading or a lottery result. Confirm immediately
        // before mounting; an unavailable refresh must never replay the snapshot.
        let confirmed = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          awards = await pending(rid, version, true);
          if (disposed || suspended || generation !== version) return;
          const unique = unseenAwards(awards);
          if (!unique.length) return;
          const artworkMatches = artwork.key === artworkKey(unique);
          if (artworkMatches && options.canPresent?.() !== false) {
            confirmed = true;
            break;
          }
          if (!artworkMatches) artwork = await prepareArtwork(awards, version);
          await waitForTurn(version);
        }
        // Rapid successive upgrades remain pending for a later event/visit,
        // rather than displaying a level that has not been confirmed again.
        if (!confirmed || disposed || suspended || generation !== version) return;
      }
      const { illustrated, hero } = artwork;
      if (!illustrated.length) return;
      illustrated.forEach((award) => {
        shown.add(award.id);
        const series = seriesOf(award);
        if (series) shownSeries.set(series.id, series.rank);
      });
      const dismissed = await display(illustrated, hero);
      if (!dismissed || disposed || generation !== version) return;
      // A failed acknowledgement remains pending on the server. Never claim
      // success locally in persistent storage or acknowledge on pagehide.
      try { await options.acknowledge(illustrated.map((award) => award.id)); } catch { /* Retry on the next explicit presentation. */ }
    };
    const task = queue.then(() => {
      const locks = window.navigator?.locks;
      // A second tab must fetch only after it has acquired the shared lock;
      // otherwise it could display a stale response already dismissed here.
      if (options.lockName && locks?.request) {
        return locks.request(options.lockName, { ifAvailable: true }, (lock) => (lock ? present() : undefined));
      }
      return present();
    });
    const finished = task.catch(() => undefined);
    queue = finished;
    records.set(key, finished);
    // Coalesce in-flight triggers, but allow a later trigger on this same
    // record to fetch artwork that was unavailable on the first attempt.
    void finished.then(() => {
      if (records.get(key) === finished) records.delete(key);
    });
    return finished;
  }

  function cancelPending() {
    generation++;
    finishDisplay?.();
    stopSound(true);
    for (const cancel of [...cancellations]) cancel();
    records.clear();
    shown.clear();
    shownSeries.clear();
    queue = Promise.resolve();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelPending();
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('pointerdown', primeAudio, true);
    document.removeEventListener('keydown', primeAudio, true);
  }

  function onPageHide(event: PageTransitionEvent) {
    suspended = true;
    if (!event.persisted) dispose();
    else cancelPending();
  }

  function onPageShow() { suspended = false; }
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  return { afterResult: enqueue, showPending: () => enqueue(), dispose };
}

/** Use Hydro's request helper so acknowledgements retain its CSRF handling. */
export function createAchievementClient(context: AchievementContext, request: {
  get: (url: string, query?: Record<string, string>, options?: { timeout: number }) => Promise<any>;
  post: (url: string, data: { ids: string[] }, options?: { timeout: number }) => Promise<any>;
}) {
  return createAchievementCelebration({
    sound: context.achievementSound,
    lockName: context.achievementScope ? `hydro:achievements:${context.achievementScope}`
      : context.achievementPendingUrl ? `hydro:achievements:${context.achievementPendingUrl}` : undefined,
    canPresent: () => {
      if (document.querySelector('.achievement-art-viewer[open]')) return false;
      const lottery = document.querySelector<HTMLElement>('[data-point-lottery]');
      if (!lottery || lottery.hidden) return true;
      const result = lottery.querySelector<HTMLElement>('[data-point-lottery-result]');
      return !lottery.querySelector('[data-point-lottery-chest-stage][aria-busy="true"]') && (!result || result.hidden);
    },
    fetchPending: (rid) => {
      if (!context.achievementPendingUrl || !context.achievementAckUrl) return Promise.resolve({ achievements: [], settled: true });
      return request.get(context.achievementPendingUrl, rid ? { rid } : {}, { timeout: 10000 });
    },
    acknowledge: (ids) => (context.achievementAckUrl
      ? request.post(context.achievementAckUrl, { ids }, { timeout: 10000 })
      : Promise.resolve()),
  });
}
