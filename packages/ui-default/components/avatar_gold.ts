import { drawGoldAvatarBorder, GOLD_AVATAR_PADDING } from './avatar_gold_drawing';
import type { GoldAvatarOptions } from './avatar_gold_drawing';

interface AvatarEligibility {
  uid: number;
  badgeCount: number;
  // Keep the existing server eligibility identifier compatible with already-open pages.
  effect: 'electric-arc' | null;
}

const SELECTOR = 'img[data-badge-avatar-uid], img[src*="#badge-avatar-uid="]';
const CACHE_MS = 60_000;

function avatarBorderRadii(image: HTMLImageElement, style: CSSStyleDeclaration, width: number, height: number) {
  const layoutWidth = image.offsetWidth || width;
  const layoutHeight = image.offsetHeight || height;
  const length = (value: string, size: number) => Math.max(0, (Number.parseFloat(value) || 0)
    * (value.endsWith('%') ? size / 100 : 1));
  const radii = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius]
    .map((value) => {
      const [x, y = x] = value.split(/\s+/);
      const rx = length(x, layoutWidth) * width / layoutWidth;
      const ry = length(y, layoutHeight) * height / layoutHeight;
      return rx && ry ? { x: rx, y: ry } : { x: 0, y: 0 };
    });
  // CSS scales all corner radii together when adjacent corners exceed an edge.
  const scale = Math.min(1, width / (radii[0].x + radii[1].x || 1), width / (radii[3].x + radii[2].x || 1),
    height / (radii[0].y + radii[3].y || 1), height / (radii[1].y + radii[2].y || 1));
  return radii.map(({ x, y }) => ({ x: x * scale, y: y * scale })) as GoldAvatarOptions['radii'];
}

