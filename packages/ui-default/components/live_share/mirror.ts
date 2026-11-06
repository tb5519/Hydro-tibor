import { record, Replayer } from './vendor';

/** The replay is a display surface. Its scripts, forms and links never run. */
const BLOCK = [
  '.monaco-editor', '[data-live-share-editor]', '[data-live-share-ui]', '[data-live-share-private]', '[data-teacher-assistant]',
  '.live-share', '.live-share-shell', 'iframe', 'object', 'embed',
  'input[type="password"]', 'input[type="hidden"]', 'input[type="file"]',
  '[autocomplete="current-password"]', '[autocomplete="new-password"]',
  '[data-private]', '[data-sensitive]', '[name*="token" i]', '[name*="password" i]',
  '[name*="secret" i]', '[name*="csrf" i]',
].join(',');
const MAX_EVENT_BYTES = 8 * 1024 * 1024;
const MAX_QUEUED_BYTES = 12 * 1024 * 1024;
const MAX_CHUNKS = 768;
const CHUNK_CHARS = 16 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

type RREvent = { type: number; timestamp: number; data: any };
export interface MirrorCommand {
  id: string;
  pageId: string;
  nodeId: number;
  action: 'click' | 'scroll' | 'select' | 'search';
  target?: string;
  value?: string;
  x?: number;
  y?: number;
}
export interface MirrorAck { id: string; pageId: string; ok: boolean; reason?: string }
interface SourceOptions {
  pageId: string;
  send: (data: any) => void | boolean;
  sendAck?: (data: MirrorAck) => void;
  onStatus?: (message: string) => void;
}
interface ViewerOptions {
  pageId: string;
  container: HTMLElement;
  sendCommand: (data: MirrorCommand) => void;
  onViewport?: (size: { width: number; height: number }) => void;
  onStatus?: (message: string) => void;
}

const dangerousSegments = /\/(?:manage|account|home|login|logout|register|sudo|switch|payment|pay|purchase|checkout|create|edit|config|delete|remove|save|rejudge|cancel|join|leave|attend|copy|publish|share|download|file|files|settings|security|token|api)(?:\/|$)/i;

