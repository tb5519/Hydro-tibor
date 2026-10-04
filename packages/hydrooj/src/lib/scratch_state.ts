import { ValidationError } from '../error';

export type ScratchStateScalar = string | number | boolean;
export interface ScratchStateValue {
    key: string; kind: 'variable' | 'list'; value: ScratchStateScalar | ScratchStateScalar[];
}
export interface ScratchStateChange extends ScratchStateValue { before: ScratchStateScalar | ScratchStateScalar[] }
export const SCRATCH_STATE_MAX_BYTES = 512 * 1024;
const MAX_VALUES = 1000;
const MAX_LIST_ITEMS = 10000;
const scalar = (value: unknown): value is ScratchStateScalar => typeof value === 'boolean'
    || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= 8192);
const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
function checkSize(value: unknown) {
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > SCRATCH_STATE_MAX_BYTES) {
        throw new ValidationError('changes', null, '作品运行数据不能超过 512 KB。');
    }
}
function validValue(kind: string, value: unknown) {
    return kind === 'variable' ? scalar(value)
        : kind === 'list' && Array.isArray(value) && value.length <= MAX_LIST_ITEMS && value.every(scalar);
}

export function validateScratchStateChanges(input: unknown): ScratchStateChange[] {
    let changes = input;
    if (typeof input === 'string') {
        if (Buffer.byteLength(input, 'utf8') > SCRATCH_STATE_MAX_BYTES) throw new ValidationError('changes');
        try { changes = JSON.parse(input); } catch { throw new ValidationError('changes'); }
    }
    if (!Array.isArray(changes) || changes.length > MAX_VALUES) throw new ValidationError('changes');
    checkSize(changes);
    const keys = new Set<string>();
    return changes.map((entry) => {
        if (!entry || typeof entry.key !== 'string' || !entry.key || entry.key.length > 512 || keys.has(entry.key)
            || !validValue(entry.kind, entry.value) || !validValue(entry.kind, entry.before)) throw new ValidationError('changes');
        keys.add(entry.key);
        // Keys are data in an array/Map, never object paths or MongoDB operators.
        return { key: entry.key, kind: entry.kind, before: entry.before, value: entry.value };
    });
}

// The common classroom case is two children adding a name and score at once.
// Merge that delta against the current lists, not a stale whole-list snapshot.
// Other Scratch list replacements (including deliberate clears) remain real
// program operations, with the most recently accepted replacement taking effect.
export function mergeScratchList(current: ScratchStateScalar[], before: ScratchStateScalar[], value: ScratchStateScalar[]) {
    if (same(current, before)) return value.slice();
    if (same(value, before)) return current.slice();
    const added = value.length - before.length;
    if (added > 0 && current.length >= before.length) {
        let insertion = 0;
        while (insertion < before.length && same(before[insertion], value[insertion])) insertion++;
        // Removing this one inserted run must restore the entire previous list.
        const onlyInsertion = before.slice(insertion).every((item, offset) => same(item, value[insertion + added + offset]));
        if (onlyInsertion) {
            const positions: number[] = [];
            let next = 0;
            for (let index = 0; index < current.length && next < before.length; index++) {
                if (same(current[index], before[next])) { positions.push(index); next++; }
            }
            if (next === before.length) {
                const at = insertion === before.length ? current.length : positions[insertion];
                return current.slice(0, at).concat(value.slice(insertion, insertion + added), current.slice(at));
            }
        }
    }
    return value.slice();
}

export function mergeScratchState(current: ScratchStateValue[], changes: ScratchStateChange[]): ScratchStateValue[] {
    const values = new Map(current.map((entry) => [entry.key, { ...entry }]));
    for (const change of changes) {
        if (same(change.before, change.value)) continue;
        const previous = values.get(change.key);
        const value = change.kind === 'list' && previous?.kind === 'list'
            ? mergeScratchList(previous.value as ScratchStateScalar[], change.before as ScratchStateScalar[], change.value as ScratchStateScalar[])
            : Array.isArray(change.value) ? change.value.slice() : change.value;
        if (!validValue(change.kind, value)) throw new ValidationError('changes', null, '作品运行数据超出保存限制。');
        values.set(change.key, { key: change.key, kind: change.kind, value });
    }
    const result = [...values.values()];
    if (result.length > MAX_VALUES) throw new ValidationError('changes');
    checkSize(result);
    return result;
}
