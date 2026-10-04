// Community data is separate from the author's SB3. The authenticated parent
// owns storage; this opaque iframe only exchanges values for original targets.
const equal = (a, b) => {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch (error) { return false; }
};
const copy = value => Array.isArray(value) ? value.slice() : value;
const scalar = value => (typeof value === 'string' && value.length <= 8192) || typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value));
const validValue = (kind, value) => kind === 'list' ?
    Array.isArray(value) && value.length <= 10000 && value.every(scalar) : kind === 'variable' && scalar(value);
const withinBytes = values => {
    try { return new TextEncoder().encode(JSON.stringify(values)).byteLength <= 512 * 1024; }
    catch (error) { return false; }
};
const validEnvelope = message => {
    if (!message || !Number.isSafeInteger(message.revision) || message.revision < 0 ||
        !Array.isArray(message.values) || message.values.length > 1000) return false;
    const keys = new Set();
    for (const entry of message.values) {
        if (!entry || typeof entry.key !== 'string' || !entry.key || entry.key.length > 512 || keys.has(entry.key) ||
            !validValue(entry.kind, entry.value)) return false;
        keys.add(entry.key);
    }
    return withinBytes(message.values);
};

// Preserve local additions made while an earlier save was in flight, including
// additions from another player present in that save's acknowledgement.
const rebase = (before, local, remote) => {
    if (equal(before, local)) return copy(remote);
    if (!Array.isArray(before) || !Array.isArray(local) || !Array.isArray(remote)) return copy(local);
    if (equal(remote, before)) return copy(local);
    // Match the server's contiguous-insertion merge for ranked lists, including
    // entries inserted between existing scores while another save is in flight.
    const added = local.length - before.length;
    if (added > 0 && remote.length >= before.length) {
        let insertion = 0;
        while (insertion < before.length && equal(before[insertion], local[insertion])) insertion++;
        const onlyInsertion = before.slice(insertion).every((value, offset) => equal(value, local[insertion + added + offset]));
        if (onlyInsertion) {
            const positions = [];
            let next = 0;
            for (let index = 0; index < remote.length && next < before.length; index++) {
                if (equal(remote[index], before[next])) { positions.push(index); next++; }
            }
            if (next === before.length) {
                const at = insertion === before.length ? remote.length : positions[insertion];
                return remote.slice(0, at).concat(local.slice(insertion, insertion + added), remote.slice(at));
            }
        }
    }
    return copy(local);
};

export const createCommunityStateBridge = (vm, initial, send, env = window) => {
    if (!validEnvelope(initial)) return null;
    const variables = new Map();
    for (const target of vm.runtime.targets || []) {
        if (!target.isStage && !target.isOriginal) continue;
        for (const variable of Object.values(target.variables || {})) {
            if (variable.type !== '' && variable.type !== 'list') continue;
            const kind = variable.type === 'list' ? 'list' : 'variable';
            if (!validValue(kind, variable.value)) continue;
            const key = JSON.stringify([target.isStage ? 'stage' : 'sprite', target.isStage ? '' : target.getName(), variable.id]);
            variables.set(key, {variable, kind});
        }
    }
    const snapshot = () => new Map(Array.from(variables, ([key, {variable, kind}]) =>
        [key, {key, kind, value: copy(variable.value)}]));
    const write = (entry, value) => {
        entry.variable.value = copy(value);
        if (entry.kind === 'list') entry.variable._monitorUpToDate = false;
    };
    for (const value of initial.values) {
        const entry = variables.get(value.key);
        if (entry?.kind === value.kind && validValue(value.kind, value.value)) write(entry, value.value);
    }
    let baseline = snapshot();
    let pending = null;
    let revision = initial.revision;
    let sequence = 0;
    let lastPoll = Date.now();
    let disposed = false;
    let ending = false;
    let flushAfterAck = false;
    let invalidReported = false;
    const invalid = () => {
        if (!invalidReported) send('communityStateError', {message: '作品运行数据超出保存限制，本次变化尚未保存。'});
        invalidReported = true;
    };
    const flush = (force = false) => {
        if (disposed || pending) return;
        const current = snapshot();
        const changes = [];
        for (const [key, value] of current) {
            const before = baseline.get(key).value;
            if (equal(before, value.value)) continue;
            if (!value.key || value.key.length > 512 || !validValue(value.kind, value.value)) { invalid(); return; }
            changes.push({...value, before: copy(before)});
        }
        if (changes.length && (variables.size > 1000 || !withinBytes(changes))) { invalid(); return; }
        if (!changes.length && !force && (ending || (!invalidReported && Date.now() - lastPoll < 5000))) return;
        invalidReported = false;
        lastPoll = Date.now();
        pending = {id: ++sequence, snapshot: current};
        send('communityStateSync', {id: pending.id, baseRevision: revision, changes});
    };
    const receive = message => {
        if (disposed || !pending || !validEnvelope(message) || message.id !== pending.id || message.revision < revision) return;
        for (const remote of message.values) {
            const entry = variables.get(remote.key);
            if (entry?.kind !== remote.kind || !validValue(remote.kind, remote.value)) continue;
            const submitted = pending.snapshot.get(remote.key)?.value;
            // Never replace changes made by running scripts during the request.
            const merged = rebase(submitted, entry.variable.value, remote.value);
            if (!equal(entry.variable.value, merged)) write(entry, merged);
            baseline.set(remote.key, {...remote, value: copy(remote.value)});
        }
        // Unstored keys keep their project initial value as the baseline.
        revision = message.revision;
        pending = null;
        if (flushAfterAck) {
            flushAfterAck = false;
            // The last request was still running when the tab was hidden. Send
            // only any newer changes; an empty poll would keep an unload alive.
            flush();
        }
    };
    const tick = env.setInterval(() => flush(), 1000);
    const onStop = () => env.setTimeout(() => flush(), 0);
    const onVisibility = () => {
        if (env.document.visibilityState === 'visible') { ending = false; return; }
        onHide();
    };
    const onHide = () => {
        ending = true;
        if (pending) flushAfterAck = true;
        else flush(true);
    };
    vm.on('PROJECT_RUN_STOP', onStop);
    env.document.addEventListener('visibilitychange', onVisibility);
    env.addEventListener('pagehide', onHide);
    return {flush, receive, dispose () {
        disposed = true;
        env.clearInterval(tick);
        vm.removeListener('PROJECT_RUN_STOP', onStop);
        env.document.removeEventListener('visibilitychange', onVisibility);
        env.removeEventListener('pagehide', onHide);
    }};
};
