import { getActiveIdeRuntime } from '../ide/runtime';
import { createIdeView } from '../ide/view';
import { isValidIdeSnapshot } from '../ide/validation';
import { emptyIdeSnapshot, IdeSnapshot } from '../ide/types';

export { attachIdeCapacityMirror } from '../ide/IdeCapacityBadge';

const CHUNK = 24000;
const MAX_STATE = 4 * 1024 * 1024;
const bounds = () => {
  const node = document.querySelector<HTMLElement>('[data-ide-runtime]:not([data-live-share-ui])');
  const rect = node?.getBoundingClientRect();
  return rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null;
};

/** Send bounded display patches; code runs only in the learner's existing runtime. */
export function attachSourceIde(options: {
  pageId: string; send: (data: any) => boolean | void; sendAck: (data: any) => void;
}) {
  let connected = false; let disposed = false; let runtime = getActiveIdeRuntime();
  let unsubscribe: (() => void) | undefined; let last = ''; let sequence = 0;
  let previous: any = null; let timer = 0; let dirty = true; let lastBounds = '';
  const observeBounds = () => { const current = JSON.stringify(bounds()); if (current !== lastBounds) { lastBounds = current; dirty = true; } };
  const seen = new Set<string>();
  function bind() {
    clearTimeout(timer); unsubscribe?.(); runtime = getActiveIdeRuntime(); previous = null; last = ''; dirty = true;
    unsubscribe = runtime?.subscribe(() => { dirty = true; });
    timer = window.setTimeout(pump, 0);
  }
  function pump() {
    if (disposed) return;
    observeBounds();
    if (!connected || !dirty) { timer = window.setTimeout(pump, 200); return; }
    dirty = false;
    const snapshot = runtime?.snapshot(); const rect = bounds();
    const current = snapshot && rect ? { snapshot, rect } : null;
    const serialized = JSON.stringify(current);
    if (serialized === last) { timer = window.setTimeout(pump, 200); return; }
    // Clone here: owner arrays are mutable between animation frames.
    const next = JSON.parse(serialized);
    let packet: any = { reset: true, ...next };
    if (!next) packet = { reset: true, snapshot: null };
    else if (previous && previous.snapshot.runId === next.snapshot.runId) {
      const old = previous.snapshot; const now = next.snapshot;
      const oldItems = new Map(old.primitives.map((item: any) => [item.id, JSON.stringify(item)]));
      const currentIds = new Set(now.primitives.map((item: any) => item.id));
      const changed: any = {};
      for (const key of Object.keys(now)) {
        if (key !== 'primitives' && JSON.stringify(old[key]) !== JSON.stringify(now[key])) changed[key] = now[key];
      }
      packet = { reset: false, base: old.revision, snapshot: changed, rect: next.rect,
        upsert: now.primitives.filter((item: any) => oldItems.get(item.id) !== JSON.stringify(item)),
        remove: old.primitives.filter((item: any) => !currentIds.has(item.id)).map((item: any) => item.id) };
    }
    const wire = JSON.stringify(packet);
    if (wire.length > MAX_STATE) { timer = window.setTimeout(pump, 500); return; }
    const seq = ++sequence; const total = Math.ceil(wire.length / CHUNK);
    let index = 0;
    const transmit = () => {
      if (disposed || !connected) { previous = null; last = ''; dirty = true; timer = window.setTimeout(pump, 200); return; }
      const sent = options.send({ type: 'ide', sequence: seq, index, total, chunk: wire.slice(index * CHUNK, (index + 1) * CHUNK) });
      if (sent === false) { previous = null; last = ''; dirty = true; timer = window.setTimeout(pump, 500); return; }
      index++;
      if (index < total) timer = window.setTimeout(transmit, 75);
      else { previous = next; last = serialized; timer = window.setTimeout(pump, 150); }
    };
    transmit();
  }
  const layout = () => { dirty = true; };
  bind(); window.addEventListener('hydro:ide-runtime-ready', bind);
  window.addEventListener('resize', layout); window.addEventListener('scroll', layout, true);
  return {
    setConnected(value: boolean) {
      clearTimeout(timer); connected = value; previous = null; last = ''; dirty = true; timer = window.setTimeout(pump, 0);
    },
    snapshot() { clearTimeout(timer); previous = null; last = ''; dirty = true; timer = window.setTimeout(pump, 0); },
    receiveCommand(data: any) {
      if (!connected || disposed || data?.action !== 'ide' || data.pageId !== options.pageId || !runtime || seen.has(data.id)) return;
      seen.add(data.id); if (seen.size > 512) seen.delete(seen.values().next().value!);
      if (data.runId !== runtime.snapshot().runId) return;
      runtime.command(data.command);
      options.sendAck({ id: data.id, pageId: options.pageId, ok: true });
    },
    dispose() {
      disposed = true; clearTimeout(timer); unsubscribe?.();
      window.removeEventListener('hydro:ide-runtime-ready', bind);
      window.removeEventListener('resize', layout); window.removeEventListener('scroll', layout, true);
    },
  };
}

