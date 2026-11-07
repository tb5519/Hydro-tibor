interface Box { left: number; top: number; width: number; height: number }

/** Choose the nearest clear placement, using stable viewport coordinates. */
export function voicePosition(view: Box, size: { width: number; height: number }, obstacles: Box[], edge = 24, gap = 12) {
  const minX = view.left + Math.min(edge, view.width / 2);
  const minY = view.top + Math.min(edge, view.height / 2);
  const maxX = Math.max(minX, view.left + view.width - edge - size.width);
  const maxY = Math.max(minY, view.top + view.height - edge - size.height);
  const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
  const xs = new Set([maxX, minX]); const ys = new Set([maxY, minY]);
  for (const box of obstacles) {
    xs.add(clamp(box.left - gap - size.width, minX, maxX));
    xs.add(clamp(box.left + box.width + gap, minX, maxX));
    ys.add(clamp(box.top - gap - size.height, minY, maxY));
    ys.add(clamp(box.top + box.height + gap, minY, maxY));
  }
  let best = { left: maxX, top: maxY, score: Infinity };
  for (const left of xs) for (const top of ys) {
    let overlap = 0;
    for (const box of obstacles) {
      overlap += Math.max(0, Math.min(left + size.width, box.left + box.width + gap) - Math.max(left, box.left - gap))
        * Math.max(0, Math.min(top + size.height, box.top + box.height + gap) - Math.max(top, box.top - gap));
    }
    // Prefer a short upward move to a large sideways jump. Any clear position
    // beats an overlapping one, including after the assistant menu opens.
    const score = overlap * 1e6 + Math.abs(left - maxX) * 1.2 + Math.abs(top - maxY);
    if (score < best.score) best = { left, top, score };
  }
  return { left: Math.round(best.left), top: Math.round(best.top) };
}

export function positionVoiceOverlays(overlays: HTMLElement[]) {
  let disposed = false; let frame = 0;
  const assistant = document.querySelector<HTMLElement>('[data-teacher-assistant]');
  const visible = (node: HTMLElement) => !node.hidden && !!node.getClientRects().length
    && getComputedStyle(node).visibility !== 'hidden';
  function place() {
    frame = 0; if (disposed) return;
    const viewport = window.visualViewport;
    const view = { left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
      width: viewport?.width || window.innerWidth, height: viewport?.height || window.innerHeight };
    const obstacles: Box[] = [];
    if (assistant && visible(assistant)) {
      for (const node of assistant.querySelectorAll<HTMLElement>('[data-assistant-toggle],[data-assistant-panel]')) {
        if (visible(node)) {
          const box = node.getBoundingClientRect();
          if (box.width && box.height) obstacles.push(box);
        }
      }
    }
    for (const overlay of overlays) {
      if (!visible(overlay)) continue;
      const box = overlay.getBoundingClientRect();
      const target = voicePosition(view, box, obstacles, view.width < 480 ? 16 : 24);
      const left = `${target.left}px`; const top = `${target.top}px`;
      if (overlay.style.left !== left) overlay.style.left = left;
      if (overlay.style.top !== top) overlay.style.top = top;
      overlay.style.right = 'auto'; overlay.style.bottom = 'auto';
    }
  }
  function schedule() { if (!frame && !disposed) frame = window.requestAnimationFrame(place); }
  const mutation = new MutationObserver(schedule);
  if (assistant) mutation.observe(assistant, { subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  for (const overlay of overlays) mutation.observe(overlay, { attributes: true, attributeFilter: ['class', 'hidden'] });
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  for (const overlay of overlays) resize?.observe(overlay);
  if (assistant) for (const node of assistant.querySelectorAll<HTMLElement>('[data-assistant-toggle],[data-assistant-panel]')) resize?.observe(node);
  window.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('resize', schedule);
  window.visualViewport?.addEventListener('scroll', schedule);
  schedule();
  return () => {
    disposed = true; window.cancelAnimationFrame(frame); mutation.disconnect(); resize?.disconnect();
    window.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('resize', schedule);
    window.visualViewport?.removeEventListener('scroll', schedule);
  };
}
