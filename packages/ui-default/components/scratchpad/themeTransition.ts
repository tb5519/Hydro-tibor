import { flushSync } from 'react-dom';

interface ThemeTransition {
  cancelled: boolean;
  animations: Set<Animation>;
  waiting: Set<() => void>;
}

let activeTransition: ThemeTransition | undefined;

function release(transition: ThemeTransition) {
  for (const animation of transition.animations) {
    // A partially supported animate() can throw before waitForAnimations subscribes.
    try { animation.finished?.catch(() => undefined); } catch { /* No completion promise is available. */ }
    try { animation.cancel(); } catch { /* A detached surface may already have cancelled its animation. */ }
  }
  transition.animations.clear();
  for (const finish of [...transition.waiting]) finish();
  if (activeTransition === transition) activeTransition = undefined;
}

function waitForAnimations(transition: ThemeTransition, animations: Animation[], duration: number) {
  return new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      transition.waiting.delete(finish);
      resolve();
    };
    // Some browser/media power-saving modes never settle Animation.finished.
    const timer = setTimeout(finish, duration + 180);
    transition.waiting.add(finish);
    const finished = animations.map((animation) => animation.finished);
    if (finished.every((promise) => typeof promise?.then === 'function')) {
      Promise.all(finished).then(finish, finish);
    }
    if (transition.cancelled) finish();
  });
}

function nextFrame(transition: ThemeTransition) {
  return new Promise<void>((resolve) => {
    let settled = false;
    let frame: number;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      transition.waiting.delete(finish);
      resolve();
    };
    const timer = setTimeout(finish, 80);
    transition.waiting.add(finish);
    if (typeof window.requestAnimationFrame === 'function') frame = window.requestAnimationFrame(finish);
    if (transition.cancelled) finish();
  });
}

function animateSurfaces(transition: ThemeTransition, surfaces: HTMLElement[], from: number, to: number, duration: number) {
  const animations: Animation[] = [];
  try {
    const startTime = document.timeline?.currentTime;
    for (const surface of surfaces) {
      const animation = surface.animate([{ opacity: from }, { opacity: to }], {
        duration,
        easing: to === 0 ? 'ease-in' : 'ease-out',
        fill: 'both',
      });
      transition.animations.add(animation);
      animations.push(animation);
      // Both surfaces use the same timeline position, including on a busy frame.
      if (typeof startTime === 'number') animation.startTime = startTime;
    }
    return animations;
  } catch {
    // An incomplete Web Animations implementation should still allow changing themes.
    return null;
  }
}

/** Fade the existing editor surfaces together without replacing editor or form DOM. */
export function transitionScratchpadTheme(
  commit: () => void,
  isCurrent: () => boolean,
  options: { immediate?: boolean } = {},
): Promise<boolean> {
  if (activeTransition) {
    activeTransition.cancelled = true;
    release(activeTransition);
  }
  if (!isCurrent()) return Promise.resolve(false);

  const surfaces = typeof document === 'undefined' ? [] : [...document.querySelectorAll<HTMLElement>(
    '#scratchpad .scratchpad__coding-area, #scratchpad .scratchpad__tablist',
  )].filter((surface) => {
    const style = window.getComputedStyle(surface);
    return surface.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  });
  const immediate = options.immediate || !surfaces.length || document.hidden
    || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    || surfaces.some((surface) => typeof surface.animate !== 'function');
  if (immediate) {
    try {
      flushSync(commit);
      return Promise.resolve(true);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  const transition: ThemeTransition = { cancelled: false, animations: new Set(), waiting: new Set() };
  activeTransition = transition;
  const current = () => !transition.cancelled && isCurrent();
  return (async () => {
    let committed = false;
    try {
      const outgoing = animateSurfaces(transition, surfaces, 1, 0, 110);
      if (outgoing) await waitForAnimations(transition, outgoing, 110);
      if (!current()) return false;
      if (!outgoing) release(transition);

      // React context, palette variables and Monaco colors become visible in one commit.
      flushSync(commit);
      committed = true;
      if (!outgoing || !current()) return committed;

      // Keep the finished outgoing animations at zero until the new theme is rendered.
      await nextFrame(transition);
      if (!current()) return committed;
      const incoming = animateSurfaces(transition, surfaces, 0, 1, 220);
      if (!incoming) return committed;
      for (const animation of outgoing) {
        animation.cancel();
        transition.animations.delete(animation);
      }
      await waitForAnimations(transition, incoming, 220);
      return committed;
    } finally {
      release(transition);
    }
  })();
}