/** A remote click can navigate only an existing, safe study link on the student's page. */
export function safeStudyUrl(raw: string, base: string): string | null {
  try {
    const url = new URL(raw, base);
    const origin = new URL(base).origin;
    if (url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    let path = decodeURIComponent(url.pathname);
    if (/[\\%\u0000-\u0020]/.test(path)) return null;
    path = path.replace(/^\/d\/[^/]+(?=\/|$)/, '') || '/';
    if (dangerousSegments.test(path)) return null;
    if ([...url.searchParams.keys()].some((key) => /(?:operation|action|token|secret|password|csrf|redirect|return|next)/i.test(key))) return null;
    if (!/^(?:\/|\/(?:p(?:\/[^/]+(?:\/(?:submit|solution(?:\/[^/]+)?|stat|submission-records))?)?|contest(?:\/[^/]+(?:\/(?:problems|scoreboard))?)?|homework(?:\/[^/]+)?|training(?:\/[^/]+)?|record(?:\/[^/]+)?|ranking|ide|mistakes|daily-quiz|problem\/random|scratch(?:\/(?:problems|works|assignments|materials|community|editor|problem\/[^/]+|assignment\/[^/]+|material\/[^/]+|work\/[^/]+|submission\/[^/]+))?))\/?$/.test(path)) return null;
    return url.href;
  } catch { return null; }
}

function closestElement(node: any): Element | null {
  return node?.nodeType === 1 ? node : node?.parentElement || null;
}
function interactive(node: any): HTMLElement | null {
  return closestElement(node)?.closest<HTMLElement>('a,button,input,select,summary,[role="tab"],[data-training-description-toggle]') || null;
}
function blocked(element: Element | null): boolean {
  return !element || !!element.closest(BLOCK) || !!element.closest('[inert]');
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
  if (element.tagName === 'A' && !['javascript:;', '#'].includes(element.getAttribute('href') || '')) return false;
  return element.matches([
    '[name="problem-sidebar__open-scratchpad"]', '[name="problem-sidebar__quit-scratchpad"]',
    '#scratchpad .scratchpad__toolbar__pretest',
    '#scratchpad [data-control-art="pretestTab"]', '#scratchpad [data-control-art="recordsTab"]',
    '#scratchpad .scratchpad__tabicon-problem',
    '[data-training-description-toggle]', 'details > summary',
  ].join(','));
}
function targetFingerprint(element: Element) {
  // Stable across snapshot rebuilding, but changes when a recycled DOM node points to another item.
  // Replay strips executable hrefs. Named local UI controls still refer to the same node.
  const rawHref = element.getAttribute('href') || '';
  const href = element.tagName === 'A' && rawHref && !['javascript:;', '#'].includes(rawHref)
    ? (element as HTMLAnchorElement).href : '';
  const text = [element.tagName, element.id, element.getAttribute('name') || '',
    href, element.textContent?.trim().slice(0, 160) || ''].join('|');
  let hash = 2166136261;
  for (let at = 0; at < text.length; at++) hash = Math.imul(hash ^ text.charCodeAt(at), 16777619);
  return (hash >>> 0).toString(16);
}
function disabled(element: HTMLElement) {
  return element.matches(':disabled,[aria-disabled="true"],.disabled') || !element.isConnected;
}

/** Remove executable payloads even if a malformed peer bypassed the normal recorder. */
export function sanitizeMirrorEvent(event: any): RREvent | null {
  if (!event || !Number.isInteger(event.type) || ![0, 1, 2, 3, 4].includes(event.type)
    || !Number.isFinite(event.timestamp) || !event.data || typeof event.data !== 'object') return null;
  if (event.type === 3 && ![0, 1, 2, 3, 4, 5, 6, 8, 12, 13, 14].includes(event.data.source)) return null;
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
        else if (typeof value === 'string' && /^\s*data:/i.test(value) && !/^data:image\/(?:png|jpeg|webp|gif|avif);/i.test(value)) delete attributes[key];
      }
    }
    if (['iframe', 'object', 'embed', 'script', 'base', 'meta'].includes(tagName)) {
      for (const key of Object.keys(attributes)) delete attributes[key];
    }
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
        node.attributes = { 'data-live-share-unavailable': 'true', style: 'min-height:96px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:12px' };
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
  const commands = new Map<string, MirrorAck>();
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
    if (event.type === 2) hasSnapshot = true;
    if (!hasSnapshot && event.type !== 4) return;
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
      maskInputFn: (value: string, element: Element) => allowedSelect(element) || allowedSearch(element) ? value : '*'.repeat(Math.min(value.length, 100)),
      inlineStylesheet: false, inlineImages: false, recordCanvas: false, collectFonts: false, recordCrossOriginIframes: false,
      keepIframeSrcFn: () => false, slimDOMOptions: { script: true, comment: true, headMetaDescKeywords: true, headMetaSocial: true, headMetaRobots: true, headMetaHttpEquiv: true },
      sampling: { mousemove: false, mouseInteraction: false, scroll: 120, input: 'last', media: 1000 },
      checkoutEveryNms: 60000, checkoutEveryNth: 3000,
      errorHandler: () => { message('部分页面内容暂时无法同步。'); return true; },
    } as any);
  }
  queueMicrotask(start);
  const sourceMirror = () => (record as any).mirror;
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
    if (command.action === 'scroll') {
      if (![command.x, command.y].every((value) => Number.isFinite(value) && Math.abs(value) < 1000000)) return deny('位置无效');
      const target = raw === document ? document.scrollingElement : closestElement(raw);
      if (!target?.isConnected || blocked(target)) return deny('目标不可操作');
      target.scrollTo({ left: Math.max(0, command.x), top: Math.max(0, command.y), behavior: 'instant' as ScrollBehavior });
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
    if (allowedButton(element)) {
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
    snapshot() { if (connected && !disposed && stop) (record as any).takeFullSnapshot(true); },
    setConnected(value: boolean) {
      if (disposed) return;
      if (connected === value) { if (value && stop) (record as any).takeFullSnapshot(true); return; }
      connected = value;
      generation++;
      stop?.(); stop = undefined;
      queue = []; queuedBytes = 0;
      if (value) start();
    },
    dispose() { disposed = true; generation++; stop?.(); stop = undefined; queue = []; queuedBytes = 0; commands.clear(); },
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
  const host = document.createElement('div');
  host.className = 'live-share-mirror';
  host.style.cssText = 'position:absolute;inset:0;overflow:hidden';
  options.container.appendChild(host);

  function command(node: any, action: MirrorCommand['action'], extra: Partial<MirrorCommand> = {}) {
    if (!connected || !ready || disposed || !player) return;
    const nodeId = player.getMirror().getId(node);
    if (nodeId <= 0) return;
    options.sendCommand({ id: `cmd-${Date.now().toString(36)}-${++serial}`, pageId: options.pageId, nodeId, action,
      ...(action === 'scroll' ? {} : { target: targetFingerprint(node) }), ...extra });
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
    style.textContent = '[data-live-share-unavailable]::after{content:"此区域暂不支持实时共享";display:block;padding:32px;color:#64748b;font:14px system-ui;text-align:center} [data-teacher-assistant],[data-live-share-ui]{visibility:hidden!important}';
    doc.head?.appendChild(style);
    const click = (event: MouseEvent) => {
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
      if (event.key !== 'Enter') return;
      event.preventDefault(); event.stopImmediatePropagation();
      const element = closestElement(event.target);
      if (element && allowedSearch(element)) command(element, 'search', { value: element.value });
    };
    const wheel = (event: WheelEvent) => {
      if (!connected || disposed) { event.preventDefault(); return; }
      let element = closestElement(event.target);
      while (element && element !== doc.body && element !== doc.documentElement
        && element.scrollHeight <= element.clientHeight + 1 && element.scrollWidth <= element.clientWidth + 1) element = element.parentElement;
      const scrollTarget = element === doc.body || element === doc.documentElement || !element ? doc.scrollingElement : element;
      if (!scrollTarget || blocked(scrollTarget)) return;
      event.preventDefault();
      const multiplier = event.deltaMode === 1 ? 18 : event.deltaMode === 2 ? frame.clientHeight : 1;
      scrollTarget.scrollBy(event.deltaX * multiplier, event.deltaY * multiplier);
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => command(scrollTarget === doc.scrollingElement ? doc : scrollTarget, 'scroll', {
        x: scrollTarget.scrollLeft, y: scrollTarget.scrollTop,
      }), 80);
    };
    doc.addEventListener('click', click, true);
    doc.addEventListener('submit', submit, true);
    doc.addEventListener('change', change, true);
    doc.addEventListener('keydown', keydown, true);
    doc.addEventListener('wheel', wheel, { capture: true, passive: false });
    cleanupDocument = () => {
      doc.removeEventListener('click', click, true);
      doc.removeEventListener('submit', submit, true);
      doc.removeEventListener('change', change, true);
      doc.removeEventListener('keydown', keydown, true);
      doc.removeEventListener('wheel', wheel, true);
      style.remove();
    };
    ready = connected;
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
      cleanupDocument(); clearTimeout(installTimer);
      player?.destroy(); host.replaceChildren();
      const initialMeta = meta || { type: 4, timestamp: timestamp - 1, data: { width: 1280, height: 800, href: location.origin } };
      initialMeta.timestamp = timestamp - 1;
      player = new Replayer([initialMeta, event], {
        root: host, liveMode: true, mouseTail: false, showWarning: false, showDebug: false,
        UNSAFE_replayCanvas: false, loadTimeout: 0, skipInactive: false,
        insertStyleRules: ['iframe,object,embed{pointer-events:none!important}', 'a,button{cursor:pointer!important}',
          '.live-share-notice,[data-teacher-assistant],[data-live-share-private]{visibility:hidden!important;pointer-events:none!important}'],
      } as any);
      player.startLive(timestamp - 2);
      player.on('fullsnapshot-rebuilded', () => { clearTimeout(installTimer); installTimer = setTimeout(installInteractions, 0); });
      installTimer = setTimeout(installInteractions, 50);
      options.onStatus?.('画面已同步');
      return;
    }
    if (!player) return;
    if (event.type === 3 && event.data.source === 4) viewport(event.data);
    player.addEvent(event);
  }, (message) => { connected = false; options.onStatus?.(message); });
  return {
    receive(data: any) { if (!disposed && connected) assembler.receive(data); },
    setConnected(value: boolean) {
      if (connected === value) return;
      connected = value;
      ready = false;
      assembler.reset();
      // Reconnection requires a fresh snapshot; stale node IDs must never control the source.
      player?.disableInteract();
    },
    dispose() {
      disposed = true; connected = false; assembler.dispose();
      clearTimeout(installTimer); clearTimeout(wheelTimer); cleanupDocument();
      player?.destroy(); player = undefined; host.remove();
    },
  };
}
