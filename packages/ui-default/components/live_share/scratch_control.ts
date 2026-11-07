/** Remote gestures for our own opaque Scratch runtime. No scripts run in the replay. */
export interface ScratchInput {
  type: 'pointer' | 'wheel' | 'text' | 'key';
  phase?: 'down' | 'move' | 'up' | 'cancel';
  gesture?: string;
  x?: number; y?: number; dx?: number; dy?: number;
  value?: string; key?: string;
}
const PRIVATE = 'input[type=password],input[type=file],input[type=hidden],[data-private],[data-sensitive],[data-live-share-ui],[data-live-share-private],a[download],iframe,object,embed';
const KEYS = ['Enter', 'Escape', 'Tab', 'Backspace', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'];
const elementOf = (node: any): Element | null => node?.nodeType === 1 ? node : node?.parentElement || null;
const field = (node: Element | null): node is HTMLInputElement | HTMLTextAreaElement => !!node
  && /^(INPUT|TEXTAREA)$/.test(node.tagName) && !node.matches(PRIVATE) && !(node as HTMLInputElement).readOnly && !(node as HTMLInputElement).disabled;
function safe(node: Element | null) {
  if (!node?.isConnected || node.closest(PRIVATE) || node.closest('[inert]')) return false;
  const control = node.closest('button,a,[role=button],[role=menuitem],li[class*=menu-item],label');
  if (control?.matches('a[href]')) return false;
  // Project persistence, system file dialogs and capture permissions stay local.
  const label = `${node.getAttribute('aria-label') || ''} ${node.getAttribute('title') || ''}
    ${control?.getAttribute('aria-label') || ''} ${control?.getAttribute('title') || ''} ${control?.textContent || ''}`;
  return !/(?:保存|下载|上传|导入|导出|新建|新作品|从.*加载|退出|登录|录音|摄像头|分享作品|save|download|upload|import|export|\bnew\b|load from|sign in|log out|record sound|camera)/i.test(label);
}
/** Workspace children change on every drag; bind to the element identity, not all descendant text. */
export function scratchTargetFingerprint(element: Element) {
  const identity = [element.tagName, ...['id', 'name', 'type', 'data-id', 'role', 'aria-label', 'title']
    .map((key) => element.getAttribute(key) || '')].join('|');
  let hash = 2166136261;
  for (let i = 0; i < identity.length; i++) hash = Math.imul(hash ^ identity.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function validScratchInput(input: ScratchInput) {
  if (!input || !['pointer', 'wheel', 'text', 'key'].includes(input.type)) return false;
  const point = () => [input.x, input.y].every((v) => Number.isFinite(v) && v >= 0 && v <= 16384);
  if (input.type === 'pointer') return point() && ['down', 'move', 'up', 'cancel'].includes(input.phase)
    && typeof input.gesture === 'string' && /^[\w-]{8,96}$/.test(input.gesture);
  if (input.type === 'wheel') return point() && [input.dx, input.dy].every((v) => Number.isFinite(v) && Math.abs(v) <= 3000);
  if (input.type === 'text') return typeof input.value === 'string' && input.value.length <= 1000;
  return KEYS.includes(input.key);
}

export function attachSourceScratchControl() {
  let drag: { id: string; node: Element; x: number; y: number; moved: boolean; at: number } | null = null;
  const mouse = (type: string, node: Element, x: number, y: number, buttons: number) => node.dispatchEvent(new MouseEvent(type,
    { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons, detail: type === 'click' ? 1 : 0 }));
  const pointer = (type: string, node: Element, x: number, y: number, buttons: number) => node.dispatchEvent(new PointerEvent(type,
    { bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, button: 0, buttons, pointerId: 919, pointerType: 'mouse', isPrimary: true }));
  const finish = () => {
    if (!drag) return;
    const previous = drag; drag = null;
    const node = document.elementFromPoint(previous.x, previous.y) || document.documentElement;
    pointer('pointercancel', node, previous.x, previous.y, 0);
    mouse('mouseup', node, previous.x, previous.y, 0);
  };
  const timeout = setInterval(() => { if (drag && Date.now() - drag.at > 2500) finish(); }, 500);
  // A learner's physical click always takes control back from an unfinished gesture.
  const local = (event: Event) => { if (event.isTrusted) finish(); };
  document.addEventListener('pointerdown', local, true);
  return {
    receive(raw: Node | null, input: ScratchInput) {
      if (!validScratchInput(input)) return false;
      const node = elementOf(raw);
      if (input.type === 'pointer' && input.phase !== 'down') {
        if (!drag || drag.id !== input.gesture) return false;
        const hit = document.elementFromPoint(input.x, input.y) || document.documentElement;
        drag.moved ||= Math.hypot(input.x - drag.x, input.y - drag.y) > 3;
        drag.x = input.x; drag.y = input.y; drag.at = Date.now();
        if (input.phase === 'move') { pointer('pointermove', hit, input.x, input.y, 1); mouse('mousemove', hit, input.x, input.y, 1); }
        else {
          const previous = drag; drag = null;
          pointer(input.phase === 'cancel' ? 'pointercancel' : 'pointerup', hit, input.x, input.y, 0);
          mouse('mouseup', hit, input.x, input.y, 0);
          if (input.phase === 'up' && !previous.moved && safe(previous.node) && (previous.node === hit || previous.node.contains(hit) || hit.contains(previous.node))) {
            const target = hit instanceof HTMLElement ? hit : hit.closest<HTMLElement>('button,[role=button]');
            if (target) target.click(); else mouse('click', hit, input.x, input.y, 0);
          }
        }
        return true;
      }
      if (!safe(node)) return false;
      if (input.type === 'pointer') {
        finish();
        const hit = document.elementFromPoint(input.x, input.y);
        if (!safe(hit) || !(node === hit || node.contains(hit) || hit.contains(node))) return false;
        const bounds = node.getBoundingClientRect();
        if (input.x < bounds.left - 2 || input.x > bounds.right + 2 || input.y < bounds.top - 2 || input.y > bounds.bottom + 2) return false;
        drag = { id: input.gesture, node: hit, x: input.x, y: input.y, moved: false, at: Date.now() };
        if (field(hit)) hit.focus({ preventScroll: true });
        pointer('pointerdown', hit, input.x, input.y, 1); mouse('mousedown', hit, input.x, input.y, 1);
        return true;
      }
      if (input.type === 'wheel') {
        // The inert replay can hit the SVG root instead of its transparent
        // background rect. Use the learner's real hit target within that node.
        const hit = document.elementFromPoint(input.x, input.y);
        if (!safe(hit) || !(node === hit || node.contains(hit) || hit.contains(node))) return false;
        const accepted = hit.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, view: window,
          clientX: input.x, clientY: input.y, deltaX: input.dx, deltaY: input.dy, deltaMode: 0 }));
        if (accepted) {
          let scroll: Element | null = hit;
          while (scroll && scroll !== document.documentElement) {
            const style = getComputedStyle(scroll);
            if ((/(auto|scroll)/.test(style.overflowY) && scroll.scrollHeight > scroll.clientHeight)
              || (/(auto|scroll)/.test(style.overflowX) && scroll.scrollWidth > scroll.clientWidth)) break;
            scroll = scroll.parentElement;
          }
          scroll ||= document.scrollingElement;
          if (scroll) { scroll.scrollLeft += input.dx; scroll.scrollTop += input.dy; }
        }
        return true;
      }
      if (input.type === 'text') {
        if (!field(node)) return false;
        const prototype = node.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(node, input.value);
        node.dispatchEvent(new Event('input', { bubbles: true }));
        node.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }
      if (!field(node) && !node.closest('.blocklyWidgetDiv,.blocklyDropDownDiv')) return false;
      const keyCode = { Enter: 13, Escape: 27, Tab: 9, Backspace: 8, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 }[input.key];
      node.dispatchEvent(new KeyboardEvent('keydown', { key: input.key, code: input.key, keyCode, which: keyCode, bubbles: true, cancelable: true }));
      node.dispatchEvent(new KeyboardEvent('keyup', { key: input.key, code: input.key, keyCode, which: keyCode, bubbles: true }));
      if (input.key === 'Enter' && field(node)) node.blur();
      return true;
    },
    reset: finish,
    dispose() { finish(); clearInterval(timeout); document.removeEventListener('pointerdown', local, true); },
  };
}

