import { Y, MonacoBinding } from './vendor';
import { attachAnnotationSurface } from './annotation';

export interface EditorRect { x: number; y: number; width: number; height: number }
export interface SharedEditorView {
  wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded'; wordWrapColumn?: number;
  tabSize?: number; insertSpaces?: boolean; glyphMargin?: boolean;
  lineNumbers?: 'on' | 'off' | 'relative' | 'interval'; lineNumbersMinChars?: number;
  lineDecorationsWidth?: number | string; scrollBeyondLastLine?: boolean; letterSpacing?: number; fontWeight?: string;
  minimap?: { enabled?: boolean; side?: string; size?: string; showSlider?: string; renderCharacters?: boolean; maxColumn?: number; scale?: number };
  padding?: { top?: number; bottom?: number };
}
export interface SharedEditorTheme {
  base: 'vs' | 'vs-dark' | 'hc-black' | 'hc-light'; inherit: boolean;
  colors: Record<string, string>; rules: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>;
  encodedTokensColors?: string[];
}
export interface EditorMessage {
  type: 'edit:init' | 'edit:update' | 'edit:ack' | 'edit:cursor' | 'edit:layout' | 'edit:remove' | 'edit:sync' | 'edit:scroll';
  pageId: string;
  editorId: string;
  update?: string;
  state?: string;
  opId?: string;
  kind?: 'monaco' | 'textarea';
  language?: string;
  rect?: EditorRect;
  readOnly?: boolean;
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  scrollTop?: number;
  scrollLeft?: number;
  scrollSeq?: number;
  view?: SharedEditorView;
  theme?: SharedEditorTheme;
  anchor?: string;
  head?: string;
}

export interface EditorStatus { editorId: string; pending: number; connected: boolean; ready: boolean; error?: string }
interface CommonOptions {
  pageId: string;
  send: (message: EditorMessage) => void;
  onStatus?: (status: EditorStatus) => void;
}
export interface EditorController {
  receive: (message: EditorMessage) => void;
  setConnected: (connected: boolean) => void;
  dispose: () => void;
  getPendingDrafts?: () => Array<{ editorId: string; language?: string; value: string }>;
}