export function avatarEffectUid(image: HTMLImageElement): number | null {
  const raw = image.dataset.badgeAvatarUid || image.getAttribute('src')?.match(/#badge-avatar-uid=(\d+)$/)?.[1];
  if (!raw || !/^[1-9]\d*$/.test(raw)) return null;
  const uid = Number(raw);
  return Number.isSafeInteger(uid) ? uid : null;
}

/** One decoration layer escapes clipping and stacking contexts without changing layout or click targets. */
export function installAvatarGoldEffects(endpoint: string) {
  const layer = document.createElement('div');
  layer.className = 'avatar-gold-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.style.cssText = 'position:fixed;inset:0;margin:0;padding:0;border:0;max-width:none;max-height:none;'
    + 'width:100%;height:100%;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
  layer.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  const style = document.createElement('style');
  style.textContent = '.avatar-gold-layer::backdrop{background:transparent;pointer-events:none}';
  document.head.append(style);
  const topLayerSupported = typeof layer.showPopover === 'function';
  if (topLayerSupported) layer.setAttribute('popover', 'manual');
  const raiseLayer = () => {
    const parent = document.fullscreenElement || document.body;
    if (layer.parentElement !== parent) parent.append(layer);
    if (!topLayerSupported) return;
    try {
      // Reopen after a new dialog/popover enters the top layer, so its own avatars can glow too.
      if (layer.matches(':popover-open')) layer.hidePopover();
      layer.showPopover();
    } catch {
      layer.removeAttribute('popover');
    }
  };
  raiseLayer();

  const avatars = new Map<HTMLImageElement, number>();
  const cache = new Map<number, { eligible: boolean; until: number }>();
  const pending = new Set<number>();
  const requests = new Set<AbortController>();
  const sprites = new Map<string, { canvas: HTMLCanvasElement; stamp: number }>();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let destroyed = false;
  let scanTimer: ReturnType<typeof setTimeout>;
  let frame = 0;
  let idleTimer: ReturnType<typeof setTimeout>;
  let lastFrame = 0;
  let wasPainted = false;

  async function refreshEligibility() {
    if (destroyed || document.hidden) return;
    const now = Date.now();
    const ids = [...new Set(avatars.values())].filter((uid) => !pending.has(uid) && (cache.get(uid)?.until || 0) <= now);
    ids.forEach((uid) => pending.add(uid));
    for (let start = 0; start < ids.length; start += 100) {
      if (destroyed) break;
      const batch = ids.slice(start, start + 100);
      const abort = new AbortController();
      requests.add(abort);
      const timeout = setTimeout(() => abort.abort(), 8000);
      try {
        const url = new URL(endpoint, window.location.href);
        url.searchParams.set('uids', batch.join(','));
        const response = await fetch(url.toString(), {
          credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: abort.signal,
        });
        if (!response.ok) throw new Error('Avatar decoration is unavailable');
        const result = await response.json();
        if (!Array.isArray(result.users)) throw new Error('Invalid avatar decoration response');
        if (destroyed) return;
        const rows = new Map<number, AvatarEligibility>(result.users.map((row: AvatarEligibility) => [row.uid, row]));
        for (const uid of batch) {
          const row = rows.get(uid);
          cache.set(uid, {
            eligible: row?.effect === 'electric-arc' && Number.isSafeInteger(row.badgeCount) && row.badgeCount >= 5,
            until: Date.now() + CACHE_MS,
          });
        }
      } catch {
        // A decoration failure must never delay page controls or show an error to the learner.
        for (const uid of batch) cache.set(uid, { eligible: false, until: Date.now() + 15_000 });
      } finally {
        clearTimeout(timeout);
        requests.delete(abort);
        batch.forEach((uid) => pending.delete(uid));
      }
    }
    startAnimation();
  }

  function scan() {
    if (destroyed) return;
    avatars.clear();
    document.querySelectorAll<HTMLImageElement>(SELECTOR).forEach((image) => {
      const uid = avatarEffectUid(image);
      if (uid !== null) avatars.set(image, uid);
    });
    void refreshEligibility();
    startAnimation();
  }

  function scheduleScan() {
    clearTimeout(scanTimer);
    scanTimer = setTimeout(scan, 60);
  }

  const hasAvatar = (node: Node) => node instanceof Element && (node.matches(SELECTOR) || !!node.querySelector(SELECTOR));
  const observer = new MutationObserver((records) => {
    if (records.some((record) => record.type === 'attributes'
      ? record.target instanceof HTMLImageElement && (record.target.matches(SELECTOR) || avatars.has(record.target))
      : [...record.addedNodes, ...record.removedNodes].some(hasAvatar))) scheduleScan();
  });
  observer.observe(document.body, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['data-badge-avatar-uid', 'src'],
  });

  function paint(now: number) {
    frame = 0;
    if (destroyed || document.hidden) return;
    const hasEligible = [...avatars.values()].some((uid) => cache.get(uid)?.eligible);
    if (!hasEligible) {
      if (wasPainted) ctx.clearRect(0, 0, canvas.width, canvas.height);
      wasPainted = false;
      return;
    }
    frame = requestAnimationFrame(paint);
    if (now - lastFrame < 32) return;
    lastFrame = now;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = window.innerWidth;
    const height = window.innerHeight;
    if (canvas.width !== Math.ceil(width * dpr) || canvas.height !== Math.ceil(height * dpr)) {
      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    wasPainted = true;
    // Render each size once per frame, then reuse the transparent sprite for all matching avatars.
    const time = reducedMotion.matches ? 2.8 : now / 1000;
    let drawn = 0;
    const opacityCache = new Map<Element, number>();
    const effectiveOpacity = (element: Element): number => {
      if (!element) return 1;
      if (!opacityCache.has(element)) {
        opacityCache.set(element, Number(getComputedStyle(element).opacity) * effectiveOpacity(element.parentElement));
      }
      return opacityCache.get(element);
    };
    for (const [image, uid] of avatars) {
      if (!cache.get(uid)?.eligible || !image.isConnected || !image.complete || !image.naturalWidth) continue;
      const rect = image.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8 || rect.bottom <= 0 || rect.top >= height || rect.right <= 0 || rect.left >= width) continue;
      const computed = getComputedStyle(image);
      const opacity = effectiveOpacity(image);
      if (computed.visibility !== 'visible' || opacity === 0) continue;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      // Do not let a background avatar shine through an unrelated modal or offscreen scroll clip.
      const top = document.elementFromPoint(Math.max(0, Math.min(width - 1, x)), Math.max(0, Math.min(height - 1, y)));
      if (top !== image && !(top?.contains(image) && top !== document.body && top !== document.documentElement)) continue;
      const radii = avatarBorderRadii(image, computed, rect.width, rect.height);
      const key = [rect.width, rect.height, dpr, ...radii.flatMap(({ x: rx, y: ry }) => [rx, ry])].join(',');
      let sprite = sprites.get(key);
      if (!sprite) {
        sprite = { canvas: document.createElement('canvas'), stamp: -1 };
        sprites.set(key, sprite);
      }
      const spriteWidth = rect.width + GOLD_AVATAR_PADDING * 2;
      const spriteHeight = rect.height + GOLD_AVATAR_PADDING * 2;
      const pixelWidth = Math.ceil(spriteWidth * dpr);
      const pixelHeight = Math.ceil(spriteHeight * dpr);
      if (sprite.stamp !== time || sprite.canvas.width !== pixelWidth || sprite.canvas.height !== pixelHeight) {
        if (sprite.canvas.width !== pixelWidth || sprite.canvas.height !== pixelHeight) {
          sprite.canvas.width = pixelWidth;
          sprite.canvas.height = pixelHeight;
        }
        const drawing = sprite.canvas.getContext('2d');
        drawing.setTransform(1, 0, 0, 1, 0, 0);
        drawing.clearRect(0, 0, pixelWidth, pixelHeight);
        drawing.scale(dpr, dpr);
        drawing.translate(GOLD_AVATAR_PADDING, GOLD_AVATAR_PADDING);
        drawGoldAvatarBorder(drawing, time, { width: rect.width, height: rect.height, radii });
        sprite.stamp = time;
      }
      ctx.globalAlpha = opacity;
      ctx.drawImage(sprite.canvas, rect.left - GOLD_AVATAR_PADDING, rect.top - GOLD_AVATAR_PADDING, spriteWidth, spriteHeight);
      drawn++;
    }
    if (sprites.size > 32) sprites.clear();
    if (!drawn || reducedMotion.matches) {
      cancelAnimationFrame(frame);
      frame = 0;
      idleTimer = setTimeout(startAnimation, drawn ? 100 : 250);
    }
  }

  function startAnimation() {
    clearTimeout(idleTimer);
    if (!destroyed && !document.hidden && !frame) frame = requestAnimationFrame(paint);
  }

  function visibilityChanged() {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else { void refreshEligibility(); startAnimation(); }
  }
  function onToggle(event: Event) {
    if (event.target !== layer && (event as ToggleEvent).newState === 'open') raiseLayer();
  }
  document.addEventListener('visibilitychange', visibilityChanged);
  document.addEventListener('toggle', onToggle, true);
  document.addEventListener('fullscreenchange', raiseLayer);
  document.addEventListener('scroll', startAnimation, { capture: true, passive: true });
  document.addEventListener('load', startAnimation, true);
  window.addEventListener('resize', startAnimation);
  const refreshTimer = setInterval(() => { void refreshEligibility(); }, 15_000);
  scan();
  return () => {
    destroyed = true;
    clearTimeout(scanTimer);
    clearTimeout(idleTimer);
    clearInterval(refreshTimer);
    cancelAnimationFrame(frame);
    requests.forEach((request) => request.abort());
    observer.disconnect();
    document.removeEventListener('visibilitychange', visibilityChanged);
    document.removeEventListener('toggle', onToggle, true);
    document.removeEventListener('fullscreenchange', raiseLayer);
    document.removeEventListener('scroll', startAnimation, true);
    document.removeEventListener('load', startAnimation, true);
    window.removeEventListener('resize', startAnimation);
    layer.remove();
    style.remove();
  };
}
