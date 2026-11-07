import { record, Replayer } from './vendor';
import { attachAnnotationSurface, ShareAnnotation } from './annotation';
import { sharedSash, resizeSharedSash, SHARED_SPLIT_SELECTOR } from './splitter';
import { attachSourceScratchControl, attachViewerScratchControl, scratchTargetFingerprint, ScratchInput } from './scratch_control';

/** The replay is a display surface. Its scripts, forms and links never run. */
const BLOCK = [
  '.monaco-editor', '[data-live-share-editor]', '[data-live-share-ui]', '[data-live-share-private]', '[data-teacher-assistant]',
  '.live-share', '.live-share-shell', 'iframe', 'object', 'embed',
  'input[type="password"]', 'input[type="hidden"]', 'input[type="file"]',
  '[autocomplete="current-password"]', '[autocomplete="new-password"]', '[autocomplete="one-time-code"]',
  '[data-private]', '[data-sensitive]', '[name*="token" i]', '[name*="password" i]',
  '[name*="secret" i]', '[name*="csrf" i]', '#secret', '#qrcode', '[name="tfa_code"]',
].join(',');
const MAX_EVENT_BYTES = 8 * 1024 * 1024;
const MAX_QUEUED_BYTES = 12 * 1024 * 1024;
const MAX_CHUNKS = 768;
const CHUNK_CHARS = 16 * 1024;
const EDITOR_MARKER = 'data-live-share-editor';
const FRAME_MARKER = 'data-live-share-frame';
const CANVAS_FRAME_BYTES = 48 * 1024;
const CANVAS_BYTES_PER_SECOND = 128 * 1024;
const validEditorId = (id: unknown): id is string => typeof id === 'string' && /^[\w-]{1,128}$/.test(id);
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type RREvent = { type: number; timestamp: number; data: any };
export interface MirrorCommand {
  id: string;
  pageId: string;
  nodeId: number;
  action: 'click' | 'scroll' | 'select' | 'search' | 'annotate' | 'resize' | 'scratch';
  input?: ScratchInput;
  annotationId?: string;
  annotation?: ShareAnnotation | null;
  target?: string;
  value?: string;
  x?: number;
  y?: number;
}
export interface MirrorAck { id: string; pageId: string; ok: boolean; reason?: string }
interface SourceOptions {
  pageId: string;
  inlineLocalImages?: boolean;
  showNonSensitiveInputs?: boolean;
  scratchControls?: boolean;
  beforeRasterCapture?: (canvas: HTMLCanvasElement) => void;
  send: (data: any) => void | boolean;
  sendAck?: (data: MirrorAck) => void;
  onStatus?: (message: string) => void;
}
interface ViewerOptions {
  pageId: string;
  container: HTMLElement;
  sendCommand: (data: MirrorCommand) => void;
  scratchControls?: boolean;
  onViewport?: (size: { width: number; height: number }) => void;
  /** Local viewing only. Coordinates/deltas are in the teacher viewport's CSS pixels. */
  onViewZoom?: (gesture: { delta: number; clientX: number; clientY: number }) => void;
  /** Scroll deltas (previous minus current pointer position) for natural grab panning. */
  onViewPan?: (gesture: { dx: number; dy: number }) => void;
  onStatus?: (message: string) => void;
}

const dangerousSegments = /\/(?:manage|management|account|login|logout|register|lostpass|oauth|sudo|tfa|webauthn|switch|language|payment|pay|purchase|checkout|create|edit|config|delete|remove|save|rejudge|cancel|join|leave|attend|copy|publish|share|download|file|files|settings|security|password|changeMail|token|api|storage|restart|shutdown|reset|revoke|ack|draw|upload|import|export|bind|unbind|hack)(?:\/|$)/i;

/** A remote click can navigate only an existing, safe study link on the student's page. */
export function safeStudyUrl(raw: string, base: string): string | null {
  try {
    if (typeof raw !== 'string' || raw.length > 2048) return null;
    const url = new URL(raw, base);
    const origin = new URL(base).origin;
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    let path = decodeURIComponent(url.pathname);
    if (/[\\%\u0000-\u0020]/.test(path) || path.includes('//')) return null;
    path = path.replace(/^\/d\/[^/]+(?=\/|$)/, '') || '/';
    if (dangerousSegments.test(path)) return null;
    if ([...url.searchParams.keys()].some((key) => /(?:operation|action|method|token|secret|password|passwd|credential|auth|sid|reviewUid|mergedUid|csrf|redirect|return|next)/i.test(key))) return null;
    // Viewing is not restricted to a hand-maintained list of study pages. The
    // student's own server-rendered link and normal permissions determine what
    // can open; sensitive routes and actions remain excluded above. Form posts
    // and arbitrary buttons still never execute through the replay.
    return url.href;
  } catch { return null; }
}

function closestElement(node: any): Element | null {
  return node?.nodeType === 1 ? node : node?.parentElement || null;
}
const STUDY_UI_CONTROLS = [
  '[name="problem-sidebar__open-scratchpad"]', '[name="problem-sidebar__quit-scratchpad"]',
  '#scratchpad .scratchpad__toolbar__pretest',
  '#scratchpad [data-control-art="pretestTab"]', '#scratchpad [data-control-art="recordsTab"]',
  '#scratchpad .scratchpad__tablist > button', '#scratchpad .scratchpad__tabicon-problem',
  '.domain-switcher__trigger', '[data-training-description-toggle]', 'details > summary',
  '[name="show_tags"]', '[name="problem-sidebar__show-category"]',
  '[data-mistake-prompt-open]', '[data-mistake-prompt-close]', '.contest-practice-result__continue',
  '.problem-record-picker__close', '.problem-record-picker__filters button',
  '.problem-record-picker__retry', '.problem-record-picker__more',
  '.widget--category-filter__tag', '.search-tag__item', '[data-category-container] [data-category]', '.toggle-tag',
  '[data-student-unac-filter]', '[data-student-unac-clear]',
  ...['view', 'tag-review', 'clear-tag', 'more', 'session', 'retry-session'].map((action) => `[data-learning-action="${action}"]`),
].join(',');
const STUDY_CHOICE = [
  '[data-daily-quiz-form] input[name="daily-quiz-answer"]',
  '.sc-quiz__card input[name="scratch-quiz-answer"]',
].join(',');
function allowedStudyChoice(element: Element): element is HTMLInputElement {
  return element.matches(STUDY_CHOICE) && ['radio', 'checkbox'].includes((element as HTMLInputElement).type);
}
function interactive(node: any): HTMLElement | null {
  const element = closestElement(node)?.closest<HTMLElement>(`a,button,input,select,summary,label,[role="tab"],${STUDY_UI_CONTROLS}`);
  if (element?.tagName === 'LABEL') {
    // Quiz choices put the visible text outside the radio/checkbox. Resolve
    // that label to its actual control, including when its icon was clicked.
    const choice = (element as HTMLLabelElement).control;
    return choice && element.contains(choice) && allowedStudyChoice(choice) ? choice : null;
  }
  return element || null;
}
function blocked(element: Element | null): boolean {
  return !element || !!element.closest(BLOCK) || !!element.closest('[inert]');
}

const ANNOTATION_EXCLUDED = `${BLOCK},input,textarea,select,button,script,style,noscript,[contenteditable]:not([contenteditable="false"])`;
function annotationText(node: Node | null, doc: Document): node is Text {
  return !!node && node.nodeType === 3 && node.ownerDocument === doc && node.isConnected
    && !blocked(node.parentElement) && !node.parentElement?.closest(ANNOTATION_EXCLUDED);
}

/** Text-node identities and the selected text anchor a mark to content, not a screen resolution. */
function annotationRange(doc: Document, mirror: any, value: ShareAnnotation | null): Range | null {
  if (!value || typeof value.quote !== 'string' || !value.quote.trim() || value.quote.length > 4000
    || typeof value.text !== 'string' || value.text.length > 1000
    || typeof value.noteOpen !== 'boolean'
    || (value.width !== undefined && (!Number.isFinite(value.width) || value.width < 36 || value.width > 960))
    || (value.height !== undefined && (!Number.isFinite(value.height) || value.height < 36 || value.height > 800))
    || ![value.startNodeId, value.endNodeId].every((id) => Number.isSafeInteger(id) && id > 0)
    || ![value.startOffset, value.endOffset].every((offset) => Number.isSafeInteger(offset) && offset >= 0)
    || ![value.offsetX, value.offsetY].every((offset) => Number.isFinite(offset) && Math.abs(offset) <= 10000)) return null;
  const start = mirror?.getNode(value.startNodeId);
  const end = mirror?.getNode(value.endNodeId);
  if (!annotationText(start, doc) || !annotationText(end, doc)
    || value.startOffset > start.length || value.endOffset > end.length) return null;
  try {
    const range = doc.createRange();
    range.setStart(start, value.startOffset); range.setEnd(end, value.endOffset);
    if (range.collapsed || range.toString() !== value.quote) return null;
    const ancestor = closestElement(range.commonAncestorContainer);
    // A forged range must not cross a private field, even with public endpoints.
    if (!ancestor || [...ancestor.querySelectorAll(ANNOTATION_EXCLUDED)].some((node) => range.intersectsNode(node))) return null;
    return range;
  } catch { return null; }
}

