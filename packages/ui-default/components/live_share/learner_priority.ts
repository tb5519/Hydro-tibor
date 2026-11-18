import { Y } from './vendor';

interface Id { client: number; clock: number }
interface Interval { clock: number; len: number }
interface Gap { origin: Id | null; rightOrigin: Id | null }
type Ranges = Map<number, Interval[]>;

function contains(range: Interval, clock: number) {
  return range.clock <= clock && clock < range.clock + range.len;
}
function includes(ranges: Ranges, id: Id | null) {
  return id != null && !!ranges.get(id.client)?.some((range) => contains(range, id.clock));
}
function addRange(ranges: Ranges, client: number, range: Interval) {
  const list = ranges.get(client);
  if (list) list.push(range);
  else ranges.set(client, [range]);
}
function sameId(left: Id | null, right: Id | null) {
  return left === right || (!!left && !!right && left.client === right.client && left.clock === right.clock);
}

interface LocalChange { version: number; gaps: Gap[]; inserted: Ranges; deleted: Ranges }

// An out-of-order Yjs update can otherwise disappear into pendingStructs and
// later materialize outside the conflict check that belongs to its original edit.
function hasDependencies(doc: any, structs: any[], deletes: Ranges) {
  const next = new Map<number, number>();
  const available = (client: number) => next.get(client) ?? Y.getState(doc.store, client);
  for (const item of structs) {
    const { client, clock } = item.id;
    if (item instanceof Y.Skip) continue;
    if (clock > available(client)) return false;
    next.set(client, Math.max(available(client), clock + item.length));
  }
  for (const item of structs) {
    for (const id of [item.origin, item.rightOrigin, item.parent]) {
      if (id && typeof id.client === 'number' && id.clock >= available(id.client)) return false;
    }
  }
  for (const [client, ranges] of deletes) {
    if (ranges.some((r) => r.clock + r.len > available(client))) return false;
  }
  return true;
}

interface RejectedInsert { version: number; id: Id; length: number }

/** Remember the identities of text changed at the learner's editor. Remote packets
 * and snapshots never enter this history. CRDT identities survive index shifts,
 * so independent edits to other parts of the file can still merge normally. */
export class LearnerPriority {
  version = 0;
  private changes: LocalChange[] = [];
  private rejected: RejectedInsert[] = [];
  private floor = 0;

  record(bytes: Uint8Array) {
    const { ds, structs } = Y.decodeUpdate(bytes);
    const inserted: Ranges = new Map();
    for (const item of structs) {
      if (item instanceof Y.Item) addRange(inserted, item.id.client, { clock: item.id.clock, len: item.length });
    }
    this.changes.push({ version: ++this.version, deleted: ds.clients, inserted,
      gaps: structs.filter((item) => item instanceof Y.Item).map(({ origin, rightOrigin }) => ({ origin, rightOrigin })) });
    if (this.changes.length > 2048) {
      this.floor = this.changes.shift()!.version;
      this.rejected = this.rejected.filter((entry) => entry.version > this.floor);
    }
  }