export function attachViewerIde(options: { pageId: string; container: HTMLElement; readOnly?: boolean; sendCommand: (data: any) => void }) {
  const host = document.createElement('div'); host.dataset.liveShareUi = '';
  host.style.cssText = 'position:absolute;pointer-events:none;display:none;z-index:12';
  options.container.append(host);
  let connected = false; let disposed = false; let sequence = -1; let assembly: { sequence: number; total: number; chunks: string[]; size: number } | null = null;
  let state: IdeSnapshot = emptyIdeSnapshot();
  const view = createIdeView(host, { shared: true, onCommand: (command) => {
    if (options.readOnly || !connected || disposed || host.style.display === 'none') return;
    options.sendCommand({ id: Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) => n.toString(16).padStart(2, '0')).join(''), pageId: options.pageId, nodeId: 1,
      action: 'ide', runId: state.runId, command });
  } });
  const root = host.querySelector<HTMLElement>('[data-ide-runtime]')!;
  root.style.inset = '0';
  if (options.readOnly) {
    host.inert = true;
    // This is an extra remote-control shortcut, not part of the source IDE.
    // A broadcast audience must only see the teacher's actual runtime windows.
    root.querySelector('.ide-runtime__shared-run')?.remove();
  }
  return {
    setConnected(value: boolean) {
      if (connected !== value) { sequence = -1; assembly = null; }
      connected = value; host.inert = !!options.readOnly || !value;
    },
    receive(data: any) {
      if (disposed || data?.type !== 'ide' || !Number.isSafeInteger(data.sequence) || data.sequence < 0 || data.sequence <= sequence || !Number.isInteger(data.total)
        || data.total < 1 || data.total > 180 || !Number.isInteger(data.index) || data.index < 0 || data.index >= data.total
        || typeof data.chunk !== 'string' || data.chunk.length > CHUNK) return;
      if (!assembly || data.sequence > assembly.sequence) assembly = { sequence: data.sequence, total: data.total, chunks: [], size: 0 };
      if (data.sequence !== assembly.sequence || data.total !== assembly.total || assembly.chunks[data.index] !== undefined) return;
      assembly.chunks[data.index] = data.chunk; assembly.size += data.chunk.length;
      if (assembly.size > MAX_STATE) { assembly = null; return; }
      if (assembly.chunks.filter((part) => part !== undefined).length !== assembly.total) return;
      let packet: any;
      try { packet = JSON.parse(assembly.chunks.join('')); } catch { assembly = null; return; }
      assembly = null;
      if (!packet || typeof packet !== 'object' || Array.isArray(packet)) return;
      if (packet.reset && packet.snapshot === null) { sequence = data.sequence; host.style.display = 'none'; state = emptyIdeSnapshot(); return; }
      if (!packet.snapshot || typeof packet.snapshot !== 'object' || Array.isArray(packet.snapshot)
        || typeof packet.reset !== 'boolean' || (!packet.reset && packet.base !== state.revision)) return;
      const next = packet.reset ? packet.snapshot : { ...state, ...packet.snapshot };
      if (!packet.reset) {
        if (!Array.isArray(packet.remove) || packet.remove.length > 12000 || !packet.remove.every((id: any) => Number.isSafeInteger(id) && id > 0)
          || !Array.isArray(packet.upsert) || packet.upsert.length > 12000
          || !packet.upsert.every((item: any) => item && typeof item === 'object' && Number.isSafeInteger(item.id) && item.id > 0)) return;
        const items = new Map(state.primitives.map((item) => [item.id, item]));
        packet.remove.forEach((id: number) => items.delete(id)); packet.upsert.forEach((item: any) => items.set(item.id, item));
        next.primitives = [...items.values()];
      }
      const rect = packet.rect;
      if (!isValidIdeSnapshot(next) || !rect || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(rect[key]) && Math.abs(rect[key]) <= 32768)
        || rect.width <= 0 || rect.height <= 0) return;
      sequence = data.sequence; state = next;
      Object.assign(host.style, { display: 'block', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
      view.render(state);
    },
    dispose() { disposed = true; assembly = null; view.dispose(); host.remove(); },
  };
}