function annotationRect(range: Range | null) {
  if (!range) return null;
  const doc = range.startContainer.ownerDocument;
  type Clip = { left: number; top: number; right: number; bottom: number };
  const clips = new Map<Element, Clip | null>();
  const textClip = (element: Element): Clip | null => {
    if (!element || element === doc.body || element === doc.documentElement) {
      return { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    }
    if (clips.has(element)) return clips.get(element);
    const parent = textClip(element.parentElement);
    const style = doc.defaultView.getComputedStyle(element);
    if (!parent || style.visibility === 'hidden' || style.display === 'none') { clips.set(element, null); return null; }
    const clip = { ...parent };
    const bounds = element.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip|overlay)/.test(style.overflowX)) { clip.left = Math.max(clip.left, bounds.left); clip.right = Math.min(clip.right, bounds.right); }
    if (/(auto|scroll|hidden|clip|overlay)/.test(style.overflowY)) { clip.top = Math.max(clip.top, bounds.top); clip.bottom = Math.min(clip.bottom, bounds.bottom); }
    clips.set(element, clip);
    return clip;
  };
  // Element ranges include whole block boxes. Measure only selected text runs,
  // so wrapped lines and selections spanning paragraphs never frame the gaps.
  const texts: Node[] = [];
  if (range.commonAncestorContainer.nodeType === 3) texts.push(range.commonAncestorContainer);
  else {
    const walker = doc.createTreeWalker(range.commonAncestorContainer, 4);
    let node: Node;
    while ((node = walker.nextNode())) if (range.intersectsNode(node)) texts.push(node);
  }
  const rects: { x: number; y: number; width: number; height: number }[] = [];
  for (const text of texts) {
    const clip = textClip(text.parentElement);
    if (!clip) continue;
    const part = doc.createRange();
    part.selectNodeContents(text);
    if (text === range.startContainer) part.setStart(text, range.startOffset);
    if (text === range.endContainer) part.setEnd(text, range.endOffset);
    if (part.collapsed) continue;
    for (const bounds of Array.from(part.getClientRects())) {
      const left = Math.max(bounds.left, clip.left); const right = Math.min(bounds.right, clip.right);
      const top = Math.max(bounds.top, clip.top); const bottom = Math.min(bounds.bottom, clip.bottom);
      if (right > left && bottom > top) rects.push({ x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x)); const y = Math.min(...rects.map((r) => r.y));
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x,
    height: Math.max(...rects.map((r) => r.y + r.height)) - y, rects };
}
function allowedSelect(element: Element): element is HTMLSelectElement {
  return element.tagName === 'SELECT'
    && element.matches('.scratchpad__toolbar__language select, select[name="lang"], #codelang-selector select');
}
function allowedSearch(element: Element): element is HTMLInputElement {
  const input = element as HTMLInputElement;
  const form = input.form;
  return element.tagName === 'INPUT' && ['search', 'text'].includes(input.type)
    && ['q', 'search'].includes(input.name) && !!form && (form.getAttribute('method') || 'get').toLowerCase() === 'get'
    && !!safeStudyUrl(form.getAttribute('data-live-share-search-action') || form.action, document.location.href);
}
function allowedButton(element: Element) {
  if (element.tagName === 'BUTTON' && (element as HTMLButtonElement).type !== 'button') return false;
  // These existing links intentionally open a read-only record picker. Native
  // source click preserves that UI; location.assign would bypass its handler.
  if (element.matches('a[data-problem-record-picker]')) return !element.hasAttribute('download')
    && !!safeStudyUrl((element as HTMLAnchorElement).href, location.href);
  if (element.tagName === 'A' && !['javascript:;', '#'].includes(element.getAttribute('href') || '')) return false;
  return element.matches(STUDY_UI_CONTROLS);
}
function targetFingerprint(element: Element) {
  // Stable across snapshot rebuilding, but changes when a recycled DOM node points to another item.
  // Replay strips executable hrefs. Named local UI controls still refer to the same node.
  const rawHref = element.getAttribute('href') || '';
  const href = element.tagName === 'A' && rawHref && !['javascript:;', '#'].includes(rawHref)
    ? (element as HTMLAnchorElement).href : '';
  const text = [element.tagName, element.id, element.getAttribute('name') || '', element.getAttribute('type') || '',
    element.getAttribute('aria-describedby') || '',
    ...['data-learning-action', 'data-learning-session', 'data-learning-view', 'data-category', 'data-student-unac-filter', 'data-problem-record-picker']
      .map((key) => element.getAttribute(key) || ''),
    href, element.textContent?.trim().slice(0, 160) || ''].join('|');
  let hash = 2166136261;
  for (let at = 0; at < text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 16777619);
  return (hash >>> 0).toString(16);
}
function disabled(element: HTMLElement) {
  return element.matches(':disabled,[aria-disabled="true"],.disabled') || !element.isConnected;
}

function safePlaceholderStyle(style: unknown) {
  const result: string[] = [];
  if (typeof style !== 'string') return '';
  for (const declaration of style.split(';')) {
    const [property, value] = declaration.split(':').map((part) => part.trim());
    if (['width', 'height', 'top', 'right', 'bottom', 'left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'].includes(property)
      && /^(auto|0|-?\d+(?:\.\d+)?(?:px|%))$/.test(value)
      || property === 'box-sizing' && value === 'border-box'
      || property === 'position' && /^(static|relative|absolute|fixed|sticky)$/.test(value)
      || property === 'display' && /^(none|block|inline|inline-block|flex|inline-flex|grid|inline-grid)$/.test(value)) result.push(`${property}:${value}`);
  }
  return result.join(';');
}

/** Remove executable payloads even if a malformed peer bypassed the normal recorder. */
export function sanitizeMirrorEvent(event: any): RREvent | null {
  if (!event || !Number.isInteger(event.type) || ![0, 1, 2, 3, 4].includes(event.type)
    || !Number.isFinite(event.timestamp) || !event.data || typeof event.data !== 'object') return null;
  if (event.type === 3 && ![0, 1, 2, 3, 4, 5, 6, 7, 8, 12, 13, 14].includes(event.data.source)) return null;
  if (event.type === 3 && event.data.source === 7) {
    const data = event.data;
    if (!Number.isSafeInteger(data.id) || data.id <= 0 || ![0, 1, 2, 3, 4].includes(data.type)
      || !Number.isFinite(data.currentTime) || data.currentTime < 0 || data.currentTime > 7 * 86400
      || !Number.isFinite(data.playbackRate) || data.playbackRate < 0 || data.playbackRate > 16
      || !Number.isFinite(data.volume) || data.volume < 0 || data.volume > 1
      || typeof data.muted !== 'boolean' || typeof data.loop !== 'boolean') return null;
    event.data = { source: 7, id: data.id, type: data.type, currentTime: data.currentTime,
      playbackRate: data.playbackRate, loop: data.loop, muted: true, volume: 0 };
  }
  // Canvas, plugin and custom-script events deliberately are not replayed.
  const cleanAttrs = (attributes: any, tagName = '') => {
    if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) return {};
    for (const key of Object.keys(attributes)) {
      if (key === 'action') {
        const destination = typeof attributes[key] === 'string' && safeStudyUrl(attributes[key], location.href);
        if (destination) attributes['data-live-share-search-action'] = destination;
        else delete attributes['data-live-share-search-action'];
        delete attributes[key];
      } else if (/^(?:on|srcdoc$|nonce$|integrity$|formaction$|target$|autofocus$)/i.test(key)
        || /(?:token|password|secret|csrf)/i.test(key)) delete attributes[key];
      else if (['href', 'src', 'xlink:href'].includes(key)) {
        const value = attributes[key];
        if (typeof value === 'string' && /^\s*(?:javascript|vbscript|file):/i.test(value)) delete attributes[key];
        else if (key === 'src' && typeof value === 'string' && /^blob:/i.test(value)) delete attributes[key];
        else if (typeof value === 'string' && /^\s*data:/i.test(value) && !/^data:image\/(?:png|jpeg|webp|gif|avif);/i.test(value)) delete attributes[key];
      }
    }
    if (['iframe', 'object', 'embed', 'script', 'base', 'meta'].includes(tagName)) {
      const frameId = tagName === 'iframe' && attributes[FRAME_MARKER];
      const frameStyle = validEditorId(frameId) ? safePlaceholderStyle(attributes.style) : '';
      for (const key of Object.keys(attributes)) delete attributes[key];
      if (frameStyle) { attributes[FRAME_MARKER] = frameId; attributes.style = frameStyle; }
    }
    if (['video', 'audio'].includes(tagName)) {
      attributes.rr_mediaMuted = true; attributes.rr_mediaVolume = 0; attributes.muted = '';
      if (!Number.isFinite(attributes.rr_mediaCurrentTime) || attributes.rr_mediaCurrentTime < 0 || attributes.rr_mediaCurrentTime > 7 * 86400) attributes.rr_mediaCurrentTime = 0;
      if (!Number.isFinite(attributes.rr_mediaPlaybackRate) || attributes.rr_mediaPlaybackRate < 0 || attributes.rr_mediaPlaybackRate > 16) attributes.rr_mediaPlaybackRate = 1;
    }
    if (Object.hasOwn(attributes, 'muted')) attributes.muted = '';
    if (Object.hasOwn(attributes, 'rr_mediaMuted')) attributes.rr_mediaMuted = true;
    if (Object.hasOwn(attributes, 'rr_mediaVolume')) attributes.rr_mediaVolume = 0;
    return attributes;
  };
  const roots = event.type === 2 ? [event.data.node] : event.type === 3 && event.data.source === 0
    ? (event.data.adds || []).map((entry) => entry.node) : [];
  const stack = [...roots];
  let count = 0;
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || ++count > 100000) return null;
    const tagName = typeof node.tagName === 'string' ? node.tagName.toLowerCase() : '';
    node.attributes = cleanAttrs(node.attributes, tagName);
    if (['script', 'base', 'meta', 'iframe', 'object', 'embed'].includes(tagName)) {
      node.tagName = 'div';
      node.childNodes = [];
      if (['iframe', 'object', 'embed'].includes(tagName)) {
        const frameId = node.attributes[FRAME_MARKER];
        node.attributes = validEditorId(frameId)
          ? { [FRAME_MARKER]: frameId, style: `background:#f1f5f9;${node.attributes.style}` }
          : { 'data-live-share-unavailable': 'true', style: 'min-height:96px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:12px' };
      }
    }
    if (Array.isArray(node.childNodes)) stack.push(...node.childNodes);
  }
  if (event.type === 3 && event.data.source === 0) {
    for (const entry of event.data.attributes || []) entry.attributes = cleanAttrs(entry.attributes);
  }
  return event;
}

