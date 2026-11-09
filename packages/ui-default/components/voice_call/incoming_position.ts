/** Each new incoming call starts in the center. A teacher's repeat snapshot or a
 * connection recovery must not undo the student's position while deciding. */
export function positionIncomingVoiceCard(card: HTMLElement, handle: HTMLElement) {
  const win = card.ownerDocument.defaultView!;
  let callId: string | null = null;
  let position: { x: number; y: number } | null = null;
  let frame = 0;
  let drag: { id: number; x: number; y: number; left: number; top: number; moved: boolean } | null = null;
  const clamp = (value: number, max: number) => Math.max(0, Math.min(max, value));
  function bounds() {
    const viewport = win.visualViewport;
    const width = viewport?.width || win.innerWidth;
    const height = viewport?.height || win.innerHeight;
    return { left: (viewport?.offsetLeft || 0) + 12, top: (viewport?.offsetTop || 0) + 12,
      width: Math.max(0, width - card.offsetWidth - 24), height: Math.max(0, height - card.offsetHeight - 24) };
  }
  function place() {
    frame = 0;
    if (!callId || card.hidden) return;
    const box = bounds();
    card.style.left = `${Math.round(box.left + (position?.x ?? .5) * box.width)}px`;
    card.style.top = `${Math.round(box.top + (position?.y ?? .5) * box.height)}px`;
    card.style.right = 'auto'; card.style.bottom = 'auto';
  }
  const schedule = () => { if (!frame && callId) frame = win.requestAnimationFrame(place); };
  function move(left: number, top: number) {
    const box = bounds();
    position = { x: box.width ? clamp(left - box.left, box.width) / box.width : .5,
      y: box.height ? clamp(top - box.top, box.height) / box.height : .5 };
    place();
  }
  function finish(event?: PointerEvent) {
    if (!drag || event && event.pointerId !== drag.id) return;
    const id = drag.id; drag = null; card.classList.remove('is-dragging');
    if (card.hasPointerCapture(id)) card.releasePointerCapture(id);
  }
  const start = (event: PointerEvent) => {
    if (!callId || !event.isPrimary || event.button !== 0
      || (event.target as Element)?.closest('button,a,input,textarea,select,[contenteditable="true"]')) return;
    const box = card.getBoundingClientRect();
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: box.left, top: box.top, moved: false };
    card.setPointerCapture(event.pointerId); event.preventDefault();
  };
  const moving = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x; const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true; card.classList.add('is-dragging'); event.preventDefault();
    move(drag.left + dx, drag.top + dy);
  };
  const keys = (event: KeyboardEvent) => {
    if (!callId) return;
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (event.key === 'Home') { event.preventDefault(); position = null; place(); }
    else if (steps[event.key]) {
      event.preventDefault(); const box = card.getBoundingClientRect(); const step = event.shiftKey ? 1 : 10;
      move(box.left + steps[event.key][0] * step, box.top + steps[event.key][1] * step);
    }
  };
  card.addEventListener('pointerdown', start); card.addEventListener('pointermove', moving);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) card.addEventListener(type, finish);
  handle.addEventListener('keydown', keys);
  win.addEventListener('resize', schedule); win.visualViewport?.addEventListener('resize', schedule);
  win.visualViewport?.addEventListener('scroll', schedule);
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  observer?.observe(card);
  return {
    update(next: string | null) {
      if (next !== callId) { finish(); position = null; }
      callId = next;
      if (next) {
        card.dataset.voiceIncomingPosition = '';
        handle.tabIndex = 0; handle.setAttribute('role', 'button');
        handle.setAttribute('aria-label', '移动来电窗口，方向键调整位置，Home 键居中');
        handle.title = '拖动来电窗口';
        place();
      } else {
        delete card.dataset.voiceIncomingPosition;
        handle.removeAttribute('tabindex'); handle.removeAttribute('role'); handle.removeAttribute('aria-label'); handle.removeAttribute('title');
      }
    },
    dispose() {
      finish(); callId = null; win.cancelAnimationFrame(frame); observer?.disconnect();
      card.removeEventListener('pointerdown', start); card.removeEventListener('pointermove', moving);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) card.removeEventListener(type, finish);
      handle.removeEventListener('keydown', keys);
      win.removeEventListener('resize', schedule); win.visualViewport?.removeEventListener('resize', schedule);
      win.visualViewport?.removeEventListener('scroll', schedule);
    },
  };
}
