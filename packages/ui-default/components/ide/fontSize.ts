import type * as monaco from 'monaco-editor';

export const IDE_FONT_MIN = 10;
export const IDE_FONT_MAX = 40;
export const IDE_FONT_DEFAULT = 14;
export const CODE_FONT_STEP = 2;
type FontDirection = 1 | -1;
const wheelHandlers = new WeakMap<HTMLElement, (direction: FontDirection) => void>();

export function steppedCodeFont(size: number, direction: FontDirection) {
  return Math.min(IDE_FONT_MAX, Math.max(IDE_FONT_MIN, size + direction * CODE_FONT_STEP));
}

export function codeFontWheelHandler(node: HTMLElement) { return wheelHandlers.get(node); }

export function usesMacFontShortcuts() {
  return typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || '');
}

export function isCodeFontWheel(event: WheelEvent) {
  return event.ctrlKey || event.metaKey && usesMacFontShortcuts();
}

export function attachCodeFontWheel(node: HTMLElement, adjust: (direction: FontDirection) => void) {
  let lastTime = -Infinity;
  let remainder = 0;
  let gestureScale = 0;
  const consume = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
  const onCodeSurface = (event: Event) => {
    const control = (event.target as Element)?.closest?.('input,button,select,textarea,[contenteditable="true"]');
    return !control || control === node || control.matches('.inputarea,.native-edit-context');
  };
  const wheel = (event: WheelEvent) => {
    if (!isCodeFontWheel(event) || !event.deltaY || event.defaultPrevented || !onCodeSurface(event)) return;
    consume(event);
    if (gestureScale) return;
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight || 100 : 1);
    // A trackpad may emit dozens of subpixel events for a single gesture.
    const start = event.timeStamp - lastTime > 180;
    lastTime = event.timeStamp;
    remainder = start ? delta : remainder + delta;
    if (!start && Math.abs(remainder) < 32) return;
    adjust(remainder < 0 ? 1 : -1);
    remainder = 0;
  };
  const key = (event: KeyboardEvent) => {
    if (!event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.defaultPrevented || !onCodeSurface(event)) return;
    if (event.key !== '+' && event.key !== '=' && event.key !== '-') return;
    consume(event);
    adjust(event.key === '-' ? -1 : 1);
  };
  // Safari emits gesture events for a pinch. Chrome reports it as a Ctrl-wheel.
  const gesture = (event: Event) => {
    if (event.defaultPrevented || !onCodeSurface(event)) return;
    if (event.type === 'gesturestart') gestureScale = 1;
    if (!gestureScale) return;
    consume(event);
    const scale = (event as Event & { scale: number }).scale;
    if (Number.isFinite(scale) && scale > 0) {
      const steps = Math.trunc(Math.log(scale / gestureScale) / Math.log(1.12));
      if (steps) {
        gestureScale *= 1.12 ** steps;
        for (let index = 0; index < Math.min(6, Math.abs(steps)); index++) adjust(steps > 0 ? 1 : -1);
      }
    }
    if (event.type === 'gestureend') gestureScale = 0;
  };
  wheelHandlers.set(node, adjust);
  node.setAttribute('data-code-font-wheel', '');
  const capture = { capture: true, passive: false };
  node.addEventListener('wheel', wheel, capture);
  const mac = usesMacFontShortcuts();
  if (mac) {
    node.addEventListener('keydown', key, true);
    for (const type of ['gesturestart', 'gesturechange', 'gestureend']) node.addEventListener(type, gesture, capture);
  }
  return () => {
    wheelHandlers.delete(node);
    node.removeAttribute('data-code-font-wheel');
    node.removeEventListener('wheel', wheel, true);
    if (mac) {
      node.removeEventListener('keydown', key, true);
      for (const type of ['gesturestart', 'gesturechange', 'gestureend']) node.removeEventListener(type, gesture, true);
    }
  };
}

export function attachProblemTextareaFont(node: HTMLTextAreaElement) {
  const read = () => {
    try { return JSON.parse(localStorage.getItem('editor.config') || '{}') || {}; } catch { return {}; }
  };
  const saved = read().fontSize;
  if (typeof saved === 'number' && saved > 0) node.style.fontSize = `${saved}px`;
  return attachCodeFontWheel(node, (direction) => {
    const size = steppedCodeFont(parseFloat(getComputedStyle(node).fontSize) || IDE_FONT_DEFAULT, direction);
    node.style.fontSize = `${size}px`;
    try { localStorage.setItem('editor.config', JSON.stringify({ ...read(), fontSize: size })); } catch { /* Keep the page usable without storage. */ }
  });
}
const changeEvent = 'hydro:ide-font-size';
const memory = new Map<string, number>();
function storageKey() {
  return `hydro:ide:font-size:${typeof UserContext === 'undefined' ? 0 : Number(UserContext._id) || 0}`;
}
function normalize(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= IDE_FONT_MIN && number <= IDE_FONT_MAX ? Math.round(number) : IDE_FONT_DEFAULT;
}
export function getIdeFontSize() {
  const key = storageKey();
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return memory.get(key) ?? normalize(stored);
  } catch { /* Private browsing still keeps the preference for this page. */ }
  return memory.get(key) ?? IDE_FONT_DEFAULT;
}
export function setIdeFontSize(value: number) {
  const next = normalize(Math.min(IDE_FONT_MAX, Math.max(IDE_FONT_MIN, value)));
  memory.set(storageKey(), next);
  try { localStorage.setItem(storageKey(), String(next)); } catch { /* Keep the current editor usable without storage. */ }
  window.dispatchEvent(new window.Event(changeEvent));
}
export function subscribeIdeFontSize(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === storageKey()) { memory.delete(storageKey()); notify(); }
  };
  window.addEventListener(changeEvent, notify); window.addEventListener('storage', onStorage);
  return () => { window.removeEventListener(changeEvent, notify); window.removeEventListener('storage', onStorage); };
}
export function attachIdeEditorFont(editor: monaco.editor.IStandaloneCodeEditor) {
  const apply = () => editor.updateOptions({ fontSize: getIdeFontSize() });
  apply();
  const unsubscribe = subscribeIdeFontSize(apply);
  const unbind = attachCodeFontWheel(editor.getDomNode()!, (direction) => setIdeFontSize(steppedCodeFont(getIdeFontSize(), direction)));
  return () => { unbind(); unsubscribe(); };
}
