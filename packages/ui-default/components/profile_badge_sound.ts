type AudioFactory = (source: string) => HTMLAudioElement;
const bindings = new WeakMap<HTMLElement, () => void>();
const SOUND_VOLUME = 0.25;

function sourcesIn(root: Document | HTMLElement) {
  const sources = Array.from(root.querySelectorAll<HTMLElement>('[data-profile-badge-sound]'));
  if ((root as HTMLElement).matches?.('[data-profile-badge-sound]')) sources.unshift(root as HTMLElement);
  return sources;
}

function bindSource(sourceNode: HTMLElement, createAudio: AudioFactory) {
  const existing = bindings.get(sourceNode);
  if (existing) return existing;
  const source = sourceNode.dataset.profileBadgeSound?.trim();
  const doc = sourceNode.ownerDocument;
  const win = doc.defaultView;
  if (!source || !win) return () => {};

  let audio: HTMLAudioElement | null = null;
  let generation = 0;
  let disposed = false;
  let hasAttempted = false;

  function setState(state: string) {
    sourceNode.dataset.soundState = state;
  }

  function clearGestureRetry() {
    doc.removeEventListener('click', onGesture);
    doc.removeEventListener('keydown', onGesture);
  }

  function resetTime() {
    if (!audio) return;
    try { audio.currentTime = 0; } catch { /* Metadata may not be available yet. */ }
  }

  function stop() {
    generation++;
    clearGestureRetry();
    audio?.pause();
    resetTime();
    setState('stopped');
  }

  function onEnded() {
    if (disposed) return;
    generation++;
    clearGestureRetry();
    setState('ended');
  }

  function onError() {
    if (disposed) return;
    generation++;
    clearGestureRetry();
    audio?.pause();
    setState('error');
  }

  async function play(allowGestureRetry: boolean) {
    if (disposed || doc.hidden || !sourceNode.isConnected) return;
    hasAttempted = true;
    if (!audio) {
      try {
        audio = createAudio(source);
        audio.volume = SOUND_VOLUME;
        audio.loop = false;
        audio.preload = 'none';
        audio.addEventListener('ended', onEnded);
        audio.addEventListener('error', onError);
      } catch {
        setState('error');
        return;
      }
    }
    const attempt = ++generation;
    setState('loading');
    try {
      await audio.play();
      if (disposed) { audio.pause(); return; }
      if (attempt !== generation) {
        if (doc.hidden || sourceNode.dataset.soundState === 'stopped') audio.pause();
        return;
      }
      if (doc.hidden) { stop(); return; }
      clearGestureRetry();
      setState('playing');
    } catch (error) {
      if (disposed || attempt !== generation) return;
      clearGestureRetry();
      if (error?.name !== 'NotAllowedError') { setState('error'); return; }
      setState('blocked');
      if (allowGestureRetry && !doc.hidden) {
        // Use the next ordinary gesture once, without cancelling the action
        // or capturing it. A second rejection remains silent and final.
        doc.addEventListener('click', onGesture);
        doc.addEventListener('keydown', onGesture);
      }
    }
  }

  function onGesture(event: Event) {
    const key = event as KeyboardEvent;
    if (event.type === 'keydown' && (key.repeat || ['Shift', 'Control', 'Alt', 'Meta'].includes(key.key))) return;
    clearGestureRetry();
    void play(false);
  }

  function onVisibilityChange() {
    if (doc.hidden) stop();
    else if (!hasAttempted) void play(true);
  }

  function onPageHide(event: PageTransitionEvent) {
    // Returning from bfcache must never resume an old greeting.
    if (event.persisted) stop();
    else dispose();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    generation++;
    clearGestureRetry();
    doc.removeEventListener('visibilitychange', onVisibilityChange);
    win.removeEventListener('pagehide', onPageHide);
    if (audio) {
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      resetTime();
      audio.removeAttribute('src');
      audio.load();
    }
    bindings.delete(sourceNode);
    setState('disposed');
  }

  bindings.set(sourceNode, dispose);
  doc.addEventListener('visibilitychange', onVisibilityChange);
  win.addEventListener('pagehide', onPageHide);
  setState('idle');
  void play(true);
  return dispose;
}

export function bindProfileBadgeSound(root: Document | HTMLElement = document, createAudio: AudioFactory = (source) => new Audio(source)) {
  const disposers = sourcesIn(root).map((source) => bindSource(source, createAudio));
  return () => disposers.forEach((dispose) => dispose());
}

export function disposeProfileBadgeSound(root: Document | HTMLElement) {
  sourcesIn(root).forEach((source) => bindings.get(source)?.());
}
