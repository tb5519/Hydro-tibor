const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vmModule = require('node:vm');
const { EventEmitter } = require('node:events');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const code = transformSync(fs.readFileSync(path.join(__dirname, '../build/scratch/community-state.js'), 'utf8'), {
    format: 'cjs', loader: 'js',
}).code;
const clean = (value) => JSON.parse(JSON.stringify(value));
const key = (target, id) => JSON.stringify([target === 'stage' ? 'stage' : 'sprite', target === 'stage' ? '' : target, id]);
const entry = (target, id, kind, value) => ({ key: key(target, id), kind, value });
const variable = (id, type, value) => ({ id, type, value, _monitorUpToDate: true });
const target = (name, variables, options = {}) => ({ getName: () => name, variables,
    isStage: name === 'stage', isOriginal: true, ...options });

function harness({ values = [], revision = 0, targets, initial } = {}) {
    let now = 0; let nextTimer = 0;
    const timers = new Map();
    const windowEvents = new EventEmitter();
    const documentEvents = new EventEmitter();
    const sent = [];
    const stageScore = variable('score', '', 0);
    const stageNames = variable('names', 'list', []);
    const machine = new EventEmitter();
    machine.runtime = { targets: targets || [target('stage', { score: stageScore, names: stageNames })] };
    const schedule = (callback, delay, repeat = false) => {
        const id = ++nextTimer;
        timers.set(id, { callback, at: now + delay, repeat, delay });
        return id;
    };
    const env = {
        setInterval: (callback, delay) => schedule(callback, delay, true),
        clearInterval: (id) => timers.delete(id),
        setTimeout: (callback, delay) => schedule(callback, delay),
        clearTimeout: (id) => timers.delete(id),
        addEventListener: (name, listener) => windowEvents.on(name, listener),
        removeEventListener: (name, listener) => windowEvents.removeListener(name, listener),
        document: {
            addEventListener: (name, listener) => documentEvents.on(name, listener),
            removeEventListener: (name, listener) => documentEvents.removeListener(name, listener),
        },
    };
    const module = { exports: {} };
    vmModule.runInNewContext(code, { module, exports: module.exports, window: env, TextEncoder,
        Date: class extends Date { static now() { return now; } } });
    const send = (type, data) => sent.push({ type, ...clean(data) });
    const bridge = module.exports.createCommunityStateBridge(machine,
        initial === undefined ? { values, revision } : initial, send, env);
    function advance(ms) {
        const end = now + ms;
        for (;;) {
            const due = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
            if (!due) break;
            const [id, timer] = due;
            now = timer.at;
            if (timer.repeat) timer.at += timer.delay;
            else timers.delete(id);
            timer.callback();
        }
        now = end;
    }
    return { bridge, sent, machine, stageScore, stageNames, advance, windowEvents, documentEvents, timers, document: env.document,
        ack(values, revision = 1, id = sent.at(-1)?.id) { bridge.receive({ id, revision, values }); },
    };
}

