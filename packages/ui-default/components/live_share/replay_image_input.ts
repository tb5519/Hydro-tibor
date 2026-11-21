import { drawingNodeGeometry, intersectDrawingClip } from './drawing_anchor';
import { problemImageContainers } from './problem_images';

// The mirror and drawing surface can be loaded in separate browser bundles.
// Only nodes created in the trusted viewer document carry this binding.
const replayImageHit = Symbol.for('hydro.live-share.image-hit');
type ImageSurface = HTMLDivElement & { [replayImageHit]?: (event: MouseEvent, requireImage: boolean) => Element | null };

export function replayImageTarget(event: MouseEvent) {
  return (event.target as ImageSurface | null)?.[replayImageHit]?.(event, true);
}

export function attachReplayImageInput(frame: HTMLIFrameElement, host: HTMLElement, enabled: () => boolean,
  click: (event: MouseEvent, target: Element) => void, wheel: (event: WheelEvent, target: Element) => void) {
  const doc = frame.contentDocument!;
  let delivered = false;
  const probe = () => { delivered = true; };
  doc.addEventListener('hydro-image-input-test', probe, { once: true });
  doc.dispatchEvent(new Event('hydro-image-input-test'));
  doc.removeEventListener('hydro-image-input-test', probe);
  if (delivered) return () => {};

  // WebKit suppresses even trusted parent listeners registered in a
  // script-disabled replay. Only the visible part of each figure needs an
  // input surface. The replay itself keeps its original sandbox restrictions.
  const surfaces = new Map<HTMLImageElement, ImageSurface>();
  const win = host.ownerDocument.defaultView!;
  const sizeChanges = win.ResizeObserver ? new win.ResizeObserver(() => update()) : null;
  let images = new Set<HTMLImageElement>();
  let dirty = true;
  function surfaceFor(image: HTMLImageElement) {
    const surface = host.ownerDocument.createElement('div') as ImageSurface;
    surface.dataset.liveShareImageInput = '';
    surface.dataset.liveShareUi = '';
    surface.setAttribute('aria-hidden', 'true');
    surface.style.cssText = 'position:absolute;z-index:1;overflow:hidden;background:transparent';
    surface[replayImageHit] = (event, requireImage) => {
      if (!enabled() || frame.contentDocument !== doc) return null;
      const box = frame.getBoundingClientRect();
      if (!box.width || !box.height) return null;
      const x = (event.clientX - box.left) * frame.offsetWidth / box.width - frame.clientLeft;
      const y = (event.clientY - box.top) * frame.offsetHeight / box.height - frame.clientTop;
      const underPointer = doc.elementFromPoint(x, y);
      if (!requireImage || underPointer === image) return underPointer;
      // rrweb can replace the image node while keeping the same visible
      // rectangle. Resolve a new image under the pointer before its next paint.
      return underPointer?.tagName === 'IMG' && underPointer.closest(problemImageContainers)
        && drawingNodeGeometry(underPointer, 'element', host) ? underPointer : null;
    };
    surface.addEventListener('click', event => {
      const node = surface[replayImageHit]!(event, false);
      if (node && !event.ctrlKey && !event.metaKey) click(event, node);
    });
    surface.addEventListener('wheel', event => {
      const node = surface[replayImageHit]!(event, false);
      if (node) wheel(event, node);
    }, { passive: false });
    surfaces.set(image, surface); host.append(surface);
    return surface;
  }
  function update() {
    if (!enabled() || !host.isConnected || host.ownerDocument.hidden) {
      for (const surface of surfaces.values()) surface.hidden = true;
      return;
    }
    if (dirty) {
      const current = new Set([...doc.images].filter(image => image.closest(problemImageContainers)));
      for (const image of images) if (!current.has(image)) {
        sizeChanges?.unobserve(image); surfaces.get(image)?.remove(); surfaces.delete(image);
      }
      for (const image of current) if (!images.has(image)) sizeChanges?.observe(image);
      images = current;
      dirty = false;
    }
    for (const image of images) {
      const geometry = drawingNodeGeometry(image, 'element', host);
      let surface = surfaces.get(image);
      if (geometry) {
        const [sx, , , sy, x, y] = geometry.matrix;
        const bounds = intersectDrawingClip(geometry.clip, { x, y, width: image.offsetWidth * sx, height: image.offsetHeight * sy });
        if (bounds.width > 0 && bounds.height > 0) {
          surface ||= surfaceFor(image);
          surface.hidden = false;
          for (const key of ['left', 'top', 'width', 'height'] as const) {
            const value = bounds[key === 'left' ? 'x' : key === 'top' ? 'y' : key] + 'px';
            if (surface.style[key] !== value) surface.style[key] = value;
          }
          continue;
        }
      }
      if (surface) surface.hidden = true;
    }
  }
  const observer = new MutationObserver(records => {
    let layoutChanged = false;
    for (const record of records) {
      if ((record.target as Element).closest?.(problemImageContainers)) layoutChanged = true;
      if (record.type === 'childList' || record.attributeName === 'class') dirty = true;
    }
    if (layoutChanged || dirty && !images.size) update();
  });
  observer.observe(doc, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['class', 'style', 'src', 'width', 'height', 'hidden'] });
  // Layout can move from source scrolling even when frame scroll listeners
  // are suppressed. Keep measurements local to the figures in this one replay.
  const timer = win.setInterval(update, 80);
  const first = win.requestAnimationFrame(update);
  return () => { observer.disconnect(); sizeChanges?.disconnect(); win.clearInterval(timer); win.cancelAnimationFrame(first);
    for (const surface of surfaces.values()) surface.remove(); surfaces.clear(); };
}
