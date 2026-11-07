/** Teacher-local, short-lived annotation drafts. Never stores editor contents or goes to the database. */
export interface AnnotationScope { sessionId: string; url: string }
const PREFIX = 'hydro:lesson-annotations:v1:';
const TTL = 12 * 60 * 60 * 1000;
const MAX_ENTRY = 256 * 1024;
const MAX_TOTAL = 1024 * 1024;
const memory = new Map<string, string>();

export function annotationFingerprint(text: string) {
  let first = 2166136261; let second = 2246822519;
  for (let index = 0; index < text.length; index++) {
    first = Math.imul(first ^ text.charCodeAt(index), 16777619);
    second = Math.imul(second ^ text.charCodeAt(index), 3266489917);
  }
  return `${text.length}-${(first >>> 0).toString(36)}-${(second >>> 0).toString(36)}`;
}
function keyFor(scope: AnnotationScope, kind: string) {
  if (!scope?.sessionId || scope.sessionId.length > 200 || !/^[\w:-]+$/.test(scope.sessionId)) return null;
  try {
    const url = new URL(scope.url, location.href);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.searchParams.sort();
    // Keep route hashes: graphical editors can change documents without changing pathname.
    return `${PREFIX}${scope.sessionId}:${annotationFingerprint(url.href)}:${kind}`;
  } catch { return null; }
}
function entries(): [string, string][] {
  const combined = new Map<string, string>();
  try { for (const key of Object.keys(localStorage).filter((value) => value.startsWith(PREFIX))) combined.set(key, localStorage.getItem(key)!); }
  catch { /* The in-memory fallback is still available when storage is disabled. */ }
  for (const [key, text] of memory) combined.set(key, text);
  return [...combined];
}
function erase(key: string) { memory.delete(key); try { localStorage.removeItem(key); } catch { /* Storage can be disabled. */ } }
function prune() {
  const kept: Array<{ key: string; text: string; at: number }> = [];
  for (const [key, text] of entries()) {
    try {
      const value = JSON.parse(text);
      if (!Number.isFinite(value.at) || Date.now() - value.at > TTL || text.length * 2 > MAX_ENTRY) { erase(key); continue; }
      kept.push({ key, text, at: value.at });
    } catch { erase(key); }
  }
  kept.sort((a, b) => b.at - a.at);
  let total = 0;
  for (const item of kept) { total += item.text.length * 2; if (total > MAX_TOTAL) erase(item.key); }
}
export function readAnnotationCache<T>(scope: AnnotationScope | undefined, kind: string): T[] {
  const key = scope && keyFor(scope, kind);
  if (!key) return [];
  prune();
  try {
    let text = memory.get(key) || null;
    if (!text) try { text = localStorage.getItem(key); } catch { /* No persistent browser storage. */ }
    const item = text && JSON.parse(text);
    return item && Date.now() - item.at <= TTL && Array.isArray(item.value)
      ? item.value.slice(0, 50).filter((entry: any) => entry && typeof entry === 'object' && typeof entry.id === 'string') : [];
  } catch { return []; }
}
export function writeAnnotationCache(scope: AnnotationScope | undefined, kind: string, value: unknown[]) {
  const key = scope && keyFor(scope, kind);
  if (!key) return;
  if (!value.length) { erase(key); return; }
  const kept = value.slice(-50); const at = Date.now();
  let text = JSON.stringify({ at, value: kept });
  while (text.length * 2 > MAX_ENTRY && kept.length > 1) { kept.shift(); text = JSON.stringify({ at, value: kept }); }
  if (text.length * 2 > MAX_ENTRY) return;
  try { localStorage.setItem(key, text); memory.delete(key); } catch { memory.set(key, text); }
  prune();
}
export function clearSessionAnnotations(sessionId: string) {
  for (const [key] of entries()) if (key.startsWith(`${PREFIX}${sessionId}:`)) erase(key);
}

export interface ElementBookmark { path: string; fingerprint: string }
export interface TextBookmark { element: ElementBookmark; index: number }
export function bookmarkElement(element: Element): ElementBookmark | null {
  if (!element.isConnected || element.closest('[data-live-share-ui],[data-live-share-private]')) return null;
  const path: string[] = [];
  for (let current: Element | null = element; current; current = current.parentElement) {
    const siblings = current.parentElement ? [...current.parentElement.children].filter((node) => node.localName === current!.localName) : [current];
    path.unshift(`${current.localName}:nth-of-type(${siblings.indexOf(current) + 1})`);
    if (path.length > 32) return null;
  }
  return { path: path.join('>'), fingerprint: annotationFingerprint(element.textContent || '') };
}
export function resolveElementBookmark(doc: Document, bookmark: ElementBookmark, verifyText = true): Element | null {
  if (!bookmark || typeof bookmark.path !== 'string' || bookmark.path.length > 2000 || !/^[a-z0-9:()>\-]+$/.test(bookmark.path)) return null;
  try {
    const node = doc.querySelector(bookmark.path);
    return node && (!verifyText || annotationFingerprint(node.textContent || '') === bookmark.fingerprint) ? node : null;
  } catch { return null; }
}
export function bookmarkText(node: Node): TextBookmark | null {
  if (node.nodeType !== 3 || !node.parentElement) return null;
  const element = bookmarkElement(node.parentElement);
  return element ? { element, index: [...node.parentElement.childNodes].filter((child) => child.nodeType === 3).indexOf(node as Text) } : null;
}
export function resolveTextBookmark(doc: Document, bookmark: TextBookmark): Node | null {
  if (!bookmark || !Number.isInteger(bookmark.index) || bookmark.index < 0) return null;
  const parent = resolveElementBookmark(doc, bookmark.element);
  return parent ? [...parent.childNodes].filter((node) => node.nodeType === 3)[bookmark.index] || null : null;
}