function base64(bytes: Uint8Array) {
  let text = '';
  for (let at = 0; at < bytes.length; at += 8192) text += String.fromCharCode(...bytes.subarray(at, at + 8192));
  return btoa(text);
}
function unbase64(text: string) {
  const value = atob(text);
  return Uint8Array.from(value, (char) => char.charCodeAt(0));
}
async function readBounded(stream: ReadableStream<Uint8Array>, max = MAX_EVENT_BYTES) {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > max) throw new Error('共享页面内容过大，请打开具体题目后重连。');
      chunks.push(value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  finally { reader.releaseLock(); }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

/** Bounded fragments also keep one large initial snapshot from monopolising the socket. */
export async function mirrorPackets(event: RREvent, sequence: number): Promise<any[]> {
  const text = JSON.stringify(event);
  const bytes = encoder.encode(text);
  if (bytes.length > MAX_EVENT_BYTES) throw new Error('共享页面内容过大，请打开具体题目后重连。');
  if (bytes.length < 32 * 1024) return [{ type: 'rrweb', sequence, event }];
  let payload = text;
  let encoding = 'json';
  if (typeof CompressionStream !== 'undefined') {
    const compressed = await readBounded(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')));
    if (compressed.length < bytes.length * 0.7) { payload = base64(compressed); encoding = 'gzip'; }
  }
  const total = Math.ceil(payload.length / CHUNK_CHARS);
  if (total > MAX_CHUNKS) throw new Error('共享页面内容过大，请打开具体题目后重连。');
  const id = `${sequence}-${Math.random().toString(36).slice(2, 12)}`;
  return Array.from({ length: total }, (_, index) => ({ type: 'rrweb-chunk', sequence, id, index, total, encoding,
    chunk: payload.slice(index * CHUNK_CHARS, (index + 1) * CHUNK_CHARS) }));
}

/** A single ordered receiver, with bounded compressed/uncompressed memory and no silent gaps. */
export class MirrorAssembler {
  private fragments = new Map<string, { sequence: number; total: number; encoding: string; chunks: Map<number, string>; size: number; at: number }>();
  private last = 0;
  private size = 0;
  private disposed = false;
  private generation = 0;
  private pending = Promise.resolve();

  constructor(private emit: (event: RREvent) => void, private fail: (message: string) => void) {}

  receive(data: any) {
    if (this.disposed) return;
    const generation = this.generation;
    this.pending = this.pending.then(() => this.consume(data, generation)).catch(() => {
      if (!this.disposed && generation === this.generation) this.fail('共享画面同步中断，请重新连接。');
    });
  }

  private async consume(data: any, generation: number) {
    if (this.disposed || generation !== this.generation || !data || !Number.isSafeInteger(data.sequence) || data.sequence <= this.last) return;
    if (data.type === 'rrweb-batch') {
      if (!Array.isArray(data.events) || !data.events.length || data.events.length > 64
        || encoder.encode(JSON.stringify(data.events)).length > 64 * 1024) throw new Error('invalid batch');
      for (let index = 0; index < data.events.length; index++) {
        await this.consume({ type: 'rrweb', sequence: data.sequence + index, event: data.events[index] }, generation);
      }
      return;
    }
    for (const [id, item] of this.fragments) {
      if (Date.now() - item.at > 30000) { this.fragments.delete(id); this.size -= item.size; throw new Error('expired'); }
    }
    let event = data.type === 'rrweb' ? data.event : null;
    if (data.type === 'rrweb-chunk') {
      if (typeof data.id !== 'string' || data.id.length > 80 || !Number.isInteger(data.total) || data.total < 1 || data.total > MAX_CHUNKS
        || !Number.isInteger(data.index) || data.index < 0 || data.index >= data.total || typeof data.chunk !== 'string'
        || data.chunk.length > CHUNK_CHARS || !['json', 'gzip'].includes(data.encoding)) throw new Error('invalid fragment');
      let entry = this.fragments.get(data.id);
      if (!entry) {
        if (this.fragments.size >= 4) throw new Error('too many pending events');
        entry = { sequence: data.sequence, total: data.total, encoding: data.encoding, chunks: new Map(), size: 0, at: Date.now() };
        this.fragments.set(data.id, entry);
      }
      if (entry.total !== data.total || entry.sequence !== data.sequence || entry.encoding !== data.encoding) throw new Error('inconsistent fragment');
      if (!entry.chunks.has(data.index)) {
        entry.chunks.set(data.index, data.chunk);
        entry.size += data.chunk.length;
        this.size += data.chunk.length;
      }
      if (this.size > MAX_QUEUED_BYTES) throw new Error('too much data');
      if (entry.chunks.size !== entry.total) return;
      this.fragments.delete(data.id);
      this.size -= entry.size;
      let text = Array.from({ length: entry.total }, (_, index) => entry.chunks.get(index)).join('');
      if (entry.encoding === 'gzip') {
        if (typeof DecompressionStream === 'undefined') throw new Error('unsupported compression');
        text = decoder.decode(await readBounded(new Blob([unbase64(text)]).stream().pipeThrough(new DecompressionStream('gzip'))));
      } else if (encoder.encode(text).length > MAX_EVENT_BYTES) throw new Error('too much data');
      event = JSON.parse(text);
    }
    if (!event || this.disposed || generation !== this.generation) return;
    // The source/transport sends events in order. Never apply an incremental event after a missing one.
    if (data.sequence !== this.last + 1 && event.type !== 2 && event.type !== 4) throw new Error('sequence gap');
    const safe = sanitizeMirrorEvent(event);
    if (!safe) throw new Error('unsafe event');
    this.last = data.sequence;
    if (!this.disposed) this.emit(safe);
  }

  reset() { this.generation++; this.fragments.clear(); this.size = 0; this.last = 0; }
  dispose() { this.disposed = true; this.reset(); }
}

export function attachSourceMirror(options: SourceOptions) {
  let disposed = false;
  let connected = true;
  let stop: undefined | (() => void);
  let sequence = 0;
  let generation = 0;
  let queuedBytes = 0;
  let queue: RREvent[] = [];
  let pumping = false;
  let hasSnapshot = false;
  let canvasFrame = 0;
  let canvasOffset = 0;
  let canvasBudget = CANVAS_BYTES_PER_SECOND;
  let canvasBudgetAt = performance.now();
  let canvasImages = new WeakMap<Element, string>();
  let canvasSentAt = new WeakMap<Element, number>();
  let initialImageRefresh = new WeakSet<Element>();
  let mediaStates = new WeakMap<Element, string>();
  let canvasCopy: HTMLCanvasElement | null = null;
  const commands = new Map<string, MirrorAck>();
  const scratchControl = options.scratchControls ? attachSourceScratchControl() : null;
  const editorPlaceholders = new Map<number, string>();
  const newlyBlockedEditors = new WeakSet<Element>();
  const editorGeometry = (node: Element) => {
    const rect = node.getBoundingClientRect();
    const computed = getComputedStyle(node);
    const layout: Record<string, string> = { width: `${rect.width}px`, height: `${rect.height}px`, 'box-sizing': 'border-box' };
    // A blocked textarea can be positioned entirely by inline styles. Keep its
    // layout, but never copy arbitrary styles, background URLs or editor text.
    if (/^(static|relative|absolute|fixed|sticky)$/.test(computed.position)) layout.position = computed.position;
    if (/^(none|block|inline|inline-block|flex|inline-flex|grid|inline-grid)$/.test(computed.display)) layout.display = computed.display;
    for (const property of ['top', 'right', 'bottom', 'left', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left']) {
      const value = computed.getPropertyValue(property);
      if (/^(auto|0|-?\d+(?:\.\d+)?(?:px|%))$/.test(value)) layout[property] = value;
    }
    return layout;
  };
  const placeholderSignature = (marker: string, layout: Record<string, string>) => JSON.stringify([marker, layout]);
  function preserveEditorMarkers(event: RREvent) {
    // rrweb intentionally strips all attributes except class and dimensions on
    // blocked nodes. Retain only our opaque ID so the separate editor can track
    // its empty placeholder while the teacher scrolls, without exposing code.
    if (event.type === 2) editorPlaceholders.clear();
    const stack = event.type === 2 ? [event.data.node] : event.type === 3 && event.data.source === 0
      ? (event.data.adds || []).map((entry) => entry.node) : [];
    while (stack.length) {
      const serialized = stack.pop();
      if (!serialized) continue;
      if (serialized.attributes?.rr_width !== undefined) {
        const node = (record as any).mirror?.getNode(serialized.id) as Element;
        const markerName = node?.tagName === 'IFRAME' ? FRAME_MARKER : EDITOR_MARKER;
        const marker = node?.getAttribute?.(markerName);
        if (validEditorId(marker) && node.ownerDocument === document) {
          const layout = editorGeometry(node);
          serialized.attributes[markerName] = marker;
          serialized.attributes.style = Object.entries(layout).map(([property, value]) => `${property}:${value}`).join(';');
          editorPlaceholders.set(serialized.id, placeholderSignature(marker, layout));
        }
      }
      if (Array.isArray(serialized.childNodes)) stack.push(...serialized.childNodes);
    }
  }
  // A new target extends the current motion instead of restarting native smooth
  // scrolling. This gives the student animation frames between network packets.
  const scrolling = new Map<Element, { x: number; y: number; positionX: number; positionY: number;
    appliedX: number; appliedY: number; at: number; frame: number }>();
  const stopScrolling = () => {
    for (const motion of scrolling.values()) cancelAnimationFrame(motion.frame);
    scrolling.clear();
  };
  const localScrollInput = (event: Event) => { if (event.isTrusted) stopScrolling(); };
  window.addEventListener('wheel', localScrollInput, { capture: true, passive: true });
  window.addEventListener('touchstart', localScrollInput, { capture: true, passive: true });
  window.addEventListener('pointerdown', localScrollInput, true);
  window.addEventListener('keydown', localScrollInput, true);
  function scrollTo(target: Element, x: number, y: number) {
    const next = { x: Math.max(0, Math.min(x, target.scrollWidth - target.clientWidth)),
      y: Math.max(0, Math.min(y, target.scrollHeight - target.clientHeight)) };
    const current = scrolling.get(target);
    if (current) { Object.assign(current, next); return; }
    const motion = { ...next, positionX: target.scrollLeft, positionY: target.scrollTop, appliedX: target.scrollLeft,
      appliedY: target.scrollTop, at: performance.now(), frame: 0 };
    scrolling.set(target, motion);
    const step = (now: number) => {
      if (disposed || !connected || document.hidden || !target.isConnected
        || Math.abs(target.scrollLeft - motion.appliedX) > 0.5 || Math.abs(target.scrollTop - motion.appliedY) > 0.5) {
        // Native student scrolling or a page-driven jump takes over immediately.
        scrolling.delete(target); return;
      }
      const fraction = 1 - Math.exp(-Math.min(40, now - motion.at) / 35);
      motion.at = now;
      const dx = motion.x - motion.positionX;
      const dy = motion.y - motion.positionY;
      const settled = Math.abs(dx) <= 0.25 && Math.abs(dy) <= 0.25;
      // Keep subpixel progress in memory: reading the rounded DOM offset on
      // every frame can otherwise stall one or two pixels short at high DPR.
      motion.positionX = settled ? motion.x : motion.positionX + dx * fraction;
      motion.positionY = settled ? motion.y : motion.positionY + dy * fraction;
      target.scrollTo({ left: motion.positionX, top: motion.positionY, behavior: 'instant' as ScrollBehavior });
      motion.appliedX = target.scrollLeft; motion.appliedY = target.scrollTop;
      if (settled) scrolling.delete(target);
      else motion.frame = requestAnimationFrame(step);
    };
    motion.frame = requestAnimationFrame(step);
  }
  const message = (text: string) => options.onStatus?.(text);
  const emit = (event: RREvent) => {
    if (!connected || disposed) return;
    // rrweb also observes same-origin frames. None of their content belongs in this stream:
    // Scratch and other embedded apps need their own explicit bridge, not a DOM side channel.
    if (event.type === 3) {
      const belongs = (id: number) => {
        const node = (record as any).mirror?.getNode(id);
        return node === document || node?.ownerDocument === document;
      };
      if (event.data?.isAttachIframe) return;
      if (event.data?.source === 0) {
        event.data.adds = (event.data.adds || []).filter((item) => belongs(item.parentId));
        event.data.removes = (event.data.removes || []).filter((item) => belongs(item.parentId));
        event.data.texts = (event.data.texts || []).filter((item) => belongs(item.id));
        event.data.attributes = (event.data.attributes || []).filter((item) => belongs(item.id));
        if (!['adds', 'removes', 'texts', 'attributes'].some((key) => event.data[key].length)) return;
      } else if (typeof event.data?.id === 'number' && !belongs(event.data.id)) return;
    }
    if (event.type === 2) {
      hasSnapshot = true;
      canvasImages = new WeakMap();
      canvasSentAt = new WeakMap();
      initialImageRefresh = new WeakSet();
      mediaStates = new WeakMap();
      scheduleCanvasCapture();
    } else if (event.type === 3 && event.data.source === 0) {
      // A source inline-style replacement can remove the replay's raster layer.
      for (const entry of event.data.attributes || []) {
        const node = (record as any).mirror?.getNode(entry.id);
        if (['CANVAS', 'IMG'].includes(node?.tagName) && (entry.attributes?.style !== undefined || entry.attributes?.src !== undefined
          || entry.attributes?.width !== undefined || entry.attributes?.height !== undefined)) canvasImages.delete(node);
      }
    }
    if (!hasSnapshot && event.type !== 4) return;
    preserveEditorMarkers(event);
    const safe = sanitizeMirrorEvent(event);
    if (!safe) return;
    const size = encoder.encode(JSON.stringify(safe)).length;
    if (size > MAX_EVENT_BYTES || queuedBytes + size > MAX_QUEUED_BYTES) {
      connected = false;
      stop?.(); stop = undefined;
      queue = []; queuedBytes = 0;
      message('共享画面变化过多，已暂停，请重新连接。');
      return;
    }
    queuedBytes += size;
    queue.push(safe);
    void pump();
  };
  async function pump() {
    if (pumping || disposed) return;
    pumping = true;
    const current = generation;
    try {
      while (connected && !disposed && current === generation && queue.length) {
        const event = queue.shift();
        const size = encoder.encode(JSON.stringify(event)).length;
        queuedBytes -= size;
        if (event.type === 3 && size < 32 * 1024) {
          const events = [event];
          let batchBytes = size;
          while (queue.length && events.length < 64 && queue[0].type === 3) {
            const nextSize = encoder.encode(JSON.stringify(queue[0])).length;
            if (batchBytes + nextSize > 32 * 1024) break;
            events.push(queue.shift()); batchBytes += nextSize; queuedBytes -= nextSize;
          }
          const firstSequence = sequence + 1;
          sequence += events.length;
          if (options.send({ type: 'rrweb-batch', sequence: firstSequence, events }) === false) throw new Error('transport unavailable');
          await new Promise((resolve) => setTimeout(resolve, 150));
          continue;
        }
        const packets = await mirrorPackets(event, ++sequence);
        for (const packet of packets) {
          if (!connected || disposed || current !== generation) break;
          if (options.send(packet) === false) throw new Error('transport unavailable');
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    } catch {
      connected = false; stop?.(); stop = undefined; queue = []; queuedBytes = 0;
      message('共享画面同步中断，请重新连接。');
    }
    finally {
      pumping = false;
      if (connected && !disposed && queue.length) void pump();
    }
  }
  function start() {
    if (disposed || !connected || stop) return;
    hasSnapshot = false;
    stop = record({ emit, blockSelector: BLOCK, maskAllInputs: true,
      maskInputFn: (value: string, element: Element) => !blocked(element)
        && (options.showNonSensitiveInputs || allowedSelect(element) || allowedSearch(element)) ? value : '*'.repeat(Math.min(value.length, 100)),
      inlineStylesheet: false, inlineImages: false, recordCanvas: false, collectFonts: false, recordCrossOriginIframes: false,
      keepIframeSrcFn: () => false, slimDOMOptions: { script: true, comment: true, headMetaDescKeywords: true, headMetaSocial: true, headMetaRobots: true, headMetaHttpEquiv: true },
      sampling: { mousemove: false, mouseInteraction: false, scroll: 120, input: 'last', media: 1000 },
      checkoutEveryNms: 60000, checkoutEveryNth: 3000,
      errorHandler: () => { message('部分页面内容暂时无法同步。'); return true; },
    } as any);
  }
  queueMicrotask(start);
  const sourceMirror = () => (record as any).mirror;
  const annotationRoot = document.createElement('div');
  annotationRoot.className = 'live-share-annotation-source';
  annotationRoot.dataset.liveSharePrivate = '';
  annotationRoot.style.cssText = 'position:fixed;inset:0;z-index:1000;pointer-events:none';
  document.body.appendChild(annotationRoot);
  const annotations = new Map<string, { value: ShareAnnotation; surface: ReturnType<typeof attachAnnotationSurface> }>();
  let annotationFrame = 0;
  function renderAnnotations() {
    cancelAnimationFrame(annotationFrame); annotationFrame = 0;
    for (const entry of annotations.values()) {
      const range = connected && !disposed ? annotationRange(document, sourceMirror(), entry.value) : null;
      entry.surface.render(entry.value, annotationRect(range));
    }
    if (annotations.size && connected && !disposed) annotationFrame = requestAnimationFrame(renderAnnotations);
  }
  function clearAnnotations() {
    cancelAnimationFrame(annotationFrame); annotationFrame = 0;
    for (const entry of annotations.values()) entry.surface.dispose();
    annotations.clear();
  }
  function captureCanvases() {
    canvasFrame = 0;
    if (disposed || !connected || !hasSnapshot || document.hidden) return;
    const now = performance.now();
    canvasBudget = Math.min(CANVAS_BYTES_PER_SECOND, canvasBudget + (now - canvasBudgetAt) * CANVAS_BYTES_PER_SECOND / 1000);
    canvasBudgetAt = now;
    const canvases = document.querySelectorAll<HTMLCanvasElement | HTMLImageElement>(options.inlineLocalImages
      ? 'canvas,img[src^="blob:"],img[src^="data:image/svg+xml"]' : 'canvas');
    const attributes = [];
    const rendered: Array<{ node: Element; raster: string }> = [];
    let attempted = 0;
    // Round robin bounds work even on a page containing many canvas elements.
    for (let count = 0; count < Math.min(canvases.length, 32) && attempted < 4; count++) {
      const node = canvases[(canvasOffset++) % canvases.length];
      const id = sourceMirror()?.getId(node);
      const isImage = node.tagName === 'IMG';
      const width = isImage ? (node as HTMLImageElement).naturalWidth : node.width;
      const height = isImage ? (node as HTMLImageElement).naturalHeight : node.height;
      if (!(id > 0) || blocked(node) || !width || !height) continue;
      const rect = node.getBoundingClientRect();
      if (!rect.width || !rect.height || rect.bottom <= 0 || rect.right <= 0 || rect.top >= innerHeight || rect.left >= innerWidth
        || getComputedStyle(node).visibility === 'hidden') continue;
      attempted++;
      try {
        canvasCopy ||= document.createElement('canvas');
        if (!isImage) options.beforeRasterCapture?.(node as HTMLCanvasElement);
        let scale = Math.min(1, 960 / width, 720 / height,
          Math.max(1, rect.width * 1.5) / width, Math.max(1, rect.height * 1.5) / height);
        let raster = '';
        for (let retry = 0; retry < 3; retry++) {
          // Resizing also resets origin-clean state after a tainted canvas was skipped.
          canvasCopy.width = Math.max(1, Math.round(width * scale));
          canvasCopy.height = Math.max(1, Math.round(height * scale));
          canvasCopy.getContext('2d')!.drawImage(node, 0, 0, canvasCopy.width, canvasCopy.height);
          raster = canvasCopy.toDataURL('image/webp', 0.72);
          if (raster.length <= CANVAS_FRAME_BYTES) break;
          scale *= 0.6;
        }
        // Periodically refresh a stationary stage within the existing budget.
        // A first frame can arrive while the replay is still rebuilding.
        const unchanged = canvasImages.get(node) === raster;
        if (raster.length > CANVAS_FRAME_BYTES || raster.length > canvasBudget
          || (unchanged && ((isImage && !initialImageRefresh.has(node)) || now - (canvasSentAt.get(node) || 0) < 2000))
          || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(raster)) continue;
        canvasBudget -= raster.length;
        // Inline icons get one initialization retry, not a periodic stream.
        if (isImage) { if (unchanged) initialImageRefresh.delete(node); else initialImageRefresh.add(node); }
        canvasImages.set(node, raster);
        canvasSentAt.set(node, now);
        rendered.push({ node, raster });
        attributes.push({ id, attributes: isImage ? { src: raster } : { style: { 'background-image': `url("${raster}")`,
          'background-size': '100% 100%', 'background-repeat': 'no-repeat' } } });
      } catch { /* Cross-origin/unsupported drawing buffers remain private; never weaken browser isolation. */ }
    }
    if (attributes.length) {
      // Only inert raster pixels are replayed. No canvas API calls, scripts or
      // source mutations are needed, including for readable WebGL canvases.
      const event = { type: 3, timestamp: Date.now(), data: { source: 0, adds: [], removes: [], texts: [], attributes } };
      emit(event);
      // emit invalidates style changes; these styles belong to the replay only.
      for (const item of rendered) canvasImages.set(item.node, item.raster);
    }
  }
  function scheduleCanvasCapture() {
    if (!canvasFrame && connected && !disposed) canvasFrame = requestAnimationFrame(captureCanvases);
  }
  const canvasTimer = setInterval(scheduleCanvasCapture, 400);
  const mediaTimer = setInterval(() => {
    if (disposed || !connected || !hasSnapshot || document.hidden) return;
    for (const node of [...document.querySelectorAll<HTMLMediaElement>('video,audio')].slice(0, 32)) {
      const id = sourceMirror()?.getId(node);
      if (!(id > 0) || blocked(node) || !Number.isFinite(node.currentTime)) continue;
      const playing = !node.paused && !node.ended && node.readyState >= 3;
      const data = { source: 7, id, type: playing ? 0 : 1, currentTime: node.currentTime,
        playbackRate: node.playbackRate, muted: true, volume: 0, loop: node.loop };
      const signature = JSON.stringify(data);
      if (!playing && mediaStates.get(node) === signature) continue;
      mediaStates.set(node, signature);
      emit({ type: 3, timestamp: Date.now(), data });
    }
  }, 1000);
  // Editors may attach after the full snapshot. Mutations within blocked nodes
  // are deliberately ignored by rrweb; send only their marker and box size.
  const editorGeometryTimer = setInterval(() => {
    if (disposed || !connected || !hasSnapshot) return;
    const attributes = [];
    const found = new Set<number>();
    for (const node of document.querySelectorAll(`[${EDITOR_MARKER}],iframe[${FRAME_MARKER}]`)) {
      const markerName = node.tagName === 'IFRAME' ? FRAME_MARKER : EDITOR_MARKER;
      const marker = node.getAttribute(markerName);
      const id = sourceMirror()?.getId(node);
      if (!validEditorId(marker) || !(id > 0)) continue;
      const metadata = sourceMirror()?.getMeta(node)?.attributes;
      if (metadata?.rr_width === undefined && !(markerName === FRAME_MARKER && validEditorId(metadata?.[FRAME_MARKER]))) {
        // A previously hidden textarea can become an editor after recording
        // begins. Rebuild once so its formerly masked node is now a blocked box.
        if (!newlyBlockedEditors.has(node)) {
          newlyBlockedEditors.add(node);
          (record as any).takeFullSnapshot(true);
          return;
        }
        continue;
      }
      found.add(id);
      const dimensions = editorGeometry(node);
      const signature = placeholderSignature(marker, dimensions);
      if (editorPlaceholders.get(id) === signature) continue;
      editorPlaceholders.set(id, signature);
      attributes.push({ id, attributes: { [markerName]: marker, style: dimensions } });
    }
    for (const id of editorPlaceholders.keys()) {
      if (found.has(id)) continue;
      editorPlaceholders.delete(id);
      if (sourceMirror()?.getNode(id)?.isConnected) attributes.push({ id, attributes: { [EDITOR_MARKER]: null, [FRAME_MARKER]: null } });
    }
    if (attributes.length) emit({ type: 3, timestamp: Date.now(), data: { source: 0, adds: [], removes: [], texts: [], attributes } });
  }, 100);
  function acknowledge(ack: MirrorAck) {
    commands.set(ack.id, ack);
    if (commands.size > 256) commands.delete(commands.keys().next().value);
    options.sendAck?.(ack);
    return ack;
  }
  function receiveCommand(command: MirrorCommand): MirrorAck {
    const deny = (reason: string) => acknowledge({ id: command?.id || '', pageId: options.pageId, ok: false, reason });
    if (!command || typeof command.id !== 'string' || !/^[\w-]{1,96}$/.test(command.id)) return deny('操作无效');
    if (commands.has(command.id)) { const ack = commands.get(command.id); options.sendAck?.(ack); return ack; }
    if (disposed || !connected || command.pageId !== options.pageId) return deny('页面已变化，请等待同步');
    if (document.hidden) return deny('学员已切换页面，请等待同步');
    if (!Number.isSafeInteger(command.nodeId) || command.nodeId <= 0) return deny('目标已变化');
    const raw = sourceMirror()?.getNode(command.nodeId);
    if (command.action === 'scratch') {
      // Gesture continuation remains bound to its verified initial target even
      // when Blockly replaces a palette block during a drag.
      const continuing = command.input?.type === 'pointer' && command.input.phase !== 'down';
      if (!scratchControl || (!continuing && (!closestElement(raw) || command.target !== scratchTargetFingerprint(closestElement(raw))))
        || !scratchControl.receive(raw, command.input)) return deny('Scratch 操作目标已变化，请重试');
      return acknowledge({ id: command.id, pageId: options.pageId, ok: true });
    }
    if (command.action === 'annotate') {
      if (raw !== document || typeof command.annotationId !== 'string' || !/^[\w-]{8,96}$/.test(command.annotationId)) return deny('标注目标已变化');
      const entry = annotations.get(command.annotationId);
      if (command.annotation === null) {
        entry?.surface.dispose(); annotations.delete(command.annotationId);
      }
      else {
        if (!annotationRange(document, sourceMirror(), command.annotation ?? null)) return deny('所选文字已变化，请重新选择');
        if (!entry && annotations.size >= 50) return deny('本页重点较多，请先关闭暂时不用的标注');
        const surface = entry?.surface || attachAnnotationSurface({ container: annotationRoot, teacher: false, id: command.annotationId });
        annotations.set(command.annotationId, { value: { ...command.annotation }, surface });
      }
      renderAnnotations();
      return acknowledge({ id: command.id, pageId: options.pageId, ok: true });
    }
    if (command.action === 'scroll') {
      if (![command.x, command.y].every((value) => Number.isFinite(value) && Math.abs(value) < 1000000)) return deny('位置无效');
      const target = raw === document ? document.scrollingElement : closestElement(raw);
      if (!target?.isConnected || blocked(target)) return deny('目标不可操作');
      scrollTo(target, command.x, command.y);
      return acknowledge({ id: command.id, pageId: options.pageId, ok: true });
    }
    if (command.action === 'resize') {
      const sash = sharedSash(closestElement(raw));
      if (!sash || blocked(sash) || command.target !== targetFingerprint(sash)
        || !resizeSharedSash(sash, command.x)) return deny('分隔条已变化，请重新拖动');
      return acknowledge({ id: command.id, pageId: options.pageId, ok: true });
    }
    const element = interactive(raw);
    if (blocked(element) || disabled(element)) return deny('此处不能远程操作');
    if (command.target !== targetFingerprint(element)) return deny('页面内容已变化，请等待同步后重试');
    if (command.action === 'select') {
      if (!allowedSelect(element) || typeof command.value !== 'string' || command.value.length > 100
        || !Array.from(element.options).some((option) => option.value === command.value && !option.disabled)) return deny('选项不可用');
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(element, command.value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return acknowledge({ id: command.id, pageId: options.pageId, ok: true });
    }
    if (command.action === 'search') {
      if (!allowedSearch(element) || typeof command.value !== 'string' || command.value.length > 200) return deny('搜索不可用');
      const target = new URL(element.form.action, location.href);
      const values = new FormData(element.form);
      values.set(element.name, command.value);
      target.search = new URLSearchParams([...values].filter((entry): entry is [string, string] => typeof entry[1] === 'string')).toString();
      const destination = safeStudyUrl(target.href, location.href);
      if (!destination) return deny('页面不可操作');
      const ack = acknowledge({ id: command.id, pageId: options.pageId, ok: true });
      location.assign(destination);
      return ack;
    }
    if (command.action !== 'click') return deny('操作无效');
    if (allowedButton(element) || allowedStudyChoice(element)) {
      // Mark before invoking handlers: re-entrant or retried commands cannot run the action twice.
      const ack = acknowledge({ id: command.id, pageId: options.pageId, ok: true });
      element.click();
      return ack;
    }
    if (element.tagName === 'A' && !element.hasAttribute('download')) {
      const destination = safeStudyUrl((element as HTMLAnchorElement).href, location.href);
      if (destination) {
        const ack = acknowledge({ id: command.id, pageId: options.pageId, ok: true });
        location.assign(destination);
        return ack;
      }
    }
    return deny('提交、保存及账户操作请由学员本人完成');
  }
  return {
    receiveCommand,
    getDrawingDocument() { return !disposed && connected ? document : null; },
    getDrawingNode(id: number) {
      if (disposed || !connected || !Number.isSafeInteger(id) || id < 1) return null;
      const node = sourceMirror()?.getNode(id);
      return node?.nodeType === 1 && node.ownerDocument === document && node.isConnected && !blocked(node) ? node as Element : null;
    },
    getDrawingNodeId(node: Element) {
      if (disposed || !connected || node.ownerDocument !== document || !node.isConnected || blocked(node)) return null;
      const id = sourceMirror()?.getId(node);
      return Number.isSafeInteger(id) && id > 0 ? id as number : null;
    },
    snapshot() { if (connected && !disposed && stop) (record as any).takeFullSnapshot(true); },
    setConnected(value: boolean) {
      if (disposed) return;
      if (connected === value) { if (value && stop) (record as any).takeFullSnapshot(true); return; }
      connected = value;
      scratchControl?.reset();
      clearAnnotations();
      stopScrolling();
      cancelAnimationFrame(canvasFrame); canvasFrame = 0;
      generation++;
      stop?.(); stop = undefined;
      queue = []; queuedBytes = 0;
      if (value) start();
    },
    dispose() {
      disposed = true; generation++; stop?.(); stop = undefined; queue = []; queuedBytes = 0; commands.clear(); stopScrolling();
      clearAnnotations(); annotationRoot.remove();
      scratchControl?.dispose();
      clearInterval(editorGeometryTimer); editorPlaceholders.clear();
      clearInterval(canvasTimer); clearInterval(mediaTimer); cancelAnimationFrame(canvasFrame); canvasCopy = null;
      window.removeEventListener('wheel', localScrollInput, true);
      window.removeEventListener('touchstart', localScrollInput, true);
      window.removeEventListener('pointerdown', localScrollInput, true);
      window.removeEventListener('keydown', localScrollInput, true);
    },
  };
}

export function attachViewerMirror(options: ViewerOptions) {
  let disposed = false;
  let connected = true;
  let player: any;
  let meta: RREvent;
  let timestamp = 0;
  let serial = 0;
  let currentViewport = { width: 1280, height: 800 };
  let ready = false;
  let cleanupDocument = () => {};
  let installTimer: ReturnType<typeof setTimeout>;
  let wheelTimer: ReturnType<typeof setTimeout>;
  type LocalScroll = { node: Element; commandNode: Node; x: number; y: number; touched: number; dirty: boolean;
    confirmed: boolean; release: ReturnType<typeof setTimeout>; echoed?: { x: number; y: number } };
  const localScrolls = new Map<number, LocalScroll>();
  const resetScrolls = () => {
    clearTimeout(wheelTimer); wheelTimer = undefined;
    for (const scroll of localScrolls.values()) clearTimeout(scroll.release);
    localScrolls.clear();
  };
  function flushScrolls() {
    wheelTimer = undefined;
    if (!connected || !ready || disposed) return;
    for (const scroll of localScrolls.values()) {
      if (!scroll.dirty || !scroll.node.isConnected) continue;
      scroll.dirty = false;
      command(scroll.commandNode, 'scroll', { x: scroll.x, y: scroll.y });
    }
  }
  const host = document.createElement('div');
  host.className = 'live-share-mirror';
  host.style.cssText = 'position:absolute;inset:0;overflow:hidden';
  options.container.appendChild(host);
  const annotations = new Map<string, { value: ShareAnnotation; editing: boolean; surface: ReturnType<typeof attachAnnotationSurface> }>();
  const pendingAnnotations = new Set<string>();
  let annotationFrame = 0;
  let annotationSendTimer: ReturnType<typeof setTimeout>;
  function createAnnotation(id: string, value: ShareAnnotation) {
    const surface = attachAnnotationSurface({ container: options.container, teacher: true, id,
      onChange: (patch) => {
        const entry = annotations.get(id);
        if (!entry || !connected || !ready || disposed) return;
        entry.value = { ...entry.value, ...patch };
        renderAnnotations();
        // Throttle only the wire: the teacher's draft/caret stays immediate.
        pendingAnnotations.add(id);
        annotationSendTimer ||= setTimeout(flushAnnotations, 40);
      },
      onClear: () => clearAnnotation(id, true),
    });
    const entry = { value, surface, editing: false };
    annotations.set(id, entry);
    return entry;
  }
  function sendAnnotation(id: string) {
    pendingAnnotations.delete(id);
    const doc = player?.iframe?.contentDocument;
    if (doc) command(doc, 'annotate', { annotationId: id, annotation: annotations.get(id)?.value || null });
  }
  function flushAnnotations() {
    clearTimeout(annotationSendTimer); annotationSendTimer = undefined;
    for (const id of pendingAnnotations) sendAnnotation(id);
  }
  function clearAnnotation(id: string, sync = false) {
    annotations.get(id)?.surface.dispose(); annotations.delete(id); pendingAnnotations.delete(id);
    if (sync) sendAnnotation(id);
  }
  function clearTransientAnnotations(exceptId?: string) {
    for (const [id, entry] of annotations) {
      if (id !== exceptId && (!entry.value.noteOpen || !entry.value.text.trim())) clearAnnotation(id, true);
    }
  }
  function clearAnnotations() {
    clearTimeout(annotationSendTimer); annotationSendTimer = undefined;
    cancelAnimationFrame(annotationFrame); annotationFrame = 0;
    for (const entry of annotations.values()) entry.surface.dispose();
    annotations.clear(); pendingAnnotations.clear();
  }
  function renderAnnotations() {
    cancelAnimationFrame(annotationFrame); annotationFrame = 0;
    const doc = player?.iframe?.contentDocument;
    for (const entry of annotations.values()) {
      const range = ready && doc && connected && !disposed ? annotationRange(doc, player.getMirror(), entry.value) : null;
      entry.surface.render(entry.value, annotationRect(range), entry.editing);
    }
    if (annotations.size && connected && !disposed) annotationFrame = requestAnimationFrame(renderAnnotations);
  }

  function command(node: any, action: MirrorCommand['action'], extra: Partial<MirrorCommand> = {}) {
    if (!connected || !ready || disposed || !player) return;
    const nodeId = player.getMirror().getId(node);
    if (nodeId <= 0) return;
    options.sendCommand({ id: `cmd-${Date.now().toString(36)}-${++serial}`, pageId: options.pageId, nodeId, action,
      ...(['scroll', 'annotate'].includes(action) ? {} : { target: targetFingerprint(node) }), ...extra });
  }
  function installInteractions() {
    if (!player || disposed) return;
    const frame = player.iframe as HTMLIFrameElement;
    const doc = frame.contentDocument;
    if (!doc?.body) { installTimer = setTimeout(installInteractions, 50); return; }
    cleanupDocument();
    // Never enable allow-scripts. A peer snapshot is untrusted display data.
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('title', '学员共享画面');
    frame.style.border = '0';
    if (connected) player.enableInteract(); else player.disableInteract();
    const style = doc.createElement('style');
    // rrweb captures the outer box of a blocked editor. Its empty placeholder
    // must not add the textarea's padding and border to those dimensions again.
    style.textContent = '[data-live-share-editor]{box-sizing:border-box!important} [data-live-share-unavailable]::after{content:"此区域暂不支持实时共享";display:block;padding:32px;color:#64748b;font:14px system-ui;text-align:center} [data-teacher-assistant],[data-live-share-ui]{visibility:hidden!important} .live-share-annotation-source,.live-share-code-focus-layer{display:none!important}';
    doc.head?.appendChild(style);
    const cleanupScratch = options.scratchControls
      ? attachViewerScratchControl({ document: doc, send: (node, input) => command(node, 'scratch', { input, target: scratchTargetFingerprint(node) }) }) : () => {};
    let holdingSpace = false;
    let dragging: { id: number; x: number; y: number };
    let resizing: { id: number; sash: HTMLElement; position: number; dirty: boolean } | null = null;
    let resizeTimer: ReturnType<typeof setTimeout>;
    const flushResize = () => {
      clearTimeout(resizeTimer); resizeTimer = undefined;
      if (!resizing?.dirty) return;
      resizing.dirty = false;
      command(resizing.sash, 'resize', { x: resizing.position });
    };
    const finishResize = () => {
      flushResize();
      const finished = resizing; resizing = null;
      if (finished) {
        try { doc.documentElement.releasePointerCapture(finished.id); } catch { /* The pointer can have left the replay. */ }
        finished.sash.classList.remove('sash-active');
      }
    };
    let suppressClickUntil = 0;
    let selecting = false;
    let selectingId: string | null = null;
    let selectionTimer: ReturnType<typeof setTimeout>;
    let finishSelectionTimer: ReturnType<typeof setTimeout>;
    function captureSelection() {
      clearTimeout(selectionTimer); selectionTimer = undefined;
      if (!connected || !ready || disposed || holdingSpace || dragging || resizing) return false;
      const selection = doc.getSelection();
      if (!selection?.rangeCount || selection.isCollapsed) return false;
      const range = selection.getRangeAt(0);
      if (!annotationText(range.startContainer, doc) || !annotationText(range.endContainer, doc)) return false;
      const next: ShareAnnotation = { startNodeId: player.getMirror().getId(range.startContainer),
        endNodeId: player.getMirror().getId(range.endContainer), startOffset: range.startOffset, endOffset: range.endOffset,
        quote: range.toString(), text: '', noteOpen: false, offsetX: 0, offsetY: range.getBoundingClientRect().height + 24 };
      if (!annotationRange(doc, player.getMirror(), next)) return false;
      if (!selectingId) {
        if (annotations.size >= 50) { options.onStatus?.('本页重点较多，请先关闭暂时不用的标注'); return false; }
        selectingId = `note-${Date.now().toString(36)}-${++serial}`;
      }
      const entry = annotations.get(selectingId) || createAnnotation(selectingId, next);
      const sameRange = ['startNodeId', 'endNodeId', 'startOffset', 'endOffset', 'quote'].every((key) => entry.value[key] === next[key]);
      if (!sameRange) entry.value = next;
      entry.editing = entry.value.noteOpen;
      renderAnnotations(); sendAnnotation(selectingId);
      suppressClickUntil = Date.now() + 300;
      return true;
    }
    const selectionchange = () => {
      if (selecting && !holdingSpace && !dragging) selectionTimer ||= setTimeout(() => captureSelection(), 40);
    };
    const textOrControl = (target: EventTarget | null) => !!closestElement(target)?.closest(
      'input,textarea,select,button,a,summary,[contenteditable]:not([contenteditable="false"]),[role="button"],[role="tab"],[data-live-share-editor]',
    );
    const teacherPoint = (event: MouseEvent) => {
      // Browser event coordinates inside an iframe use the student's unscaled
      // CSS pixels. Never multiply by DPR: CSS transforms already describe the
      // teacher's local view and the two devices may have different densities.
      const rect = frame.getBoundingClientRect();
      return { x: rect.left + event.clientX * rect.width / (frame.clientWidth || currentViewport.width),
        y: rect.top + event.clientY * rect.height / (frame.clientHeight || currentViewport.height) };
    };
    const endPan = () => {
      if (dragging) {
        try { doc.documentElement.releasePointerCapture(dragging.id); } catch { /* Pointer may already be released. */ }
      }
      dragging = undefined;
      doc.documentElement.style.removeProperty('cursor');
    };
    const resetPan = () => { finishResize(); holdingSpace = false; endPan(); };
    const click = (event: MouseEvent) => {
      if (holdingSpace || Date.now() < suppressClickUntil) {
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      const target = interactive(event.target);
      // Keep the browser's ordinary focus/select behaviour for these safe controls.
      if (target && (allowedSelect(target) || allowedSearch(target))) { event.stopImmediatePropagation(); return; }
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.button !== 0) return;
      if (!target || blocked(target)) return;
      command(target, 'click');
    };
    const submit = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); };
    const change = (event: Event) => {
      const element = closestElement(event.target);
      if (element && allowedSelect(element)) command(element, 'select', { value: element.value });
    };
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey
        && !event.isComposing && selectingId && !textOrControl(event.target)) {
        const entry = annotations.get(selectingId);
        if (entry && connected && ready && annotationRange(doc, player.getMirror(), entry.value)) {
          event.preventDefault(); event.stopImmediatePropagation();
          entry.value = { ...entry.value, noteOpen: true }; entry.editing = true;
          renderAnnotations(); sendAnnotation(selectingId); entry.surface.focus();
          return;
        }
      }
      if (options.onViewPan && (event.code === 'Space' || event.key === ' ') && !textOrControl(event.target)) {
        event.preventDefault(); event.stopImmediatePropagation();
        holdingSpace = true;
        doc.documentElement.style.cursor = dragging ? 'grabbing' : 'grab';
        return;
      }
      if (event.key !== 'Enter') return;
      event.preventDefault(); event.stopImmediatePropagation();
      const element = closestElement(event.target);
      if (element && allowedSearch(element)) command(element, 'search', { value: element.value });
    };
    const keyup = (event: KeyboardEvent) => {
      if (event.code === 'Space' || event.key === ' ') resetPan();
    };
    const outsidePointerdown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      const note = closestElement(event.target)?.closest<HTMLElement>('[data-share-annotation-id]');
      clearTransientAnnotations(note?.dataset.shareAnnotationId);
      if (!note) selectingId = null;
    };
    const pointerdown = (event: PointerEvent) => {
      outsidePointerdown(event);
      const sash = sharedSash(closestElement(event.target));
      if (event.button === 0 && sash && connected && ready && !holdingSpace) {
        event.preventDefault(); event.stopImmediatePropagation();
        selecting = false; clearTimeout(selectionTimer); clearTimeout(finishSelectionTimer);
        resizing = { id: event.pointerId, sash, position: 0, dirty: false };
        sash.classList.add('sash-active');
        try { doc.documentElement.setPointerCapture(event.pointerId); } catch { /* Test pointers need no capture. */ }
        return;
      }
      if (event.button === 0 && !holdingSpace && !closestElement(event.target)?.closest(ANNOTATION_EXCLUDED)) {
        selecting = true; selectingId = null;
        clearTimeout(finishSelectionTimer);
      }
      if (!holdingSpace || !options.onViewPan || event.button !== 0 || textOrControl(event.target)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const point = teacherPoint(event);
      dragging = { id: event.pointerId, x: point.x, y: point.y };
      doc.documentElement.style.cursor = 'grabbing';
      try { doc.documentElement.setPointerCapture(event.pointerId); } catch { /* A synthetic test pointer has no capture. */ }
    };
    const pointermove = (event: PointerEvent) => {
      if (resizing?.id === event.pointerId) {
        event.preventDefault(); event.stopImmediatePropagation();
        const split = resizing.sash.closest<HTMLElement>(SHARED_SPLIT_SELECTOR);
        const bounds = split?.getBoundingClientRect();
        if (!bounds || !bounds.width || !bounds.height) return;
        const vertical = split.classList.contains('live-share-split-rows');
        resizing.position = Math.max(0, Math.min(1, vertical ? (event.clientY - bounds.top) / bounds.height : (event.clientX - bounds.left) / bounds.width));
        resizing.dirty = true;
        resizeTimer ||= setTimeout(flushResize, 32);
        return;
      }
      if (!dragging || dragging.id !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      const point = teacherPoint(event);
      const dx = dragging.x - point.x;
      const dy = dragging.y - point.y;
      dragging.x = point.x; dragging.y = point.y;
      if (dx || dy) options.onViewPan?.({ dx, dy });
    };
    const pointerup = (event: PointerEvent) => {
      if (resizing?.id === event.pointerId) {
        event.preventDefault(); event.stopImmediatePropagation();
        finishResize(); suppressClickUntil = Date.now() + 300;
        return;
      }
      if (selecting) {
        selecting = false;
        clearTimeout(selectionTimer); selectionTimer = undefined;
        if (event.type !== 'pointercancel') {
          // Suppress the click synchronously, before a selected link can navigate.
          captureSelection();
          // Capture the browser's completed range after the pointer event.
          finishSelectionTimer = setTimeout(captureSelection, 0);
        }
      }
      if (!dragging || dragging.id !== event.pointerId) return;
      event.preventDefault(); event.stopImmediatePropagation();
      suppressClickUntil = Date.now() + 300;
      endPan();
    };
    const silenceMedia = (event: Event) => {
      const node = event.target as HTMLMediaElement;
      if (!['AUDIO', 'VIDEO'].includes(node?.tagName)) return;
      if (!node.muted) node.muted = true;
      if (node.volume !== 0) node.volume = 0;
    };
    const wheel = (event: WheelEvent) => {
      if (options.onViewZoom && (event.ctrlKey || event.metaKey)) {
        event.preventDefault(); event.stopImmediatePropagation();
        const point = teacherPoint(event);
        const multiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? frame.clientHeight : 1;
        options.onViewZoom({ delta: event.deltaY * multiplier, clientX: point.x, clientY: point.y });
        return;
      }
      if (!connected || !ready || disposed) { event.preventDefault(); return; }
      let element = closestElement(event.target);
      while (element && element !== doc.body && element !== doc.documentElement) {
        const style = doc.defaultView.getComputedStyle(element);
        const vertical = event.deltaY && element.scrollHeight > element.clientHeight + 1 && /(auto|scroll|overlay)/.test(style.overflowY);
        const horizontal = event.deltaX && element.scrollWidth > element.clientWidth + 1 && /(auto|scroll|overlay)/.test(style.overflowX);
        if (vertical || horizontal) break;
        element = element.parentElement;
      }
      const target = element === doc.body || element === doc.documentElement || !element ? doc.scrollingElement : element;
      if (!target || blocked(target)) return;
      event.preventDefault(); event.stopPropagation();
      const node = target === doc.scrollingElement ? doc : target;
      const id = player.getMirror().getId(node);
      if (id <= 0) return;
      const multiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? target.clientHeight : 1;
      let scroll = localScrolls.get(id);
      if (!scroll) {
        scroll = { node: target, commandNode: node, x: target.scrollLeft, y: target.scrollTop,
          touched: 0, dirty: false, confirmed: false, release: undefined };
        localScrolls.set(id, scroll);
      }
      // Accumulate against the intended position, never a delayed source echo.
      scroll.x = Math.max(0, Math.min(target.scrollWidth - target.clientWidth, scroll.x + event.deltaX * multiplier));
      scroll.y = Math.max(0, Math.min(target.scrollHeight - target.clientHeight, scroll.y + event.deltaY * multiplier));
      scroll.touched = Date.now(); scroll.dirty = true; scroll.confirmed = false;
      target.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' as ScrollBehavior });
      clearTimeout(scroll.release);
      scroll.release = setTimeout(() => {
        if (localScrolls.get(id) !== scroll) return;
        localScrolls.delete(id);
        // Reconcile a clamped/resized source after the gesture, without allowing
        // an old echo to pull the viewport backwards while the teacher scrolls.
        if (!scroll.confirmed && scroll.echoed && target.isConnected) {
          target.scrollTo({ left: scroll.echoed.x, top: scroll.echoed.y, behavior: 'instant' as ScrollBehavior });
        }
      }, 900);
      // Throttle rather than debounce: trackpad momentum can last seconds.
      wheelTimer ||= setTimeout(flushScrolls, 32);
    };
    doc.addEventListener('click', click, true);
    doc.addEventListener('submit', submit, true);
    doc.addEventListener('change', change, true);
    doc.addEventListener('keydown', keydown, true);
    doc.addEventListener('keyup', keyup, true);
    window.addEventListener('pointerdown', outsidePointerdown, true);
    doc.addEventListener('pointerdown', pointerdown, true);
    doc.addEventListener('pointermove', pointermove, true);
    doc.addEventListener('pointerup', pointerup, true);
    doc.addEventListener('pointercancel', pointerup, true);
    doc.addEventListener('lostpointercapture', pointerup, true);
    doc.addEventListener('selectionchange', selectionchange);
    // Also finish a selection when the pointer is released outside the iframe.
    window.addEventListener('pointerup', pointerup, true);
    doc.defaultView?.addEventListener('blur', resetPan);
    window.addEventListener('keyup', keyup, true);
    window.addEventListener('blur', resetPan);
    doc.addEventListener('volumechange', silenceMedia, true);
    doc.addEventListener('wheel', wheel, { capture: true, passive: false });
    cleanupDocument = () => {
      cleanupScratch();
      resetScrolls();
      finishResize();
      resetPan();
      selecting = false; clearTimeout(selectionTimer); clearTimeout(finishSelectionTimer);
      doc.removeEventListener('click', click, true);
      doc.removeEventListener('submit', submit, true);
      doc.removeEventListener('change', change, true);
      doc.removeEventListener('keydown', keydown, true);
      doc.removeEventListener('keyup', keyup, true);
      window.removeEventListener('pointerdown', outsidePointerdown, true);
      doc.removeEventListener('pointerdown', pointerdown, true);
      doc.removeEventListener('pointermove', pointermove, true);
      doc.removeEventListener('pointerup', pointerup, true);
      doc.removeEventListener('pointercancel', pointerup, true);
      doc.removeEventListener('lostpointercapture', pointerup, true);
      doc.removeEventListener('selectionchange', selectionchange);
      window.removeEventListener('pointerup', pointerup, true);
      doc.defaultView?.removeEventListener('blur', resetPan);
      window.removeEventListener('keyup', keyup, true);
      window.removeEventListener('blur', resetPan);
      doc.removeEventListener('volumechange', silenceMedia, true);
      doc.removeEventListener('wheel', wheel, true);
      style.remove();
    };
    ready = connected;
    renderAnnotations();
    if (connected) options.onViewport?.(currentViewport);
  }
  function viewport(data: any) {
    if (!Number.isFinite(data?.width) || !Number.isFinite(data?.height) || data.width < 100 || data.height < 100 || data.width > 16384 || data.height > 16384) return;
    currentViewport = { width: data.width, height: data.height };
    if (ready) options.onViewport?.(currentViewport);
    host.style.width = `${data.width}px`;
    host.style.height = `${data.height}px`;
  }
  const assembler = new MirrorAssembler((event) => {
    if (disposed || !connected) return;
    // Normalize different device clocks while preserving replay order.
    timestamp = Math.max(Date.now() - 20, timestamp + 0.01);
    event.timestamp = timestamp;
    if (event.type === 4) { meta = event; viewport(event.data); return; }
    if (event.type === 2) {
      ready = false;
      for (const entry of annotations.values()) entry.surface.render(null, null);
      cleanupDocument(); clearTimeout(installTimer);
      player?.destroy(); host.replaceChildren();
      const initialMeta = meta || { type: 4, timestamp: timestamp - 1, data: { width: 1280, height: 800, href: location.origin } };
      initialMeta.timestamp = timestamp - 1;
      player = new Replayer([initialMeta, event], {
        root: host, liveMode: true, mouseTail: false, showWarning: false, showDebug: false,
        UNSAFE_replayCanvas: false, loadTimeout: 0, skipInactive: false,
        insertStyleRules: ['iframe,object,embed{pointer-events:none!important}', 'a,button{cursor:pointer!important}',
          '.live-share-annotation-source,.live-share-code-focus-layer{display:none!important}',
          '.live-share-notice,[data-teacher-assistant],[data-live-share-private]{visibility:hidden!important;pointer-events:none!important}'],
      } as any);
      player.startLive(timestamp - 2);
      player.on('fullsnapshot-rebuilded', () => { clearTimeout(installTimer); installTimer = setTimeout(installInteractions, 0); });
      installTimer = setTimeout(installInteractions, 50);
      options.onStatus?.('画面已同步');
      return;
    }
    if (!player) return;
    if (event.type === 3 && event.data.source === 3) {
      const scroll = localScrolls.get(event.data.id);
      if (scroll) {
        const idle = Date.now() - scroll.touched;
        if (scroll.confirmed && !scroll.dirty && idle >= 100) {
          clearTimeout(scroll.release); localScrolls.delete(event.data.id);
        } else {
          scroll.echoed = { x: event.data.x, y: event.data.y };
          scroll.confirmed = Math.abs(scroll.x - event.data.x) <= 1 && Math.abs(scroll.y - event.data.y) <= 1;
          return;
        }
      }
    }
    if (event.type === 3 && event.data.source === 4) viewport(event.data);
    player.addEvent(event);
  }, (message) => { connected = false; options.onStatus?.(message); });
  return {
    receive(data: any) { if (!disposed && connected) assembler.receive(data); },
    getDrawingDocument() { return !disposed && connected && ready ? player?.iframe?.contentDocument || null : null; },
    getDrawingNode(id: number) {
      if (disposed || !connected || !ready || !Number.isSafeInteger(id) || id < 1) return null;
      const node = player?.getMirror()?.getNode(id);
      return node?.nodeType === 1 && node.ownerDocument === player?.iframe?.contentDocument && node.isConnected && !blocked(node) ? node as Element : null;
    },
    getDrawingNodeId(node: Element) {
      if (disposed || !connected || !ready || node.ownerDocument !== player?.iframe?.contentDocument || !node.isConnected || blocked(node)) return null;
      const id = player?.getMirror()?.getId(node);
      return Number.isSafeInteger(id) && id > 0 ? id as number : null;
    },
    getEditorRect(id: string) {
      if (disposed || !connected || !ready || !validEditorId(id)) return null;
      const node = player?.iframe?.contentDocument?.querySelector(`[${EDITOR_MARKER}="${id}"]`);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    },
    getFrameRect(id: string) {
      if (disposed || !connected || !ready || !validEditorId(id)) return null;
      const node = player?.iframe?.contentDocument?.querySelector(`[${FRAME_MARKER}="${id}"]`);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    },
    setConnected(value: boolean) {
      if (connected === value) return;
      connected = value;
      clearAnnotations();
      ready = false;
      resetScrolls();
      assembler.reset();
      // Reconnection requires a fresh snapshot; stale node IDs must never control the source.
      player?.disableInteract();
    },
    dispose() {
      disposed = true; connected = false; assembler.dispose();
      clearAnnotations();
      clearTimeout(installTimer); clearTimeout(wheelTimer); cleanupDocument();
      player?.destroy(); player = undefined; host.remove();
    },
  };
}
