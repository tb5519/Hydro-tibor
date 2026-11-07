import { Y, MonacoBinding } from './vendor';
import { attachAnnotationSurface, ShareAnnotation } from './annotation';
import { registerDrawingEditor } from './drawing_anchor';

export interface EditorRect { x: number; y: number; width: number; height: number }
export interface SharedTextareaStyle {
  wrap: 'off' | 'soft' | 'hard'; fontWeight: string; fontStyle: 'normal' | 'italic' | 'oblique';
  paddingTop: number; paddingRight: number; paddingBottom: number; paddingLeft: number;
  borderTopWidth: number; borderRightWidth: number; borderBottomWidth: number; borderLeftWidth: number;
  scrollbarWidth: number; scrollbarHeight: number;
  letterSpacing: number; wordSpacing: number; textIndent: number; tabSize: number;
}
interface CodeFocusSelection { noteId?: string; anchor: string; head: string; rects: EditorRect[] }
interface SharedCodeFocus {
  width: number; height: number; scrollTop: number; scrollLeft: number; revision: string; selections: CodeFocusSelection[];
}
interface CodeFocusGeometry {
  publish?: (message: EditorMessage | null, noteId: string | undefined, rects: EditorRect[]) => void;
  get?: (message: EditorMessage, noteId?: string) => EditorRect[] | undefined;
}
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
  type: 'edit:init' | 'edit:update' | 'edit:ack' | 'edit:cursor' | 'edit:layout' | 'edit:remove' | 'edit:sync' | 'edit:scroll' | 'edit:focus';
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
  document?: 'annotations';
  focus?: SharedCodeFocus;
  textStyle?: SharedTextareaStyle;
}

export interface EditorStatus { editorId: string; pending: number; connected: boolean; ready: boolean; error?: string }
interface CommonOptions {
  pageId: string;
  send: (message: EditorMessage) => void;
  onStatus?: (status: EditorStatus) => void;
  teacherSource?: boolean;
  readOnly?: boolean;
}
export interface EditorController {
  receive: (message: EditorMessage) => void;
  setConnected: (connected: boolean) => void;
  dispose: () => void;
  snapshot?: () => void;
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
  private revisionValue?: string;

