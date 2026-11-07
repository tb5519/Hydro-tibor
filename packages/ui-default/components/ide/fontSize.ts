import type * as monaco from 'monaco-editor';

export const IDE_FONT_MIN = 10;
export const IDE_FONT_MAX = 40;
export const IDE_FONT_DEFAULT = 14;
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
  return subscribeIdeFontSize(apply);
}