  apply(doc: any, text: any, bytes: Uint8Array, base: number, remote: symbol, resolved: symbol) {
    const { structs, ds } = Y.decodeUpdate(bytes);
    if (!hasDependencies(doc, structs, ds.clients)) return 'deferred';
    if (base === this.version) { Y.applyUpdate(doc, bytes, remote); return 'applied'; }
    const changes = this.changes.filter((entry) => entry.version > base);
    const unknown = base < this.floor || base > this.version;
    const keep: Ranges = new Map();
    for (const [client, ranges] of ds.clients as Ranges) {
      for (const range of ranges) {
        const overlaps = changes.some((change) => change.deleted.get(client)?.some((d) =>
          d.clock < range.clock + range.len && range.clock < d.clock + d.len)
          || change.gaps.some(({ origin, rightOrigin }) => includes(ds.clients, origin) && includes(ds.clients, rightOrigin)
            && (origin?.client === client && contains(range, origin.clock) || rightOrigin?.client === client && contains(range, rightOrigin.clock))));
        if (unknown || overlaps) addRange(keep, client, range);
      }
    }
    // A contiguous replacement may delete IDs from several previous writers.
    // Expand a protected range to its adjacent deleted pieces, stopping at
    // ordinary unchanged text so other teacher edits in this packet still merge.
    if (keep.size && (ds.clients.size > 1 || [...ds.clients.values()].some((ranges) => ranges.length > 1))) {
      doc.transact((transaction) => {
        const selected = new Set<any>();
        Y.iterateDeletedStructs(transaction, ds, (item) => { if (item.parent === text) selected.add(item); });
        let group: any[] = [];
        const finish = () => {
          if (group.some((item) => includes(keep, item.id))) {
            for (const item of group) if (!includes(keep, item.id)) addRange(keep, item.id.client, { clock: item.id.clock, len: item.length });
          }
          group = [];
        };
        for (const item of Y.getTypeChildren(text)) {
          if (selected.has(item)) group.push(item);
          else if (!item.deleted && !changes.some((change) => includes(change.inserted, item.id))) finish();
        }
        finish();
      }, remote);
    }
    const drop: Ranges = new Map();
    for (const item of structs) {
      if (!(item instanceof Y.Item)) continue;
      // A duplicate may be old enough to conflict today, but it was already
      // integrated earlier. Never retract an acknowledged teacher contribution.
      const start = Math.max(item.id.clock, Y.getState(doc.store, item.id.client));
      const end = item.id.clock + item.length;
      if (start >= end) continue;
      const followsRejected = (anchor: Id | null) => !!anchor && (includes(drop, anchor) || this.rejected.some((r) =>
        r.version > base && r.id.client === anchor.client && contains({ clock: r.id.clock, len: r.length }, anchor.clock)));
      const sameGap = changes.some((change) => change.gaps.some((gap) =>
        sameId(gap.origin, item.origin) && sameId(gap.rightOrigin, item.rightOrigin))
        || includes(change.deleted, item.origin) && includes(change.deleted, item.rightOrigin));
      if (unknown || sameGap || includes(keep, item.origin) || includes(keep, item.rightOrigin)
        || followsRejected(item.origin) || followsRejected(item.rightOrigin)) {
        addRange(drop, item.id.client, { clock: start, len: end - start });
      }
    }
    if (!keep.size && !drop.size) { Y.applyUpdate(doc, bytes, remote); return 'applied'; }

    // Integrate even the losing structs, then tombstone them before acknowledging.
    // Both peers thus retain identical Yjs history, including on duplicate delivery.
    // Calculate the correction on an isolated replica. Applying the merged
    // result once prevents editor bindings and autosave from ever observing
    // the losing teacher text, and keeps correction IDs out of learner undo.
    const shadow = new Y.Doc();
    try {
      Y.applyUpdate(shadow, Y.encodeStateAsUpdate(doc));
      const shadowText = shadow.getText('code');
      const restore: { at: any; order: number; value: string }[] = [];
      shadow.transact((transaction) => {
        Y.iterateDeletedStructs(transaction, { clients: keep }, (item) => {
          if (item.parent !== shadowText || item.deleted || !item.content.str) return;
          const at = Y.createRelativePositionFromJSON({ tname: 'code', item: item.id });
          const order = Y.createAbsolutePositionFromRelativePosition(at, shadow, false).index;
          restore.push({ at, order, value: item.content.str });
        });
      });
      Y.applyUpdate(shadow, bytes);
      const patches = [bytes];
      shadow.on('update', (update: Uint8Array) => patches.push(update));
      shadow.transact((transaction) => {
        Y.iterateDeletedStructs(transaction, { clients: drop }, (item) => {
          if (item.parent === shadowText && !item.deleted) item.delete(transaction);
        });
        const parts = restore.map(({ at, order, value }) => ({
          index: Y.createAbsolutePositionFromRelativePosition(at, shadow, false).index, order, value,
        })).sort((a, b) => b.index - a.index || b.order - a.order);
        for (const part of parts) shadowText.insert(part.index, part.value);
      });
      Y.applyUpdate(doc, Y.mergeUpdates(patches), resolved);
    } finally { shadow.destroy(); }
    for (const [client, ranges] of drop) {
      for (const { clock, len } of ranges) this.rejected.push({ version: this.version, id: { client, clock }, length: len });
    }
    return 'resolved';
  }
}