describe('isolated community variable and list state', () => {
    it('restores original stage and sprite data synchronously, separates same IDs by target, and excludes clones/broadcasts', () => {
        const stage = variable('same', '', 1);
        const sprite = variable('same', '', 2);
        const names = variable('names', 'list', ['project']);
        const clone = variable('same', '', 99);
        const broadcast = variable('message', 'broadcast_msg', 'hello');
        const h = harness({ targets: [target('stage', { stage }), target('小猫', { sprite, names, broadcast }),
            target('小猫', { clone }, { isOriginal: false })], revision: 3,
        values: [entry('stage', 'same', 'variable', 20), entry('小猫', 'same', 'variable', 30),
            entry('小猫', 'names', 'list', ['王五']), entry('小猫', 'message', 'variable', 'changed')] });
        assert.equal(stage.value, 20);
        assert.equal(sprite.value, 30);
        assert.deepEqual(names.value, ['王五']);
        assert.equal(names._monitorUpToDate, false);
        assert.equal(clone.value, 99);
        assert.equal(broadcast.value, 'hello');
        h.bridge.flush();
        assert.equal(h.sent.length, 0, 'restored data is the starting baseline, not an edit');
        clone.value = 100; broadcast.value = 'another'; sprite.value = 31;
        h.bridge.flush();
        assert.deepEqual(h.sent[0].changes, [{ ...entry('小猫', 'same', 'variable', 31), before: 30 }]);
        h.bridge.dispose();
    });

    it('saves a completed game at stop and manual list additions while the project remains stopped', () => {
        const h = harness();
        h.stageScore.value = 15;
        h.stageNames.value.push('王五');
        h.machine.emit('PROJECT_RUN_STOP');
        assert.equal(h.sent.length, 0, 'stop flush is deferred until final script updates finish');
        h.advance(0);
        assert.deepEqual(h.sent[0].changes, [
            { ...entry('stage', 'score', 'variable', 15), before: 0 },
            { ...entry('stage', 'names', 'list', ['王五']), before: [] },
        ]);
        h.ack(h.sent[0].changes.map(({ before, ...value }) => value));
        h.stageNames.value.push('李四');
        h.advance(1000);
        assert.deepEqual(h.sent[1].changes, [{ ...entry('stage', 'names', 'list', ['王五', '李四']), before: ['王五'] }]);
        h.bridge.dispose();
    });

    it('distinguishes a sprite literally named stage from the stage even with identical variable IDs', () => {
        const stage = variable('same', '', 1);
        const sprite = variable('same', '', 2);
        const spriteEntry = { key: '["sprite","stage","same"]', kind: 'variable', value: 30 };
        const h = harness({ targets: [target('stage', { stage }), target('stage', { sprite }, { isStage: false })],
            values: [entry('stage', 'same', 'variable', 20), spriteEntry] });
        assert.equal(stage.value, 20);
        assert.equal(sprite.value, 30);
        stage.value = 21;
        sprite.value = 31;
        h.bridge.flush();
        assert.deepEqual(h.sent[0].changes, [
            { ...entry('stage', 'same', 'variable', 21), before: 20 },
            { ...spriteEntry, value: 31, before: 30 },
        ]);
        h.bridge.dispose();
    });

    it('applies a remote acknowledgement without echoing it and sends only one request while pending', () => {
        const h = harness();
        h.stageNames.value.push('我的名字');
        h.bridge.flush();
        h.advance(4000);
        h.bridge.flush(true);
        assert.equal(h.sent.length, 1);
        h.ack([entry('stage', 'names', 'list', ['同学', '我的名字'])], 7);
        assert.deepEqual(clean(h.stageNames.value), ['同学', '我的名字']);
        assert.equal(h.stageNames._monitorUpToDate, false);
        h.bridge.flush();
        assert.equal(h.sent.length, 1, 'server merge must not be saved a second time');
        h.advance(1000);
        assert.equal(h.sent[1].baseRevision, 7);
        assert.deepEqual(h.sent[1].changes, [], 'the next request is only a poll');
        h.bridge.dispose();
    });

    it('rebases an in-flight local append on the server merge without losing either player', () => {
        const h = harness({ values: [entry('stage', 'names', 'list', ['最初'])] });
        h.stageNames.value.push('自己第一次');
        h.bridge.flush();
        h.stageNames.value.push('自己第二次');
        h.ack([entry('stage', 'names', 'list', ['最初', '同学', '自己第一次'])], 2);
        assert.deepEqual(clean(h.stageNames.value), ['最初', '同学', '自己第一次', '自己第二次']);
        h.bridge.flush();
        assert.deepEqual(h.sent[1].changes, [{ ...entry('stage', 'names', 'list', ['最初', '同学', '自己第一次', '自己第二次']),
            before: ['最初', '同学', '自己第一次'] }]);
        h.bridge.dispose();
    });

    it('rebases prepended leaderboard names while preserving the server additions', () => {
        const h = harness({ values: [entry('stage', 'names', 'list', ['原记录'])] });
        h.stageNames.value.unshift('第一次');
        h.bridge.flush();
        h.stageNames.value.unshift('第二次');
        h.ack([entry('stage', 'names', 'list', ['同学', '第一次', '原记录'])], 2);
        assert.deepEqual(clean(h.stageNames.value), ['同学', '第二次', '第一次', '原记录']);
        h.bridge.dispose();
    });

    it('rebases a new middle leaderboard insertion on an in-flight server merge without dropping either name or score', () => {
        const names = variable('names', 'list', ['高分', '低分']);
        const scores = variable('scores', 'list', [30, 10]);
        const h = harness({ targets: [target('stage', { names, scores })] });
        names.value.push('垫底'); scores.value.push(0);
        h.bridge.flush();
        names.value.splice(1, 0, '后来'); scores.value.splice(1, 0, 15);
        h.ack([entry('stage', 'names', 'list', ['高分', '同学', '低分', '垫底']),
            entry('stage', 'scores', 'list', [30, 20, 10, 0])]);
        assert.deepEqual(clean(names.value), ['高分', '同学', '后来', '低分', '垫底']);
        assert.deepEqual(clean(scores.value), [30, 20, 15, 10, 0]);
        h.bridge.flush();
        assert.deepEqual(h.sent[1].changes, [
            { ...entry('stage', 'names', 'list', ['高分', '同学', '后来', '低分', '垫底']), before: ['高分', '同学', '低分', '垫底'] },
            { ...entry('stage', 'scores', 'list', [30, 20, 15, 10, 0]), before: [30, 20, 10, 0] },
        ]);
        h.bridge.dispose();
    });

    it('does not overwrite a newer local scalar value with a save acknowledgement', () => {
        const h = harness();
        h.stageScore.value = 15;
        h.bridge.flush();
        h.stageScore.value = 20;
        h.ack([entry('stage', 'score', 'variable', 15)], 2);
        assert.equal(h.stageScore.value, 20);
        h.bridge.flush();
        assert.deepEqual(h.sent[1].changes, [{ ...entry('stage', 'score', 'variable', 20), before: 15 }]);
        h.bridge.dispose();
    });

    it('keeps newer local list replacement or clearing while an older request is in flight', () => {
        for (const newValue of [[], ['replacement']]) {
            const h = harness({ values: [entry('stage', 'names', 'list', ['before'])] });
            h.stageNames.value.push('submitted');
            h.bridge.flush();
            h.stageNames.value = newValue.slice();
            h.ack([entry('stage', 'names', 'list', ['before', 'other', 'submitted'])], 2);
            assert.deepEqual(clean(h.stageNames.value), newValue);
            h.bridge.flush();
            assert.deepEqual(h.sent[1].changes[0].value, newValue);
            h.bridge.dispose();
        }
    });

    it('polls idle state every five seconds and includes restored revision in requests', () => {
        const h = harness({ revision: 9 });
        h.advance(4999);
        assert.equal(h.sent.length, 0);
        h.advance(1);
        assert.deepEqual(h.sent[0], { type: 'communityStateSync', id: 1, baseRevision: 9, changes: [] });
        h.ack([entry('stage', 'score', 'variable', 50)], 10);
        assert.equal(h.stageScore.value, 50);
        h.advance(4999);
        assert.equal(h.sent.length, 1);
        h.advance(1);
        assert.equal(h.sent[1].baseRevision, 10);
        assert.deepEqual(h.sent[1].changes, []);
        h.bridge.dispose();
    });

    it('ignores acknowledgements for another request, an older revision, or unknown variables', () => {
        const h = harness({ revision: 4 });
        h.stageScore.value = 20;
        h.bridge.flush();
        h.ack([entry('stage', 'score', 'variable', 999)], 5, 77);
        h.ack([entry('stage', 'score', 'variable', 999)], 3);
        h.ack([entry('stage', 'score', 'variable', 20), entry('another target', 'new', 'variable', 1)], 5);
        assert.equal(h.stageScore.value, 20);
        assert.deepEqual(Object.keys(h.machine.runtime.targets[0].variables), ['score', 'names']);
        h.bridge.flush();
        assert.equal(h.sent.length, 1);
        h.bridge.dispose();
    });

    it('rejects malformed acknowledgement packets atomically and keeps the pending save for its valid reply', () => {
        for (const packet of [null, {}, { id: 1, revision: 1, values: [null] },
            { id: 1, revision: 1, values: [entry('stage', 'score', 'variable', 999), entry('stage', 'names', 'list', {})] },
            { id: 1, revision: 1, values: [entry('stage', 'score', 'variable', NaN)] },
            { id: 1, revision: 1, values: [entry('stage', 'names', 'list', [null])] },
            { id: 1, revision: -1, values: [] },
            { id: 1, revision: 1, values: [entry('stage', 'score', 'variable', 999), entry('stage', 'score', 'variable', 998)] }]) {
            const h = harness();
            h.stageScore.value = 20;
            h.bridge.flush();
            assert.doesNotThrow(() => h.bridge.receive(packet), JSON.stringify(packet));
            assert.equal(h.stageScore.value, 20, 'no partial apply from an invalid packet');
            h.ack([entry('stage', 'score', 'variable', 21)], 2);
            assert.equal(h.stageScore.value, 21, 'valid matching reply remains eligible');
            h.bridge.dispose();
        }
    });

    it('rejects malformed initial state and oversized envelopes without partially restoring or subscribing', () => {
        const invalid = [null, {}, { revision: -1, values: [] }, { revision: 0, values: [null] },
            { revision: 0, values: [entry('stage', 'score', 'bogus', 5)] },
            { revision: 0, values: [{ key: '', kind: 'variable', value: 5 }] },
            { revision: 0, values: [{ key: 'x'.repeat(513), kind: 'variable', value: 5 }] },
            { revision: 0, values: [entry('stage', 'score', 'variable', 5), entry('stage', 'score', 'variable', 6)] },
            { revision: 0, values: [entry('stage', 'score', 'variable', 'x'.repeat(8193))] },
            { revision: 0, values: [entry('stage', 'names', 'list', Array(10001).fill(0))] },
            { revision: 0, values: Array.from({ length: 1001 }, (_, i) => entry('stage', `x${i}`, 'variable', 0)) },
            { revision: 0, values: [entry('stage', 'names', 'list', Array(24).fill('中'.repeat(8192)))] },
        ];
        for (const initial of invalid) {
            const h = harness({ initial });
            assert.equal(h.bridge, null);
            assert.equal(h.stageScore.value, 0);
            assert.equal(h.machine.listenerCount('PROJECT_RUN_STOP'), 0);
            assert.equal(h.timers.size, 0);
        }
    });

    it('does not write unsupported runtime values, and resumes after their values become serializable', () => {
        const h = harness();
        h.stageScore.value = Infinity;
        h.stageNames.value.push({ unsafe: 'nested' });
        h.bridge.flush();
        assert.equal(h.sent[0].type, 'communityStateError');
        h.advance(4000);
        assert.equal(h.sent.length, 1, 'unchanged invalid data must not repeat warnings every second');
        h.stageScore.value = true;
        h.stageNames.value = ['张三', 12, false];
        h.bridge.flush();
        assert.equal(h.sent[1].type, 'communityStateSync');
        assert.equal(h.sent[1].changes.length, 2);
        h.bridge.dispose();
    });

    it('warns without dropping valid sibling changes when any outgoing data exceeds the storage limits', () => {
        for (const value of ['x'.repeat(8193), Array(10001).fill(0), Array(24).fill('中'.repeat(8192))]) {
            const h = harness();
            h.stageScore.value = 25;
            if (Array.isArray(value)) h.stageNames.value = value;
            else h.stageScore.value = value;
            h.bridge.flush();
            assert.equal(h.sent.length, 1);
            assert.equal(h.sent[0].type, 'communityStateError');
            h.stageScore.value = 25;
            h.stageNames.value = ['valid'];
            h.bridge.flush();
            assert.deepEqual(h.sent[1].changes, [
                { ...entry('stage', 'score', 'variable', 25), before: 0 },
                { ...entry('stage', 'names', 'list', ['valid']), before: [] },
            ]);
            h.bridge.dispose();
        }
        const variables = Object.fromEntries(Array.from({ length: 1001 }, (_, i) => [`v${i}`, variable(`v${i}`, '', 0)]));
        const h = harness({ targets: [target('stage', variables)] });
        Object.values(variables).forEach(value => { value.value = 1; });
        h.bridge.flush();
        assert.equal(h.sent[0].type, 'communityStateError');
        h.bridge.dispose();
    });

    it('flushes newer final changes immediately after an in-flight save is acknowledged and never loops idle polls after leaving', () => {
        const h = harness();
        h.stageNames.value.push('first');
        h.bridge.flush();
        h.stageNames.value.push('last');
        h.windowEvents.emit('pagehide');
        assert.equal(h.sent.length, 1);
        h.ack([entry('stage', 'names', 'list', ['first', 'peer'])], 1);
        assert.equal(h.sent.length, 2, 'last changes must not wait for another interval after pagehide');
        assert.deepEqual(h.sent[1].changes, [{ ...entry('stage', 'names', 'list', ['first', 'peer', 'last']), before: ['first', 'peer'] }]);
        h.ack([entry('stage', 'names', 'list', ['first', 'peer', 'last'])], 2);
        h.advance(20000);
        assert.equal(h.sent.length, 2, 'the last acknowledgement cannot create a polling loop');
        h.document.visibilityState = 'visible';
        h.documentEvents.emit('visibilitychange');
        h.advance(1000);
        assert.equal(h.sent.length, 3, 'returning to the tab restores normal polling');
        assert.deepEqual(h.sent[2].changes, []);
        h.bridge.dispose();
    });

    it('does not send an extra final request when the in-flight acknowledgement already covers all changes', () => {
        const h = harness();
        h.stageScore.value = 15;
        h.bridge.flush();
        h.document.visibilityState = 'hidden';
        h.documentEvents.emit('visibilitychange');
        h.ack([entry('stage', 'score', 'variable', 15)]);
        h.advance(10000);
        assert.equal(h.sent.length, 1);
        h.bridge.dispose();
    });

    it('flushes on leaving, removes listeners/timers on dispose, and ignores late replies or stop callbacks', () => {
        const h = harness();
        h.stageScore.value = 15;
        h.windowEvents.emit('pagehide');
        assert.equal(h.sent.length, 1);
        h.ack([entry('stage', 'score', 'variable', 15)]);
        h.documentEvents.emit('visibilitychange');
        assert.equal(h.sent.length, 2);
        h.machine.emit('PROJECT_RUN_STOP');
        h.bridge.dispose();
        h.bridge.dispose();
        h.stageScore.value = 30;
        h.advance(10000);
        h.documentEvents.emit('visibilitychange');
        h.windowEvents.emit('pagehide');
        h.bridge.flush(true);
        h.ack([entry('stage', 'score', 'variable', 999)], 3);
        assert.equal(h.stageScore.value, 30);
        assert.equal(h.sent.length, 2);
        assert.equal(h.machine.listenerCount('PROJECT_RUN_STOP'), 0);
        assert.equal(h.windowEvents.listenerCount('pagehide'), 0);
        assert.equal(h.documentEvents.listenerCount('visibilitychange'), 0);
        assert.equal(h.timers.size, 0);
    });
});