  constructor(private options: CommonOptions & {
    editorId: string;
    role: 'source' | 'viewer';
    value?: string;
    canWrite?: () => boolean;
    localWritable?: () => boolean;
    document?: 'annotations';
  }) {
    this.ready = options.role === 'source';
    if (options.role === 'source' && options.value) this.text.insert(0, options.value);
    this.undoManager = new Y.UndoManager(this.text, { trackedOrigins: new Set([this.localOrigin]), captureTimeout: 350 });
    this.listener = (update, origin) => {
      if (this.disposed) return;
      this.revisionValue = undefined;
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
  get revision() {
    if (!this.revisionValue) {
      // Yjs vectors alone do not change after a delete-only transaction.
      // Include a cached content digest so old pre-deletion geometry is rejected.
      let first = 2166136261; let second = 5381;
      const value = this.value;
      for (let i = 0; i < value.length; i++) { first = Math.imul(first ^ value.charCodeAt(i), 16777619); second = Math.imul(second, 33) ^ value.charCodeAt(i); }
      this.revisionValue = `${encodeUpdate(Y.encodeStateVector(this.doc))}:${value.length}:${(first >>> 0).toString(36)}:${(second >>> 0).toString(36)}`;
    }
    return this.revisionValue;
  }
  trackOrigin(origin: unknown) { this.undoManager.addTrackedOrigin(origin); }
  private transmit(message: EditorMessage) {
    try { this.options.send({ ...message, ...(this.options.document ? { document: this.options.document } : {}) }); } catch { this.setConnected(false); }
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
    if (this.disposed || message.pageId !== this.options.pageId || message.editorId !== this.options.editorId
      || message.document !== this.options.document) return false;
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

interface CodeNote {
  anchor: string; head: string; text: string; offsetX: number; offsetY: number; width?: number; height?: number;
}

/** Drawing a focus or a note never changes either peer's native selection. */
function attachCodeFocus(node: HTMLElement, shared: CollaborativeText, editor?: any, container?: HTMLElement,
  note?: { id: string; teacher: boolean; onChange: (patch: Partial<CodeNote>) => void; onClear: () => void; onLeave: () => void },
  geometry?: CodeFocusGeometry) {
  const root = document.createElement('div');
  root.className = 'live-share-code-focus-layer';
  root.dataset.liveSharePrivate = ''; root.dataset.liveShareUi = '';
  root.dataset.shareCodeFocus = '';
  if (note) root.dataset.shareCodeAnnotation = note.id;
  root.style.cssText = `position:${container ? 'absolute' : 'fixed'};pointer-events:none;overflow:hidden;z-index:1002;display:none`;
  (container || document.body).appendChild(root);
  const promote = () => {
    if (!note) return;
    for (const sibling of root.parentElement?.querySelectorAll<HTMLElement>('[data-share-code-annotation]') || []) sibling.style.zIndex = '1002';
    root.style.zIndex = '1003';
  };
  if (note?.teacher) {
    root.addEventListener('pointerdown', promote, true);
    root.addEventListener('focusin', promote);
  }
  const surface = attachAnnotationSurface({ container: root, teacher: !!note?.teacher, id: note?.id,
    onChange: note?.onChange, onClear: note?.onClear });
  let mark: ShareAnnotation = { startNodeId: 1, endNodeId: 1, startOffset: 0, endOffset: 1, quote: '代码重点', text: '', noteOpen: false, offsetX: 0, offsetY: 0 };
  let current: EditorMessage | null = null;
  let frame = 0;
  let disposed = false;
  let decorations: string[] = [];
  let rangeSignature = '';
  let measure: HTMLDivElement | undefined;
  let selected: HTMLSpanElement | undefined;
  let measureSignature = '';
  const decorationClass = `live-share-focus-${uniqueId()}`;
  let focusInput = false;
  let blurTimer: ReturnType<typeof setTimeout> | undefined;
  const leave = () => {
    clearTimeout(blurTimer);
    // Let focus settle first: moving to the resize handle or another control
    // of this same note is not leaving it, and dragging must keep the draft.
    blurTimer = setTimeout(() => {
      blurTimer = undefined;
      if (!disposed && !root.contains(node.ownerDocument.activeElement)
        && !root.querySelector('.is-dragging, .is-resizing')) note?.onLeave();
    }, 0);
  };
  if (note?.teacher) root.addEventListener('focusout', leave);
  const reset = () => {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0; current = null; rangeSignature = '';
    geometry?.publish?.(null, note?.id, []);
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
          options: { className: `live-share-teacher-focus-region ${decorationClass}`, showIfCollapsed: false },
        }]);
      }
      const layout = editor.getLayoutInfo();
      clip.left = layout.contentLeft; clip.right = layout.contentLeft + layout.contentWidth;
      for (const part of node.querySelectorAll<HTMLElement>(`.${decorationClass}`)) {
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
    // Monaco's measured fragments can differ under CSS scale or device pixel
    // density. Both peers ultimately draw the learner's exact CSS-pixel rows.
    for (const rect of rects) for (const key of ['x', 'y', 'width', 'height'] as const) rect[key] = Math.round(rect[key] * 1000) / 1000;
    geometry?.publish?.(current, note?.id, rects);
    const authoritative = geometry?.get?.(current, note?.id);
    if (authoritative) rects.splice(0, rects.length, ...authoritative);
    if (rects.length) {
      const x = Math.min(...rects.map((rect) => rect.x)); const y = Math.min(...rects.map((rect) => rect.y));
      const right = Math.max(...rects.map((rect) => rect.x + rect.width)); const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
      surface.render(mark, { x, y, width: right - x, height: bottom - y, rects }, focusInput);
      if (focusInput) surface.focus();
      focusInput = false;
    } else surface.render(null, null);
    frame = window.requestAnimationFrame(render);
  };
  return {
    set(message: EditorMessage | null, value?: CodeNote, focus = false) {
      current = message;
      if (value && (value.text !== mark.text || value.offsetX !== mark.offsetX || value.offsetY !== mark.offsetY
        || value.width !== mark.width || value.height !== mark.height)) promote();
      if (value) mark = { ...mark, ...value, noteOpen: true };
      focusInput ||= focus;
      if (message) render(); else reset();
    },
    dispose() {
      disposed = true; reset(); surface.dispose();
      clearTimeout(blurTimer); root.removeEventListener('focusout', leave);
      root.removeEventListener('pointerdown', promote, true); root.removeEventListener('focusin', promote);
      root.remove();
    },
  };
}

/** Notes have their own CRDT document: annotating read-only code must never
 * change its model, dirty state, undo history or normal newline behaviour. */
function attachCodeAnnotations(node: HTMLElement, code: CollaborativeText, notes: CollaborativeText,
  options: CommonOptions & { editorId: string; teacher: boolean; connected: () => boolean; editor?: any; container?: HTMLElement; geometry?: CodeFocusGeometry }) {
  const values = notes.doc.getMap('notes');
  const surfaces = new Map<string, ReturnType<typeof attachCodeFocus>>();
  let disposed = false;
  const valid = (value: any): value is CodeNote => value && typeof value === 'object'
    && [value.anchor, value.head].every((part) => typeof part === 'string' && part.length > 0 && part.length <= 4096 && /^[A-Za-z0-9+/]*={0,2}$/.test(part))
    && typeof value.text === 'string' && value.text.length <= 1000
    && [value.offsetX, value.offsetY].every((part) => Number.isFinite(part) && Math.abs(part) <= 10000)
    && (value.width === undefined || Number.isFinite(value.width) && value.width >= 36 && value.width <= 960)
    && (value.height === undefined || Number.isFinite(value.height) && value.height >= 36 && value.height <= 800);
  const write = (id: string, value: CodeNote | null) => {
    if (!options.teacher || !options.connected() || !notes.editable) return;
    notes.doc.transact(() => { if (value) values.set(id, value); else values.delete(id); }, notes.localOrigin);
  };
  const cursor = (value: CodeNote): EditorMessage => ({ type: 'edit:cursor', pageId: options.pageId,
    editorId: options.editorId, anchor: value.anchor, head: value.head });
  const render = () => {
    if (disposed) return;
    const present = new Set<string>();
    for (const [id, value] of values) {
      if (present.size >= 40 || typeof id !== 'string' || !/^[\w-]{1,128}$/.test(id) || !valid(value)) continue;
      present.add(id);
      let surface = surfaces.get(id);
      if (!surface) {
        surface = attachCodeFocus(node, code, options.editor, options.container, { id, teacher: options.teacher,
          onChange: (patch) => { const current = values.get(id); if (valid(current)) write(id, { ...current, ...patch }); },
          onClear: () => write(id, null),
          onLeave: () => { const current = values.get(id); if (valid(current) && !current.text.trim()) write(id, null); } }, options.geometry);
        surfaces.set(id, surface);
      }
      surface.set(options.connected() ? cursor(value) : null, value);
    }
    for (const [id, surface] of surfaces) if (!present.has(id)) { surface.dispose(); surfaces.delete(id); }
  };
  const keydown = (event: KeyboardEvent) => {
    if (!options.teacher || !options.connected() || !notes.editable || event.isComposing || event.keyCode === 229
      || event.key !== 'Enter' || !event.shiftKey || event.ctrlKey || event.metaKey || event.altKey || values.size >= 40) return;
    const textarea = node as HTMLTextAreaElement;
    const message = options.editor ? cursorMessage(code, options.editor, options.pageId, options.editorId)
      : cursorFromOffsets(code, textarea.selectionStart, textarea.selectionEnd, options.pageId, options.editorId);
    const offsets = message && cursorOffsets(code, message);
    if (!message || !offsets || offsets.start === offsets.end) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const id = uniqueId();
    const value: CodeNote = { anchor: message.anchor!, head: message.head!, text: '', offsetX: 24, offsetY: 48 };
    write(id, value);
    surfaces.get(id)?.set(message, value, true);
  };
  values.observe(render); code.text.observe(render);
  if (options.teacher) node.addEventListener('keydown', keydown, true);
  render();
  return {
    refresh: render,
    dispose() {
      disposed = true; values.unobserve(render); code.text.unobserve(render);
      node.removeEventListener('keydown', keydown, true);
      for (const surface of surfaces.values()) surface.dispose(); surfaces.clear();
    },
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
  notes: CollaborativeText;
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
    const notes = new CollaborativeText({ pageId: options.pageId, send: options.send, editorId: id, role: 'source', document: 'annotations' });
    shared.setConnected(connected);
    notes.setConnected(connected);
    const previousMarker = node.getAttribute('data-live-share-editor');
    node.setAttribute('data-live-share-editor', id);
    const cleanups: Array<() => void> = [registerDrawingEditor(node, editor)];
    let decorations: string[] = [];
    let remoteCursor: EditorMessage | undefined;
    let lastLayout = '';
    let lastLayoutAt = 0;
    let lastTheme = '';
    let scrollSeq = 0;
    let layoutTimer: ReturnType<typeof setTimeout> | undefined;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    let geometryDisposed = false;
    let lastFocus = '';
    type FocusContext = Omit<SharedCodeFocus, 'selections'>;
    const focusContext = (): FocusContext => ({ width: node.offsetWidth, height: node.offsetHeight,
      scrollTop: editor ? editor.getScrollTop() : node.scrollTop, scrollLeft: editor ? editor.getScrollLeft() : node.scrollLeft,
      revision: shared.revision });
    let measuredContext: FocusContext | undefined;
    let measuredKey = '';
    const focusSelections = new Map<string, { key: string; selection: CodeFocusSelection }>();
    const geometry: CodeFocusGeometry = { publish(message, noteId, rects) {
      if (geometryDisposed) return;
      measuredContext = focusContext(); measuredKey = JSON.stringify(measuredContext);
      if (message) focusSelections.set(noteId || '', { key: measuredKey,
        selection: { ...(noteId ? { noteId } : {}), anchor: message.anchor!, head: message.head!, rects: rects.slice(0, 256) } });
      else focusSelections.delete(noteId || '');
      if (!connected) return;
      focusTimer ||= setTimeout(() => {
        focusTimer = undefined;
        // Never relabel rectangles measured before an edit/resize with the new
        // code revision or dimensions. The next measured frame will republish.
        if (!connected || !measuredContext || JSON.stringify(focusContext()) !== measuredKey) return;
        const selections: CodeFocusSelection[] = [];
        let count = 0;
        for (const entry of focusSelections.values()) {
          if (entry.key !== measuredKey) continue;
          const { selection } = entry;
          if (selections.length >= 41 || count + selection.rects.length > 2048) continue;
          selections.push(selection); count += selection.rects.length;
        }
        const focus: SharedCodeFocus = { ...measuredContext, selections };
        const signature = JSON.stringify(focus);
        if (signature === lastFocus || signature.length > MAX_UPDATE) return;
        lastFocus = signature;
        safeSend(options, { type: 'edit:focus', pageId: options.pageId, editorId: id, focus });
      }, 40);
    } };
    const focus = attachCodeFocus(node, shared, editor, undefined, undefined, geometry);
    cleanups.push(() => focus.dispose());
    const annotations = attachCodeAnnotations(node, shared, notes, { ...options, editorId: id, teacher: !!options.teacherSource, connected: () => connected, editor, geometry });
    cleanups.push(() => annotations.dispose());
    if (editor) {
      const binding = new MonacoBinding(shared.text, model, new Set([editor]));
      shared.trackOrigin(binding);
      cleanups.push(localUndo(model, shared, editor), () => binding.destroy());
      cleanups.push(observeCursor(editor, shared, options, id, () => connected, options.teacherSource ? (message) => focus.set(message) : undefined));
      cleanups.push(compositionGuard(editor, shared));
    } else cleanups.push(bindTextarea(textarea, shared, true), observeTextareaCursor(textarea, shared, options, id, () => connected, options.teacherSource ? (message) => focus.set(message) : undefined));
    const metadata = () => {
      const style = getComputedStyle(node);
      const raw = editor?.getRawOptions?.() || {};
      const fontId = (window as any).monaco?.editor?.EditorOptions?.fontInfo?.id;
      const font = editor && fontId !== undefined ? editor.getOption(fontId) : raw;
      const textStyle: SharedTextareaStyle | undefined = editor ? undefined : {
        wrap: ['soft', 'hard'].includes(textarea.wrap) ? textarea.wrap as 'soft' | 'hard' : 'off',
        fontWeight: style.fontWeight, fontStyle: ['italic', 'oblique'].includes(style.fontStyle) ? style.fontStyle as 'italic' | 'oblique' : 'normal',
        paddingTop: parseFloat(style.paddingTop) || 0, paddingRight: parseFloat(style.paddingRight) || 0,
        paddingBottom: parseFloat(style.paddingBottom) || 0, paddingLeft: parseFloat(style.paddingLeft) || 0,
        borderTopWidth: parseFloat(style.borderTopWidth) || 0, borderRightWidth: parseFloat(style.borderRightWidth) || 0,
        borderBottomWidth: parseFloat(style.borderBottomWidth) || 0, borderLeftWidth: parseFloat(style.borderLeftWidth) || 0,
        scrollbarWidth: Math.max(0, node.offsetWidth - node.clientWidth - (parseFloat(style.borderLeftWidth) || 0) - (parseFloat(style.borderRightWidth) || 0)),
        scrollbarHeight: Math.max(0, node.offsetHeight - node.clientHeight - (parseFloat(style.borderTopWidth) || 0) - (parseFloat(style.borderBottomWidth) || 0)),
        letterSpacing: parseFloat(style.letterSpacing) || 0, wordSpacing: parseFloat(style.wordSpacing) || 0,
        textIndent: parseFloat(style.textIndent) || 0, tabSize: parseFloat(style.tabSize) || 8,
      };
      return {
        kind: editor ? 'monaco' as const : 'textarea' as const, language: model?.getLanguageId?.() || 'plaintext',
        rect: rectangle(node), readOnly: !writable(), fontSize: Number(font.fontSize) || parseFloat(style.fontSize) || 14,
        fontFamily: typeof font.fontFamily === 'string' ? font.fontFamily : style.fontFamily,
        lineHeight: Number(font.lineHeight) || parseFloat(style.lineHeight) || 20,
        scrollTop: editor ? editor.getScrollTop() : node.scrollTop,
        scrollLeft: editor ? editor.getScrollLeft() : node.scrollLeft,
        scrollSeq, view: editorView(editor, model), theme: editorTheme(editor), ...(textStyle ? { textStyle } : {}),
      };
    };
    const announce = () => {
      lastFocus = '';
      const state = shared.snapshot;
      if (state.length > MAX_UPDATE) {
        options.onStatus?.({ editorId: id, pending: 0, connected, ready: false, error: '这份代码过大，暂不支持共享编辑；学员原代码已保留' });
        if (connected) safeSend(options, { type: 'edit:remove', pageId: options.pageId, editorId: id });
        return;
      }
      if (connected) {
        const data = metadata(); lastTheme = JSON.stringify(data.theme);
        safeSend(options, { type: 'edit:init', pageId: options.pageId, editorId: id, state, ...data });
        safeSend(options, { type: 'edit:init', pageId: options.pageId, editorId: id, state: notes.snapshot, document: 'annotations' });
        if (options.teacherSource) {
          const cursor = editor ? cursorMessage(shared, editor, options.pageId, id)
            : cursorFromOffsets(shared, textarea.selectionStart, textarea.selectionEnd, options.pageId, id);
          focus.set(cursor); if (cursor) safeSend(options, cursor);
        }
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
    cleanups.push(() => { clearTimeout(layoutTimer); clearTimeout(focusTimer); });
    return {
      id, node, editor, model, shared, notes, announce, layout,
      resetCursor() {
        remoteCursor = undefined; focus.set(null);
        annotations.refresh();
        if (editor && !model.isDisposed?.()) decorations = editor.deltaDecorations(decorations, []);
      },
      receive(message) {
        if (message.type === 'edit:sync') { announce(); return; }
        if (message.document === 'annotations') { notes.receive(message); return; }
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
        geometryDisposed = true;
        if (editor && !model.isDisposed?.()) editor.deltaDecorations(decorations, []);
        for (const cleanup of cleanups.reverse()) cleanup();
        shared.dispose();
        notes.dispose();
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
      if (!node?.isConnected || !model || model.isDisposed?.() || node.closest('[data-live-share-viewer],[data-private],[data-sensitive],[data-live-share-private],[data-live-share-ui],[data-teacher-assistant]')) continue;
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
      if (!node.isConnected || node.closest('[data-live-share-viewer],[data-private],[data-sensitive],[data-live-share-private],[data-live-share-ui],[data-teacher-assistant]') || !node.getClientRects().length) continue;
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
    snapshot() { if (connected && !disposed) for (const binding of bindings.values()) binding.announce(); },
    receive(message) {
      if (disposed || !connected || !message || message.pageId !== options.pageId) return;
      if (message.type === 'edit:sync' && !message.editorId) { for (const binding of bindings.values()) binding.announce(); return; }
      for (const binding of bindings.values()) if (binding.id === message.editorId) binding.receive(message);
    },
    setConnected(value) {
      connected = value;
      for (const binding of bindings.values()) {
        binding.shared.setConnected(value); binding.notes.setConnected(value); binding.resetCursor();
        if (value) binding.announce();
      }
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
  notes: CollaborativeText;
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
  const pendingNotes = new Map<string, EditorMessage[]>();
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
      if (options.readOnly) { node.tabIndex = -1; node.setAttribute('aria-readonly', 'true'); }
      let readOnly = !!options.readOnly || !!initial.readOnly;
      let refresh = () => {};
      const shared = new CollaborativeText({
        ...options, editorId: initial.editorId, role: 'viewer', canWrite: () => !readOnly,
        onStatus(status) { refresh(); options.onStatus?.(status); },
      });
      shared.setConnected(connected);
      shared.receive(initial);
      const notes = new CollaborativeText({ pageId: options.pageId, send: options.send, editorId: initial.editorId,
        role: 'viewer', document: 'annotations' });
      notes.setConnected(connected);
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
      let sourceFocus: SharedCodeFocus | undefined;
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
      cleanups.push(registerDrawingEditor(node, editor));
      const geometry: CodeFocusGeometry = { get(message, noteId) {
        if (!sourceFocus || sourceFocus.width !== node.offsetWidth || sourceFocus.height !== node.offsetHeight
          || sourceFocus.revision !== shared.revision
          || Math.abs(sourceFocus.scrollTop - (editor ? editor.getScrollTop() : node.scrollTop)) > 0.5
          || Math.abs(sourceFocus.scrollLeft - (editor ? editor.getScrollLeft() : node.scrollLeft)) > 0.5) return undefined;
        return sourceFocus.selections.find((selection) => selection.noteId === noteId
          && selection.anchor === message.anchor && selection.head === message.head)?.rects;
      } };
      focus = attachCodeFocus(node, shared, editor, options.container, undefined, geometry);
      cleanups.push(() => focus.dispose());
      const annotations = attachCodeAnnotations(node, shared, notes, { ...options, editorId: initial.editorId,
        teacher: !options.readOnly, connected: () => connected, editor, geometry });
      cleanups.push(() => annotations.dispose());
      const onScroll = () => {
        if (options.readOnly || applyingScroll || !connected) return;
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
        if (message.document === 'annotations') { notes.receive(message); annotations.refresh(); return; }
        if (message.type === 'edit:focus') { sourceFocus = message.focus; return; }
        applyingScroll = true;
        if (message.type === 'edit:cursor') { remoteCursor = message; if (options.readOnly) focus.set(message); }
        else shared.receive(message);
        if (message.type === 'edit:init' || message.type === 'edit:layout') {
          if (typeof message.readOnly === 'boolean') readOnly = !!options.readOnly || message.readOnly;
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
            if (message.textStyle) {
              const { wrap, fontWeight, fontStyle, tabSize, scrollbarWidth, scrollbarHeight, ...pixels } = message.textStyle;
              (node as HTMLTextAreaElement).wrap = wrap;
              Object.assign(node.style, { fontWeight, fontStyle, tabSize: String(tabSize), borderStyle: 'solid', borderColor: 'transparent' });
              for (const [key, value] of Object.entries(pixels)) node.style[key] = `${value}px`;
              // Reserve the learner's actual scrollbar space even when the
              // teacher uses overlay scrollbars or a different operating system.
              node.style.paddingRight = `${pixels.paddingRight + scrollbarWidth}px`;
              node.style.paddingBottom = `${pixels.paddingBottom + scrollbarHeight}px`;
            }
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
        shared, notes, node, editor, readOnly, update, refresh, layout,
        resetCursor() {
          remoteCursor = undefined; sourceFocus = undefined; focus.set(null);
          annotations.refresh();
          if (editor && !model.isDisposed?.()) decorations = editor.deltaDecorations(decorations, []);
        },
        dispose() {
          for (const cleanup of cleanups.reverse()) cleanup();
          shared.dispose(); notes.dispose(); editor?.dispose(); model?.dispose(); node.remove();
        },
      };
      bindings.set(initial.editorId, result);
      update(initial);
      const queue = [...(pendingNotes.get(initial.editorId) || []), ...(creating.get(initial.editorId) || [])];
      pendingNotes.delete(initial.editorId);
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
        creating.delete(message.editorId); pendingNotes.delete(message.editorId); return;
      }
      const binding = bindings.get(message.editorId);
      if (binding) binding.update(message);
      else if (creating.has(message.editorId)) creating.get(message.editorId)!.push(message);
      else if (message.document === 'annotations') {
        const queue = pendingNotes.get(message.editorId) || [];
        if (pendingNotes.size < 64 && queue.length < 64) { queue.push(message); pendingNotes.set(message.editorId, queue); }
      }
      else if (message.type === 'edit:init') void create(message);
      else if (message.type === 'edit:update' && connected) safeSend(options, { type: 'edit:sync', pageId: options.pageId, editorId: message.editorId });
    },
    setConnected(value) {
      connected = value;
      for (const binding of bindings.values()) {
        binding.shared.setConnected(value); binding.notes.setConnected(value); binding.refresh(); binding.resetCursor();
      }
      if (value) safeSend(options, { type: 'edit:sync', pageId: options.pageId, editorId: '' });
    },
    dispose() {
      disposed = true; creating.clear(); pendingNotes.clear();
      if (geometryFrame) window.cancelAnimationFrame(geometryFrame);
      const currentTheme = themeService?.getColorTheme?.()?.themeName;
      for (const [editorId, binding] of bindings) { preserveDraft(editorId, binding); binding.dispose(); }
      bindings.clear(); style.remove();
      if (originalTheme && currentTheme === sharedThemeName) monacoRuntime?.editor.setTheme(originalTheme);
    },
  };
}