const REMOTE = Symbol('live-share-remote');
// Leave headroom for the relay envelope within its 384 KiB message budget.
const MAX_UPDATE = 320 * 1024;
const MAX_TEXT = 64 * 1024;
let identifier = 0;
function uniqueId() { return `${Date.now().toString(36)}-${(++identifier).toString(36)}-${Math.random().toString(36).slice(2, 9)}`; }
export function encodeUpdate(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
export function decodeUpdate(value: string): Uint8Array {
  if (typeof value !== 'string' || !value.length || value.length > MAX_UPDATE || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error('共享代码数据无效');
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** One CRDT per source editor lifetime. The viewer must never independently seed its text. */
export class CollaborativeText {
  readonly doc = new Y.Doc();
  readonly text = this.doc.getText('code');
  readonly localOrigin = {};
  readonly undoManager: any;
  changed = false;
  private pending = new Map<string, EditorMessage>();
  private connected = true;
  private ready: boolean;
  private disposed = false;
  private sequence = 0;
  private queuedUpdates: Uint8Array[] = [];
  private outgoingTimer?: ReturnType<typeof setTimeout>;
  private unsent = false;
  private incomingPaused = false;
  private incoming: EditorMessage[] = [];
  private readonly writer = uniqueId();
  private listener: (update: Uint8Array, origin: unknown) => void;

  constructor(private options: CommonOptions & {
    editorId: string;
    role: 'source' | 'viewer';
    value?: string;
    canWrite?: () => boolean;
    localWritable?: () => boolean;
  }) {
    this.ready = options.role === 'source';
    if (options.role === 'source' && options.value) this.text.insert(0, options.value);
    this.undoManager = new Y.UndoManager(this.text, { trackedOrigins: new Set([this.localOrigin]), captureTimeout: 350 });
    this.listener = (update, origin) => {
      if (this.disposed) return;
      this.changed = true;
      if (origin === REMOTE) return;
      if (options.role === 'source' && !this.connected) return;
      this.queuedUpdates.push(update);
      this.outgoingTimer ||= setTimeout(() => this.flushOutgoing(), 40);
      this.status();
    };
    this.doc.on('update', this.listener);
  }

  get editable() {
    const writable = this.options.role === 'source' ? this.options.localWritable || this.options.canWrite : this.options.canWrite;
    return !this.disposed && (this.options.role === 'source' || this.connected && this.ready && !this.unsent && this.pending.size < 128) && writable?.() !== false;
  }
  get value() { return this.text.toString(); }
  get pendingCount() { return this.options.role === 'viewer' ? this.pending.size + (this.queuedUpdates.length || this.unsent ? 1 : 0) : 0; }
  get snapshot() { return encodeUpdate(Y.encodeStateAsUpdate(this.doc)); }
  trackOrigin(origin: unknown) { this.undoManager.addTrackedOrigin(origin); }
  private transmit(message: EditorMessage) {
    try { this.options.send(message); } catch { this.setConnected(false); }
  }
  private status(error?: string) {
    this.options.onStatus?.({
      editorId: this.options.editorId, pending: this.pendingCount, connected: this.connected, ready: this.ready, ...(error ? { error } : {}),
    });
  }
  flushOutgoing() {
    clearTimeout(this.outgoingTimer); this.outgoingTimer = undefined;
    if (this.disposed || this.incomingPaused || !this.queuedUpdates.length) return;
    const update = encodeUpdate(Y.mergeUpdates(this.queuedUpdates));
    this.queuedUpdates = [];
    if (update.length > MAX_UPDATE) {
      this.unsent = true;
      this.status('这份代码过大，最后的修改尚未同步，请保留当前页面');
      return;
    }
    const message: EditorMessage = {
      type: 'edit:update', pageId: this.options.pageId, editorId: this.options.editorId,
      opId: `${this.writer}:${++this.sequence}`, update,
    };
    if (this.options.role === 'viewer') this.pending.set(message.opId!, message);
    if (this.connected && this.ready) this.transmit(message);
    this.status(this.pending.size >= 128 ? '尚有修改等待学员确认，已暂停输入以保护代码' : undefined);
  }
  private retryPending() {
    if (!this.connected || !this.pending.size) return;
    // One merged CRDT update makes reconnect idempotent without flooding the relay with old keystrokes.
    const updates = [...this.pending.values()].map((message) => decodeUpdate(message.update!));
    this.pending.clear();
    this.queuedUpdates.push(...updates);
    this.flushOutgoing();
  }

  receive(message: EditorMessage) {
    if (this.disposed || message.pageId !== this.options.pageId || message.editorId !== this.options.editorId) return false;
    if (message.type === 'edit:ack' && this.options.role === 'viewer') {
      this.pending.delete(message.opId!);
      this.status();
      return true;
    }
    if (message.type !== 'edit:update' && !(message.type === 'edit:init' && this.options.role === 'viewer')) return false;
    if (this.incomingPaused) { this.incoming.push(message); return true; }
    if (message.type === 'edit:update' && (!this.connected || this.options.role === 'source' && this.options.canWrite?.() === false)) return false;
    try {
      const update = decodeUpdate(message.type === 'edit:init' ? message.state! : message.update!);
      Y.applyUpdate(this.doc, update, REMOTE);
      if (message.type === 'edit:init') {
        this.ready = true;
        // Retry only after the source has restored this exact document and page epoch.
        this.retryPending();
      } else if (this.options.role === 'source' && message.opId) {
        this.transmit({ type: 'edit:ack', pageId: this.options.pageId, editorId: this.options.editorId, opId: message.opId });
      }
      this.status();
      return true;
    } catch {
      this.status('代码同步失败，正在等待重新连接');
      return false;
    }
  }

  /** Preserve unchanged spans so simultaneous textarea edits can merge as CRDT operations. */
  replace(value: string) {
    if (!this.editable) return false;
    if (value.length > MAX_TEXT) { this.status('代码超过共享编辑大小限制，这处修改尚未同步'); return false; }
    const previous = this.value;
    if (previous === value) return true;
    let start = 0;
    while (start < previous.length && start < value.length && previous[start] === value[start]) start += 1;
    let end = 0;
    while (end < previous.length - start && end < value.length - start
      && previous[previous.length - 1 - end] === value[value.length - 1 - end]) end += 1;
    this.doc.transact(() => {
      const remove = previous.length - start - end;
      if (remove) this.text.delete(start, remove);
      const insert = value.slice(start, value.length - end);
      if (insert) this.text.insert(start, insert);
    }, this.localOrigin);
    return true;
  }
  undo() { if (this.editable) this.undoManager.undo(); }
  redo() { if (this.editable) this.undoManager.redo(); }
  pauseIncoming(paused: boolean) {
    this.incomingPaused = paused;
    if (!paused) {
      const queue = this.incoming.splice(0);
      for (const message of queue) this.receive(message);
      this.flushOutgoing();
    }
  }
  setConnected(connected: boolean) {
    this.connected = connected;
    if (!connected && this.options.role === 'viewer') this.ready = false;
    this.status();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.doc.off('update', this.listener);
    this.undoManager.destroy();
    this.doc.destroy();
    this.pending.clear();
    this.incoming.length = 0;
    this.queuedUpdates.length = 0;
    clearTimeout(this.outgoingTimer);
  }
}

function rectangle(node: HTMLElement): EditorRect {
  const rect = node.getBoundingClientRect();
  const hidden = !node.isConnected || !node.getClientRects().length || getComputedStyle(node).visibility === 'hidden';
  return { x: rect.left, y: rect.top, width: hidden ? 0 : rect.width, height: hidden ? 0 : rect.height };
}
function safeSend(options: CommonOptions, message: EditorMessage) { try { options.send(message); } catch { /* The socket owner handles reconnect. */ } }
function cursorStyles() {
  const style = document.createElement('style');
  style.textContent = '.live-share-teacher-selection{background:#f5bc6140}.live-share-student-selection{background:#699cf540}.live-share-teacher-cursor{border-left:2px solid #c98721}.live-share-student-cursor{border-left:2px solid #5285da}';
  document.head.appendChild(style);
  return style;
}
function localUndo(model: any, shared: CollaborativeText, sourceEditor?: any) {
  const previousUndo = model.undo;
  const previousRedo = model.redo;
  const undo = () => shared.undo();
  const redo = () => shared.redo();
  model.undo = undo;
  model.redo = redo;
  return () => {
    if (model.undo === undo) model.undo = previousUndo;
    if (model.redo === redo) model.redo = previousRedo;
    if (sourceEditor && shared.changed && !model.isDisposed?.()) {
      // Native history records offsets before CRDT/remote undo operations. Reusing it can delete unrelated code.
      // Start a fresh native history at the confirmed shared value without moving the student's caret or viewport.
      const view = sourceEditor.getModel() === model ? sourceEditor.saveViewState() : null;
      model.setValue(model.getValue());
      if (view) sourceEditor.restoreViewState(view);
    }
  };
}
function compositionGuard(editor: any, shared: CollaborativeText) {
  // Monaco's IME owns a temporary range while the user chooses a character.
  // Moving that range with a remote edit can commit text at a stale offset.
  const start = editor.onDidCompositionStart?.(() => shared.pauseIncoming(true));
  const end = editor.onDidCompositionEnd?.(() => shared.pauseIncoming(false));
  return () => { start?.dispose(); end?.dispose(); };
}
function editorTheme(editor: any): SharedEditorTheme | undefined {
  const data = editor?._themeService?.getColorTheme?.()?.themeData;
  if (!data || !['vs', 'vs-dark', 'hc-black', 'hc-light'].includes(data.base)) return undefined;
  return { base: data.base, inherit: data.inherit !== false, colors: { ...data.colors }, rules: (data.rules || []).map((rule: any) => ({ ...rule })),
    ...(data.encodedTokensColors ? { encodedTokensColors: [...data.encodedTokensColors] } : {}) };
}
function editorView(editor: any, model: any): SharedEditorView | undefined {
  if (!editor) return undefined;
  const raw = editor.getRawOptions?.() || {};
  const ids = (window as any).monaco?.editor?.EditorOptions;
  const option = (name: string) => ids?.[name] ? editor.getOption(ids[name].id) : raw[name];
  const view: SharedEditorView = { tabSize: model.getOptions().tabSize, insertSpaces: model.getOptions().insertSpaces };
  for (const name of ['wordWrap', 'wordWrapColumn', 'glyphMargin', 'lineNumbersMinChars', 'lineDecorationsWidth',
    'scrollBeyondLastLine', 'letterSpacing', 'fontWeight'] as const) {
    const value = option(name);
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') (view as any)[name] = value;
  }
  const numbers = option('lineNumbers');
  view.lineNumbers = typeof numbers === 'string' ? numbers : ['off', 'on', 'relative', 'interval'][numbers?.renderType] as SharedEditorView['lineNumbers'];
  const minimap = option('minimap');
  if (minimap) view.minimap = Object.fromEntries(['enabled', 'side', 'size', 'showSlider', 'renderCharacters', 'maxColumn', 'scale']
    .filter((key) => minimap[key] !== undefined).map((key) => [key, minimap[key]]));
  const padding = option('padding');
  if (padding) view.padding = { top: padding.top, bottom: padding.bottom };
  return view;
}
function bindTextarea(node: HTMLTextAreaElement, shared: CollaborativeText, notifyInput: boolean) {
  let applying = false;
  let composing = false;
  let relativeSelection: { start: any; end: any; direction: typeof node.selectionDirection } | null = null;
  const beforeTransaction = () => {
    // Preserve the native selection by content when the other peer inserts or removes text before it.
    relativeSelection = !applying && !composing && node.value === shared.value ? {
      start: Y.createRelativePositionFromTypeIndex(shared.text, node.selectionStart),
      end: Y.createRelativePositionFromTypeIndex(shared.text, node.selectionEnd), direction: node.selectionDirection,
    } : null;
  };
  const observer = () => {
    if (applying || composing || node.value === shared.value) return;
    const start = relativeSelection && Y.createAbsolutePositionFromRelativePosition(relativeSelection.start, shared.doc);
    const end = relativeSelection && Y.createAbsolutePositionFromRelativePosition(relativeSelection.end, shared.doc);
    const anchor = start?.type === shared.text ? start.index : node.selectionStart;
    const head = end?.type === shared.text ? end.index : node.selectionEnd;
    const direction = relativeSelection?.direction || node.selectionDirection;
    relativeSelection = null;
    // Use the native setter so React notices its controlled input changed.
    const setter = Object.getOwnPropertyDescriptor(node.ownerDocument.defaultView!.HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(node, shared.value);
    else node.value = shared.value;
    node.setSelectionRange(Math.min(anchor, node.value.length), Math.min(head, node.value.length), direction);
    if (notifyInput) {
      applying = true;
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      applying = false;
    }
  };
  const input = () => { if (!applying && !composing) shared.replace(node.value); };
  // Apply queued remote operations after committing this IME transaction, so composition never replaces remote text.
  const compositionStart = () => { composing = true; shared.pauseIncoming(true); };
  const compositionEnd = () => { composing = false; input(); shared.pauseIncoming(false); observer(); };
  const key = (event: KeyboardEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || !['z', 'y'].includes(event.key.toLowerCase())) return;
    event.preventDefault(); event.stopPropagation();
    if (event.key.toLowerCase() === 'y' || event.shiftKey) shared.redo();
    else shared.undo();
  };
  node.addEventListener('input', input);
  node.addEventListener('compositionstart', compositionStart);
  node.addEventListener('compositionend', compositionEnd);
  node.addEventListener('keydown', key, true);
  shared.doc.on('beforeTransaction', beforeTransaction);
  shared.text.observe(observer);
  observer();
  return () => {
    shared.text.unobserve(observer);
    shared.doc.off('beforeTransaction', beforeTransaction);
    node.removeEventListener('input', input);
    node.removeEventListener('compositionstart', compositionStart);
    node.removeEventListener('compositionend', compositionEnd);
    node.removeEventListener('keydown', key, true);
  };
}

function cursorFromOffsets(shared: CollaborativeText, anchor: number, head: number, pageId: string, editorId: string): EditorMessage {
  return { type: 'edit:cursor', pageId, editorId,
    anchor: encodeUpdate(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(shared.text, anchor))),
    head: encodeUpdate(Y.encodeRelativePosition(Y.createRelativePositionFromTypeIndex(shared.text, head))) };
}
function cursorMessage(shared: CollaborativeText, editor: any, pageId: string, editorId: string): EditorMessage | null {
  const selection = editor.getSelection();
  const model = editor.getModel();
  if (!selection || !model) return null;
  return cursorFromOffsets(shared, model.getOffsetAt(selection.getSelectionStart()), model.getOffsetAt(selection.getPosition()), pageId, editorId);
}
function cursorOffsets(shared: CollaborativeText, message: EditorMessage) {
  try {
    const anchor = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(decodeUpdate(message.anchor!)), shared.doc);
    const head = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(decodeUpdate(message.head!)), shared.doc);
    if (!anchor || !head || anchor.type !== shared.text || head.type !== shared.text) return null;
    return { start: Math.min(anchor.index, head.index), end: Math.max(anchor.index, head.index) };
  } catch { return null; }
}
function observeCursor(editor: any, shared: CollaborativeText, options: CommonOptions, editorId: string, connected: () => boolean,
  local?: (message: EditorMessage) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let blurred = false;
  const changed = () => {
    if (blurred) return;
    const current = cursorMessage(shared, editor, options.pageId, editorId);
    if (connected() && current) local?.(current);
    timer ||= setTimeout(() => {
      timer = undefined;
      const message = cursorMessage(shared, editor, options.pageId, editorId);
      if (connected() && !blurred && message) safeSend(options, message);
    }, 50);
  };
  const listener = editor.onDidChangeCursorSelection(changed);
  // A code focus is temporary. Leaving the editor clears only the visual cursor,
  // preserving the native selection for normal editing when the teacher returns.
  const blur = local && editor.onDidBlurEditorWidget(() => {
    blurred = true; clearTimeout(timer); timer = undefined;
    const current = cursorMessage(shared, editor, options.pageId, editorId);
    if (!current || !connected()) return;
    const collapsed = { ...current, anchor: current.head };
    local(collapsed); safeSend(options, collapsed);
  });
  const focus = local && editor.onDidFocusEditorWidget(() => { blurred = false; changed(); });
  return () => { clearTimeout(timer); listener.dispose(); blur?.dispose(); focus?.dispose(); };
}
function observeTextareaCursor(node: HTMLTextAreaElement, shared: CollaborativeText, options: CommonOptions, editorId: string,
  connected: () => boolean, local?: (message: EditorMessage) => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let last = '';
  let blurred = false;
  const message = () => cursorFromOffsets(shared,
    node.selectionDirection === 'backward' ? node.selectionEnd : node.selectionStart,
    node.selectionDirection === 'backward' ? node.selectionStart : node.selectionEnd, options.pageId, editorId);
  const changed = () => {
    if (!connected() || blurred || node.value !== shared.value) return;
    const current = message();
    const signature = `${current.anchor}:${current.head}`;
    if (signature === last) return;
    last = signature; local?.(current);
    timer ||= setTimeout(() => { timer = undefined; if (connected() && !blurred) safeSend(options, message()); }, 50);
  };
  const blur = () => {
    if (!local) return;
    blurred = true; last = ''; clearTimeout(timer); timer = undefined;
    if (!connected()) return;
    const current = message(); const collapsed = { ...current, anchor: current.head };
    local(collapsed); safeSend(options, collapsed);
  };
  const focus = () => { blurred = false; last = ''; changed(); };
  const selection = () => { if (node.ownerDocument.activeElement === node) changed(); };
  for (const event of ['select', 'input', 'keyup', 'pointerup']) node.addEventListener(event, changed);
  if (local) { node.addEventListener('blur', blur); node.addEventListener('focus', focus); }
  node.ownerDocument.addEventListener('selectionchange', selection);
  return () => {
    clearTimeout(timer);
    for (const event of ['select', 'input', 'keyup', 'pointerup']) node.removeEventListener(event, changed);
    node.removeEventListener('blur', blur); node.removeEventListener('focus', focus);
    node.ownerDocument.removeEventListener('selectionchange', selection);
  };
}