export function attachViewerScratchControl(options: { document: Document; send: (node: Element, input: ScratchInput) => void }) {
  const doc = options.document;
  const win = doc.defaultView;
  let drag: { id: string; pointer: number; node: Element; x: number; y: number } | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: ScratchInput | null = null;
  let wheelTimer: ReturnType<typeof setTimeout> | undefined;
  let wheelPending: { node: Element; input: ScratchInput } | null = null;
  const flushWheel = () => {
    clearTimeout(wheelTimer); wheelTimer = undefined;
    if (wheelPending) options.send(wheelPending.node, wheelPending.input);
    wheelPending = null;
  };
  const clamp = (v: number) => Math.max(0, Math.min(16384, v));
  const flush = () => { clearTimeout(timer); timer = undefined; if (drag && pending) options.send(drag.node, pending); pending = null; };
  const stop = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const down = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const node = elementOf(event.target);
    if (!safe(node)) { stop(event); return; }
    event.stopImmediatePropagation();
    if (!field(node)) event.preventDefault();
    flushWheel();
    const id = `scratch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    drag = { id, pointer: event.pointerId, node, x: clamp(event.clientX), y: clamp(event.clientY) };
    options.send(node, { type: 'pointer', phase: 'down', gesture: id, x: drag.x, y: drag.y });
    try { doc.documentElement.setPointerCapture(event.pointerId); } catch { /* Synthetic fixture pointers. */ }
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    stop(event); drag.x = clamp(event.clientX); drag.y = clamp(event.clientY);
    pending = { type: 'pointer', phase: 'move', gesture: drag.id, x: drag.x, y: drag.y };
    timer ||= setTimeout(flush, 32);
  };
  const up = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    stop(event); flush();
    options.send(drag.node, { type: 'pointer', phase: event.type === 'pointercancel' ? 'cancel' : 'up', gesture: drag.id,
      x: clamp(event.clientX), y: clamp(event.clientY) });
    const id = drag.pointer; drag = null;
    try { doc.documentElement.releasePointerCapture(id); } catch { /* Already released. */ }
  };
  const wheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    const target = elementOf(event.target);
    const node = target?.closest('[class*=gui_blocks-wrapper]') || target?.closest('.injectionDiv') || target?.closest('.blocklyFlyout,.blocklySvg') || target;
    if (!safe(node)) { stop(event); return; }
    stop(event);
    const multiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? win.innerHeight : 1;
    if (wheelPending && wheelPending.node !== node) flushWheel();
    const dx = (wheelPending?.input.dx || 0) + event.deltaX * multiplier;
    const dy = (wheelPending?.input.dy || 0) + event.deltaY * multiplier;
    wheelPending = { node, input: { type: 'wheel', x: clamp(event.clientX), y: clamp(event.clientY),
      dx: Math.max(-3000, Math.min(3000, dx)), dy: Math.max(-3000, Math.min(3000, dy)) } };
    wheelTimer ||= setTimeout(flushWheel, 32);
  };
  const text = (event: Event) => { const node = elementOf(event.target); if (field(node)) { event.stopImmediatePropagation(); options.send(node, { type: 'text', value: node.value.slice(0, 1000) }); } };
  const key = (event: KeyboardEvent) => {
    const node = elementOf(event.target);
    if (field(node)) {
      event.stopImmediatePropagation();
      if (['Enter', 'Escape', 'Tab'].includes(event.key)) { event.preventDefault(); options.send(node, { type: 'key', key: event.key }); }
    }
  };
  const click = (event: MouseEvent) => { if (event.button === 0) stop(event); };
  const reset = () => {
    clearTimeout(timer); timer = undefined; pending = null;
    clearTimeout(wheelTimer); wheelTimer = undefined; wheelPending = null;
    if (drag) options.send(drag.node, { type: 'pointer', phase: 'cancel', gesture: drag.id, x: drag.x, y: drag.y });
    drag = null;
  };
  doc.addEventListener('pointerdown', down, true); doc.addEventListener('pointermove', move, true);
  doc.addEventListener('pointerup', up, true); doc.addEventListener('pointercancel', up, true);
  doc.addEventListener('wheel', wheel, { capture: true, passive: false }); doc.addEventListener('click', click, true);
  doc.addEventListener('input', text, true); doc.addEventListener('change', text, true); doc.addEventListener('keydown', key, true);
  win.addEventListener('blur', reset);
  return () => {
    reset(); doc.removeEventListener('pointerdown', down, true); doc.removeEventListener('pointermove', move, true);
    doc.removeEventListener('pointerup', up, true); doc.removeEventListener('pointercancel', up, true);
    doc.removeEventListener('wheel', wheel, true); doc.removeEventListener('click', click, true);
    doc.removeEventListener('input', text, true); doc.removeEventListener('change', text, true); doc.removeEventListener('keydown', key, true);
    win.removeEventListener('blur', reset);
  };
}