/** Teacher focus is a visual layer only: never change either peer's native selection or keyboard handling. */
function attachCodeFocus(node: HTMLElement, shared: CollaborativeText, editor?: any, container?: HTMLElement) {
  const root = document.createElement('div');
  root.className = 'live-share-code-focus-layer';
  root.dataset.liveSharePrivate = ''; root.dataset.liveShareUi = '';
  root.dataset.shareCodeFocus = '';
  root.style.cssText = `position:${container ? 'absolute' : 'fixed'};pointer-events:none;overflow:hidden;z-index:1002;display:none`;
  (container || document.body).appendChild(root);
  const surface = attachAnnotationSurface({ container: root, teacher: false });
  const mark = { startNodeId: 1, endNodeId: 1, startOffset: 0, endOffset: 1, quote: '代码重点', text: '', noteOpen: false, offsetX: 0, offsetY: 0 };
  let current: EditorMessage | null = null;
  let frame = 0;
  let disposed = false;
  let decorations: string[] = [];
  let rangeSignature = '';
  let measure: HTMLDivElement | undefined;
  let selected: HTMLSpanElement | undefined;
  let measureSignature = '';
  const reset = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0; current = null; rangeSignature = '';
    if (editor && !editor.getModel()?.isDisposed?.()) decorations = editor.deltaDecorations(decorations, []);
    root.style.display = 'none'; surface.render(null, null);
  };
  const render = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    if (disposed || !current) return;
    const offsets = cursorOffsets(shared, current);
    if (!offsets || offsets.start === offsets.end) { reset(); return; }
    const box = node.getBoundingClientRect();
    const width = node.offsetWidth; const height = node.offsetHeight;
    if (!node.isConnected || !node.getClientRects().length || !width || !height || !box.width || !box.height) {
      root.style.display = 'none'; frame = window.requestAnimationFrame(render); return;
    }
    const scaleX = box.width / width; const scaleY = box.height / height;
    const parent = container?.getBoundingClientRect();
    const left = parent ? (box.left - parent.left) / (parent.width / (container.clientWidth || 1)) + container.scrollLeft : box.left;
    const top = parent ? (box.top - parent.top) / (parent.height / (container.clientHeight || 1)) + container.scrollTop : box.top;
    Object.assign(root.style, { display: '', left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px` });
    const rects: EditorRect[] = [];
    const clip = { left: 0, top: 0, right: width, bottom: height };
    const add = (rect: EditorRect) => {
      const x = Math.max(clip.left, rect.x); const y = Math.max(clip.top, rect.y);
      const right = Math.min(clip.right, rect.x + rect.width); const bottom = Math.min(clip.bottom, rect.y + rect.height);
      if (right > x && bottom > y) rects.push({ x, y, width: right - x, height: bottom - y });
    };
    if (editor) {
      const model = editor.getModel();
      if (!model || model.isDisposed?.()) { reset(); return; }
      const start = model.getPositionAt(offsets.start); const end = model.getPositionAt(offsets.end);
      const signature = `${offsets.start}:${offsets.end}`;
      if (signature !== rangeSignature) {
        rangeSignature = signature;
        decorations = editor.deltaDecorations(decorations, [{
          range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
          options: { className: 'live-share-teacher-focus-region', showIfCollapsed: false },
        }]);
      }
      const layout = editor.getLayoutInfo();
      clip.left = layout.contentLeft; clip.right = layout.contentLeft + layout.contentWidth;
      for (const part of node.querySelectorAll<HTMLElement>('.live-share-teacher-focus-region')) {
        const rect = part.getBoundingClientRect();
        add({ x: (rect.left - box.left) / scaleX, y: (rect.top - box.top) / scaleY, width: rect.width / scaleX, height: rect.height / scaleY });
      }
    } else {
      const textarea = node as HTMLTextAreaElement;
      const style = getComputedStyle(node);
      if (!measure) {
        measure = document.createElement('div'); selected = document.createElement('span');
        measure.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;pointer-events:none;box-sizing:border-box';
        root.append(measure);
      }
      const properties = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'textIndent', 'tabSize',
        'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'wordSpacing'] as const;
      const signature = JSON.stringify([shared.value, offsets.start, offsets.end, textarea.clientWidth, textarea.wrap, ...properties.map((key) => style[key])]);
      if (signature !== measureSignature) {
        measureSignature = signature;
        for (const key of properties) measure.style[key] = style[key];
        measure.style.width = `${textarea.clientWidth}px`;
        measure.style.whiteSpace = textarea.wrap === 'off' ? 'pre' : 'pre-wrap';
        measure.style.overflowWrap = textarea.wrap === 'off' ? 'normal' : 'break-word';
        selected.textContent = shared.value.slice(offsets.start, offsets.end);
        measure.replaceChildren(document.createTextNode(shared.value.slice(0, offsets.start)), selected,
          document.createTextNode(shared.value.slice(offsets.end) || '\u200b'));
      }
      const base = measure.getBoundingClientRect();
      const borderX = parseFloat(style.borderLeftWidth) || 0; const borderY = parseFloat(style.borderTopWidth) || 0;
      clip.left = borderX; clip.right = borderX + textarea.clientWidth;
      clip.top = borderY; clip.bottom = borderY + textarea.clientHeight;
      for (const rect of selected.getClientRects()) add({ x: (rect.left - base.left) / scaleX + borderX - textarea.scrollLeft,
        y: (rect.top - base.top) / scaleY + borderY - textarea.scrollTop, width: Math.max(2, rect.width / scaleX), height: rect.height / scaleY });
    }
    if (rects.length) {
      const x = Math.min(...rects.map((rect) => rect.x)); const y = Math.min(...rects.map((rect) => rect.y));
      const right = Math.max(...rects.map((rect) => rect.x + rect.width)); const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
      surface.render(mark, { x, y, width: right - x, height: bottom - y, rects });
    } else surface.render(null, null);
    frame = window.requestAnimationFrame(render);
  };
  return {
    set(message: EditorMessage | null) { current = message; if (message) render(); else reset(); },
    dispose() { disposed = true; reset(); surface.dispose(); root.remove(); },
  };
}
function cursorDecoration(shared: CollaborativeText, editor: any, message: EditorMessage, previous: string[], source: boolean): string[] {
  try {
    const anchor = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(decodeUpdate(message.anchor!)), shared.doc);
    const head = Y.createAbsolutePositionFromRelativePosition(Y.decodeRelativePosition(decodeUpdate(message.head!)), shared.doc);
    if (!anchor || !head || anchor.type !== shared.text || head.type !== shared.text) return previous;
    const model = editor.getModel();
    const start = model.getPositionAt(Math.min(anchor.index, head.index));
    const end = model.getPositionAt(Math.max(anchor.index, head.index));
    return editor.deltaDecorations(previous, [{
      range: { startLineNumber: start.lineNumber, startColumn: start.column, endLineNumber: end.lineNumber, endColumn: end.column },
      options: {
        className: source ? 'live-share-teacher-selection' : 'live-share-student-selection',
        afterContentClassName: source ? 'live-share-teacher-cursor' : 'live-share-student-cursor',
        hoverMessage: { value: source ? '老师正在这里编辑' : '学员正在这里编辑' },
      },
    }]);
  } catch { return previous; }
}

interface SourceBinding {
  id: string;
  node: HTMLElement;
  editor?: any;
  model?: any;
  shared: CollaborativeText;
  announce: () => void;
  layout: () => void;
  resetCursor: () => void;
  receive: (message: EditorMessage) => void;
  dispose: () => void;
}

export function attachSourceEditors(options: CommonOptions): EditorController {
  const bindings = new Map<unknown, SourceBinding>();
  const oversized = new WeakSet<object>();
  const style = cursorStyles();
  let disposed = false;
  let connected = true;
  const reportOversized = (key: object) => {
    if (oversized.has(key)) return;
    oversized.add(key);
    options.onStatus?.({
      editorId: `oversized-${uniqueId()}`, pending: 0, connected, ready: false,
      error: '这份代码超过实时共享大小限制，暂时无法显示；学员原代码已保留，可以继续正常编辑。',
    });
  };
  const create = (node: HTMLElement, editor?: any): SourceBinding => {
    const id = uniqueId();
    const model = editor?.getModel();
    // A single-line Windows model can be CRLF without that being visible in its
    // initial text. Y.Text and both Monaco models must use the same offsets.
    if (model && model.getEOL() !== '\n') model.setEOL(0);
    const textarea = node as HTMLTextAreaElement;
    const localWritable = () => editor ? !editor.getRawOptions?.().readOnly : !textarea.readOnly && !textarea.disabled;
    const writable = () => !document.hidden && localWritable();
    const shared = new CollaborativeText({ ...options, editorId: id, role: 'source', value: model ? model.getValue() : textarea.value, canWrite: writable, localWritable });
    shared.setConnected(connected);
    const previousMarker = node.getAttribute('data-live-share-editor');
    node.setAttribute('data-live-share-editor', id);
    const cleanups: Array<() => void> = [];
    let decorations: string[] = [];
    let remoteCursor: EditorMessage | undefined;
    let lastLayout = '';
    let lastLayoutAt = 0;
    let lastTheme = '';
    let scrollSeq = 0;
    let layoutTimer: ReturnType<typeof setTimeout> | undefined;
    const focus = attachCodeFocus(node, shared, editor);
    cleanups.push(() => focus.dispose());
    if (editor) {
      const binding = new MonacoBinding(shared.text, model, new Set([editor]));
      shared.trackOrigin(binding);
      cleanups.push(localUndo(model, shared, editor), () => binding.destroy());
      cleanups.push(observeCursor(editor, shared, options, id, () => connected));
      cleanups.push(compositionGuard(editor, shared));
    } else cleanups.push(bindTextarea(textarea, shared, true), observeTextareaCursor(textarea, shared, options, id, () => connected));
    const metadata = () => {
      const style = getComputedStyle(node);
      const raw = editor?.getRawOptions?.() || {};
      const fontId = (window as any).monaco?.editor?.EditorOptions?.fontInfo?.id;
      const font = editor && fontId !== undefined ? editor.getOption(fontId) : raw;
      return {
        kind: editor ? 'monaco' as const : 'textarea' as const, language: model?.getLanguageId?.() || 'plaintext',
        rect: rectangle(node), readOnly: !writable(), fontSize: Number(font.fontSize) || parseFloat(style.fontSize) || 14,
        fontFamily: typeof font.fontFamily === 'string' ? font.fontFamily : style.fontFamily,
        lineHeight: Number(font.lineHeight) || parseFloat(style.lineHeight) || 20,
        scrollTop: editor ? editor.getScrollTop() : node.scrollTop,
        scrollLeft: editor ? editor.getScrollLeft() : node.scrollLeft,
        scrollSeq, view: editorView(editor, model), theme: editorTheme(editor),
      };
    };
    const announce = () => {
      const state = shared.snapshot;
      if (state.length > MAX_UPDATE) {
        options.onStatus?.({ editorId: id, pending: 0, connected, ready: false, error: '这份代码过大，暂不支持共享编辑；学员原代码已保留' });
        if (connected) safeSend(options, { type: 'edit:remove', pageId: options.pageId, editorId: id });
        return;
      }
      if (connected) {
        const data = metadata(); lastTheme = JSON.stringify(data.theme);
        safeSend(options, { type: 'edit:init', pageId: options.pageId, editorId: id, state, ...data });
      }
    };
    const layout = (force = false) => {
      const data = metadata();
      const serialized = JSON.stringify(data);
      if ((!force && serialized === lastLayout) || !connected || !force && Date.now() - lastLayoutAt < 40) return;
      lastLayout = serialized;
      lastLayoutAt = Date.now();
      const theme = JSON.stringify(data.theme);
      if (theme === lastTheme) delete data.theme;
      else lastTheme = theme;
      safeSend(options, { type: 'edit:layout', pageId: options.pageId, editorId: id, ...data });
    };
    const scheduleLayout = () => { layoutTimer ||= setTimeout(() => { layoutTimer = undefined; layout(true); }, 40); };
    if (editor) {
      const listener = editor.onDidScrollChange(scheduleLayout);
      cleanups.push(() => listener.dispose());
    } else {
      node.addEventListener('scroll', scheduleLayout, { passive: true });
      cleanups.push(() => node.removeEventListener('scroll', scheduleLayout));
    }
    cleanups.push(() => clearTimeout(layoutTimer));
    return {
      id, node, editor, model, shared, announce, layout,
      resetCursor() {
        remoteCursor = undefined; focus.set(null);
        if (editor && !model.isDisposed?.()) decorations = editor.deltaDecorations(decorations, []);
      },
      receive(message) {
        if (message.type === 'edit:sync') { announce(); return; }
        if (message.type === 'edit:scroll') {
          if (document.hidden || !Number.isSafeInteger(message.scrollSeq) || message.scrollSeq! <= scrollSeq) return;
          scrollSeq = message.scrollSeq!;
          if (editor) editor.setScrollPosition({ scrollTop: message.scrollTop, scrollLeft: message.scrollLeft }, 1);
          else { node.scrollTop = message.scrollTop || 0; node.scrollLeft = message.scrollLeft || 0; }
          scheduleLayout(); return;
        }
        if (message.type === 'edit:cursor') { remoteCursor = message; focus.set(message); }
        else shared.receive(message);
        if (remoteCursor && editor) decorations = cursorDecoration(shared, editor, remoteCursor, decorations, true);
      },
      dispose() {
        if (editor && !model.isDisposed?.()) editor.deltaDecorations(decorations, []);
        for (const cleanup of cleanups.reverse()) cleanup();
        shared.dispose();
        if (node.getAttribute('data-live-share-editor') === id) {
          if (previousMarker === null) node.removeAttribute('data-live-share-editor');
          else node.setAttribute('data-live-share-editor', previousMarker);
        }
        if (connected) safeSend(options, { type: 'edit:remove', pageId: options.pageId, editorId: id });
      },
    };
  };
  const scan = () => {
    if (disposed) return;
    const scope = window as any;
    const editors = new Set<any>(scope.monaco?.editor?.getEditors?.() || []);
    if (scope.editor?.getModel) editors.add(scope.editor);
    const present = new Set<unknown>();
    const models = new Set<unknown>();
    for (const editor of editors) {
      const node = editor.getDomNode?.();
      const model = editor.getModel?.();
      if (!node?.isConnected || !model || model.isDisposed?.() || node.closest('[data-live-share-viewer]')) continue;
      // Two widgets can share one Monaco model; binding it twice would replay
      // each edit into separate CRDTs and duplicate remote transactions.
      if (models.has(model)) continue;
      models.add(model);
      if (model.getValueLength() > MAX_TEXT) { reportOversized(model); continue; }
      present.add(editor);
      const previous = bindings.get(editor);
      if (previous && previous.model !== model) { previous.dispose(); bindings.delete(editor); }
      if (!bindings.has(editor)) { const binding = create(node, editor); bindings.set(editor, binding); binding.announce(); }
    }
    for (const node of document.querySelectorAll<HTMLTextAreaElement>('textarea[name="code"], textarea.scratchpad__data-input')) {
      if (!node.isConnected || node.closest('[data-live-share-viewer]') || !node.getClientRects().length) continue;
      if (node.value.length > MAX_TEXT) { reportOversized(node); continue; }
      present.add(node);
      if (!bindings.has(node)) { const binding = create(node); bindings.set(node, binding); binding.announce(); }
    }
    for (const [key, binding] of bindings) {
      if (!present.has(key)) { binding.dispose(); bindings.delete(key); }
      else binding.layout();
    }
  };
  scan();
  const timer = window.setInterval(scan, 100);
  return {
    receive(message) {
      if (disposed || !connected || !message || message.pageId !== options.pageId) return;
      if (message.type === 'edit:sync' && !message.editorId) { for (const binding of bindings.values()) binding.announce(); return; }
      for (const binding of bindings.values()) if (binding.id === message.editorId) binding.receive(message);
    },
    setConnected(value) {
      connected = value;
      for (const binding of bindings.values()) { binding.shared.setConnected(value); if (value) binding.announce(); else binding.resetCursor(); }
    },
    dispose() {
      disposed = true; window.clearInterval(timer);
      for (const binding of bindings.values()) binding.dispose();
      bindings.clear(); style.remove();
    },
  };
}

interface ViewerBinding {
  shared: CollaborativeText;
  node: HTMLElement;
  editor?: any;
  readOnly: boolean;
  update: (message: EditorMessage) => void;
  refresh: () => void;
  layout: () => void;
  resetCursor: () => void;
  dispose: () => void;
}
export function attachViewerEditors(options: CommonOptions & { container: HTMLElement; getNodeRect?: (id: string) => EditorRect | undefined }): EditorController & {
  getPendingDrafts: () => Array<{ editorId: string; language?: string; value: string }>;
} {
  const bindings = new Map<string, ViewerBinding>();
  const creating = new Map<string, EditorMessage[]>();
  const detachedDrafts = new Map<string, { editorId: string; language?: string; value: string }>();
  let disposed = false;
  let connected = true;
  let monacoPromise: Promise<any> | undefined;
  let monacoRuntime: any;
  let themeService: any;
  let originalTheme: string | undefined;
  let appliedTheme = '';
  let geometryFrame = 0;
  const sharedThemeName = `live-share-${uniqueId()}`;
  options.container.setAttribute('data-live-share-viewer', 'true');
  const style = cursorStyles();
  const preserveDraft = (editorId: string, binding: ViewerBinding) => {
    if (!binding.shared.pendingCount) return;
    detachedDrafts.set(editorId, { editorId, language: binding.editor?.getModel()?.getLanguageId?.() || 'plaintext', value: binding.shared.value });
    options.onStatus?.({ editorId, pending: binding.shared.pendingCount, connected, ready: false, error: '学员已切换编辑器，有修改尚未确认，请保留未同步代码' });
  };
  queueMicrotask(() => {
    if (!disposed && connected) safeSend(options, { type: 'edit:sync', pageId: options.pageId, editorId: '' });
  });
  const create = async (initial: EditorMessage) => {
    creating.set(initial.editorId, []);
    try {
      let monaco: any;
      if (initial.kind !== 'textarea') {
        monacoPromise ||= import('vj/components/monaco/loader').then((module) => module.load([])).then((result) => result.monaco);
        monaco = await monacoPromise;
      }
      if (disposed || !creating.has(initial.editorId)) return;
      const node = document.createElement(initial.kind === 'textarea' ? 'textarea' : 'div');
      node.setAttribute('data-live-share-editor', initial.editorId);
      node.setAttribute('aria-label', initial.kind === 'textarea' ? '与学员共享的测试输入' : '与学员共同编辑代码');
      Object.assign(node.style, { position: 'absolute', margin: '0', padding: '0', border: '0', boxSizing: 'border-box', pointerEvents: 'auto', overflow: 'hidden', background: 'transparent' });
      options.container.appendChild(node);
      let readOnly = !!initial.readOnly;
      let refresh = () => {};
      const shared = new CollaborativeText({
        ...options, editorId: initial.editorId, role: 'viewer', canWrite: () => !readOnly,
        onStatus(status) { refresh(); options.onStatus?.(status); },
      });
      shared.setConnected(connected);
      shared.receive(initial);
      let editor: any;
      let model: any;
      let applyingScroll = false;
      let scrollSeq = initial.scrollSeq || 0;
      let confirmedScrollSeq = scrollSeq;
      let scrollingUntil = 0;
      let scrollAwaitUntil = 0;
      let scrollTimer: ReturnType<typeof setTimeout> | undefined;
      let scrollRecoveryTimer: ReturnType<typeof setTimeout> | undefined;
      let scrollFollowTimer: ReturnType<typeof setTimeout> | undefined;
      let sourceScroll: { top: number; left: number; authoritative: boolean } | undefined;
      let appliedScroll: { top: number; left: number } | undefined;
      let sourceRect = initial.rect;
      let lastRect = '';
      let decorations: string[] = [];
      let remoteCursor: EditorMessage | undefined;
      const cleanups: Array<() => void> = [];
      let focus: ReturnType<typeof attachCodeFocus>;
      if (monaco) {
        model = monaco.editor.createModel('', initial.language || 'plaintext', monaco.Uri.parse(`live-share://${uniqueId()}/${initial.editorId}`));
        model.setEOL(monaco.editor.EndOfLineSequence.LF);
        editor = monaco.editor.create(node, {
          model, automaticLayout: false, readOnly: !shared.editable,
          occurrencesHighlight: 'off',
          fontSize: initial.fontSize || 14, fontFamily: initial.fontFamily, lineHeight: initial.lineHeight || 20,
        });
        monacoRuntime = monaco;
        themeService = editor._themeService;
        originalTheme ||= editor._themeService?.getColorTheme?.()?.themeName;
        const binding = new MonacoBinding(shared.text, model, new Set([editor]));
        shared.trackOrigin(binding);
        cleanups.push(localUndo(model, shared), () => binding.destroy());
        cleanups.push(observeCursor(editor, shared, options, initial.editorId, () => connected, (message) => focus?.set(message)));
        cleanups.push(compositionGuard(editor, shared));
      } else {
        const textarea = node as HTMLTextAreaElement;
        textarea.spellcheck = false; textarea.wrap = 'off';
        cleanups.push(bindTextarea(textarea, shared, false));
        cleanups.push(observeTextareaCursor(textarea, shared, options, initial.editorId, () => connected, (message) => focus?.set(message)));
      }
      focus = attachCodeFocus(node, shared, editor, options.container);
      cleanups.push(() => focus.dispose());
      const onScroll = () => {
        if (applyingScroll || !connected) return;
        const top = editor ? editor.getScrollTop() : node.scrollTop;
        const left = editor ? editor.getScrollLeft() : node.scrollLeft;
        if (appliedScroll?.top === top && appliedScroll.left === left) return;
        appliedScroll = undefined;
        if (sourceScroll) sourceScroll.authoritative = false;
        scrollingUntil = Date.now() + 180;
        scrollTimer ||= setTimeout(() => {
          scrollTimer = undefined;
          if (!connected) return;
          scrollAwaitUntil = Date.now() + 750;
          clearTimeout(scrollRecoveryTimer);
          scrollRecoveryTimer = setTimeout(() => {
            if (connected && confirmedScrollSeq < scrollSeq) safeSend(options, { type: 'edit:sync', pageId: options.pageId, editorId: initial.editorId });
          }, 750);
          safeSend(options, { type: 'edit:scroll', pageId: options.pageId, editorId: initial.editorId, scrollSeq: ++scrollSeq,
            scrollTop: editor ? editor.getScrollTop() : node.scrollTop, scrollLeft: editor ? editor.getScrollLeft() : node.scrollLeft });
        }, 40);
      };
      if (editor) {
        const listener = editor.onDidScrollChange(onScroll);
        cleanups.push(() => listener.dispose());
      } else {
        node.addEventListener('scroll', onScroll, { passive: true });
        cleanups.push(() => node.removeEventListener('scroll', onScroll));
      }
      cleanups.push(() => { clearTimeout(scrollTimer); clearTimeout(scrollRecoveryTimer); clearTimeout(scrollFollowTimer); });
      const followSourceScroll = () => {
        clearTimeout(scrollFollowTimer); scrollFollowTimer = undefined;
        if (!sourceScroll) return;
        const now = Date.now();
        const wait = Math.max(scrollingUntil - now, scrollTimer ? 40 : 0,
          !sourceScroll.authoritative && confirmedScrollSeq < scrollSeq ? scrollAwaitUntil - now : 0);
        if (wait > 0) { scrollFollowTimer = setTimeout(followSourceScroll, wait + 1); return; }
        const previousApplying = applyingScroll; applyingScroll = true;
        if (editor) editor.setScrollPosition({ scrollTop: sourceScroll.top, scrollLeft: sourceScroll.left }, 1);
        else { node.scrollTop = sourceScroll.top; node.scrollLeft = sourceScroll.left; }
        appliedScroll = { top: editor ? editor.getScrollTop() : node.scrollTop, left: editor ? editor.getScrollLeft() : node.scrollLeft };
        applyingScroll = previousApplying;
      };
      const layout = () => {
        const rect = options.getNodeRect?.(initial.editorId) || sourceRect;
        if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return;
        const signature = JSON.stringify(rect);
        if (signature === lastRect) return;
        lastRect = signature;
        const previousApplying = applyingScroll; applyingScroll = true;
        Object.assign(node.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${Math.max(0, rect.width)}px`, height: `${Math.max(0, rect.height)}px`, display: rect.width > 0 && rect.height > 0 ? '' : 'none' });
        editor?.layout({ width: Math.max(0, rect.width), height: Math.max(0, rect.height) });
        applyingScroll = previousApplying;
      };
      refresh = () => { if (editor) editor.updateOptions({ readOnly: !shared.editable }); else (node as HTMLTextAreaElement).readOnly = !shared.editable; };
      const update = (message: EditorMessage) => {
        applyingScroll = true;
        if (message.type === 'edit:cursor') remoteCursor = message;
        else shared.receive(message);
        if (message.type === 'edit:init' || message.type === 'edit:layout') {
          if (typeof message.readOnly === 'boolean') readOnly = message.readOnly;
          if (message.rect) sourceRect = message.rect;
          layout();
          confirmedScrollSeq = Math.max(confirmedScrollSeq, message.scrollSeq || 0);
          scrollSeq = Math.max(scrollSeq, confirmedScrollSeq);
          if (confirmedScrollSeq >= scrollSeq) clearTimeout(scrollRecoveryTimer);
          // A fresh snapshot recovers a rejected/lost gesture. Bound the wait
          // as well, so subsequent student scrolling can never stay blocked.
          sourceScroll = { top: message.scrollTop || 0, left: message.scrollLeft || 0, authoritative: message.type === 'edit:init' };
          if (editor) {
            if (message.language && message.language !== model.getLanguageId()) monaco.editor.setModelLanguage(model, message.language);
            const view = message.view || {};
            const { tabSize, insertSpaces, ...editorOptions } = view;
            model.updateOptions({ ...(tabSize !== undefined ? { tabSize } : {}), ...(insertSpaces !== undefined ? { insertSpaces } : {}) });
            applyingScroll = true;
            editor.updateOptions({ ...editorOptions, fontSize: message.fontSize || 14, fontFamily: message.fontFamily, lineHeight: message.lineHeight || 20 });
            if (message.theme) {
              const signature = JSON.stringify(message.theme);
              if (signature !== appliedTheme) {
                monaco.editor.defineTheme(sharedThemeName, message.theme);
                monaco.editor.setTheme(sharedThemeName); appliedTheme = signature;
              }
            }
            applyingScroll = false;
          } else {
            node.style.fontSize = `${message.fontSize || 14}px`; node.style.fontFamily = message.fontFamily || 'monospace';
            node.style.lineHeight = `${message.lineHeight || 20}px`;
          }
          // Retain the newest student position during a teacher gesture and
          // apply it after the gesture settles, even if no further event arrives.
          followSourceScroll();
        }
        if (remoteCursor && editor) decorations = cursorDecoration(shared, editor, remoteCursor, decorations, false);
        refresh();
        applyingScroll = false;
      };
      const result: ViewerBinding = {
        shared, node, editor, readOnly, update, refresh, layout,
        resetCursor() {
          remoteCursor = undefined; focus.set(null);
          if (editor && !model.isDisposed?.()) decorations = editor.deltaDecorations(decorations, []);
        },
        dispose() {
          for (const cleanup of cleanups.reverse()) cleanup();
          shared.dispose(); editor?.dispose(); model?.dispose(); node.remove();
        },
      };
      bindings.set(initial.editorId, result);
      update(initial);
      const queue = creating.get(initial.editorId) || [];
      creating.delete(initial.editorId);
      for (const message of queue) update(message);
    } catch {
      creating.delete(initial.editorId);
      options.onStatus?.({ editorId: initial.editorId, pending: 0, connected, ready: false, error: '共享编辑器暂未打开，请重新连接' });
    }
  };
  const refreshGeometry = () => {
    if (disposed) return;
    for (const binding of bindings.values()) binding.layout();
    geometryFrame = window.requestAnimationFrame(refreshGeometry);
  };
  if (options.getNodeRect) geometryFrame = window.requestAnimationFrame(refreshGeometry);
  return {
    getPendingDrafts() {
      return [...detachedDrafts.values(), ...[...bindings].filter(([, binding]) => binding.shared.pendingCount > 0).map(([editorId, binding]) => ({
        editorId, language: binding.editor?.getModel()?.getLanguageId?.() || 'plaintext', value: binding.shared.value,
      }))];
    },
    receive(message) {
      if (disposed || !message || message.pageId !== options.pageId) return;
      if (message.type === 'edit:remove') {
        const binding = bindings.get(message.editorId);
        if (binding) { preserveDraft(message.editorId, binding); binding.dispose(); bindings.delete(message.editorId); }
        creating.delete(message.editorId); return;
      }
      const binding = bindings.get(message.editorId);
      if (binding) binding.update(message);
      else if (creating.has(message.editorId)) creating.get(message.editorId)!.push(message);
      else if (message.type === 'edit:init') void create(message);
      else if (message.type === 'edit:update' && connected) safeSend(options, { type: 'edit:sync', pageId: options.pageId, editorId: message.editorId });
    },
    setConnected(value) {
      connected = value;
      for (const binding of bindings.values()) { binding.shared.setConnected(value); binding.refresh(); if (!value) binding.resetCursor(); }
      if (value) safeSend(options, { type: 'edit:sync', pageId: options.pageId, editorId: '' });
    },
    dispose() {
      disposed = true; creating.clear();
      if (geometryFrame) window.cancelAnimationFrame(geometryFrame);
      const currentTheme = themeService?.getColorTheme?.()?.themeName;
      for (const [editorId, binding] of bindings) { preserveDraft(editorId, binding); binding.dispose(); }
      bindings.clear(); style.remove();
      if (originalTheme && currentTheme === sharedThemeName) monacoRuntime?.editor.setTheme(originalTheme);
    },
  };
}
