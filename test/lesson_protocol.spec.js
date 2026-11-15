const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}, globals = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, Buffer, URL, Date, process, console,
        require: (name) => dependencies[name] ?? require(name), ...globals });
    return module.exports;
}
const protocol = load('packages/hydrooj/src/lib/lesson.ts');
const code = (expected) => (error) => error.code === expected;
const audio = Buffer.alloc(640, 127).toString('base64');
// Small baseline JPEG SOF fixture. The protocol bounds dimensions before decode.
function jpeg(width = 320, height = 240, padding = 0) {
    const header = Buffer.from([255, 216, 255, 192, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255,
        1, 1, 17, 0, 255, 217]);
    const bytes = Buffer.concat([header.subarray(0, -2), Buffer.alloc(padding), header.subarray(-2)]);
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}
const tab = (uid) => `lesson-tab-${uid}-testing`;
describe('lesson media protocol', () => {
    it('keeps account notification controls small and rejects identity, routing and media fields', () => {
        const subscribe = { type: 'subscribe', expectedUid: Number.MAX_SAFE_INTEGER };
        protocol.validateLessonNotificationMessage(subscribe);
        protocol.validateLessonNotificationMessage({ type: 'pulse' });
        assert.equal(protocol.LESSON_NOTIFICATION_MAX_MESSAGE_BYTES, 1024);
        assert(Buffer.byteLength(JSON.stringify(subscribe)) < protocol.LESSON_NOTIFICATION_MAX_MESSAGE_BYTES);
        for (const payload of [null, [], {}, { type: 'subscribe' }, { type: 'subscribe', expectedUid: 1 },
            { type: 'subscribe', expectedUid: '10' }, { type: 'subscribe', expectedUid: Number.MAX_SAFE_INTEGER + 1 },
            { type: 'subscribe', expectedUid: 10, uid: 11 }, { type: 'subscribe', expectedUid: 10, lessonId: 'lesson-testing' },
            { type: 'pulse', expectedUid: 10 }, { type: 'pulse', data: 'x'.repeat(2048) },
            { type: 'video', lessonId: 'lesson-testing', seq: 0, data: jpeg() }]) {
            assert.throws(() => protocol.validateLessonNotificationMessage(payload), code('INVALID_MESSAGE'));
        }
    });
    it('accepts only bounded JPEG and exact μ-law audio without client routing fields', () => {
        protocol.validateLessonMessage({ type: 'join', lessonId: 'lesson-testing', tabId: 'tab-testing' });
        protocol.validateLessonMessage({ type: 'video', lessonId: 'lesson-testing', seq: 0, data: jpeg() });
        protocol.validateLessonMessage({ type: 'video', lessonId: 'lesson-testing', seq: 1, data: jpeg(1280, 720) });
        protocol.validateLessonMessage({ type: 'audio', lessonId: 'lesson-testing', seq: 0, data: audio });
        for (const value of [
            null, [], { type: 'unknown' }, { type: 'join', lessonId: 'x', tabId: 'tab-testing' },
            { type: 'video', lessonId: 'lesson-testing', seq: -1, data: jpeg() },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: jpeg(1281, 1) },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: jpeg(1, 721) },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: 'data:image/svg+xml;base64,PHN2Zz4=' },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: `${jpeg()}AAAA` },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: `data:image/jpeg;base64,${Buffer.alloc(30000).toString('base64')}` },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: jpeg(1280, 720, 200000) },
            { type: 'audio', lessonId: 'lesson-testing', seq: 1, data: Buffer.alloc(641).toString('base64') },
            { type: 'audio', lessonId: 'lesson-testing', seq: 1, data: audio, uid: 11 },
            { type: 'pulse', lessonId: 'lesson-testing' },
        ]) assert.throws(() => protocol.validateLessonMessage(value), code('INVALID_MESSAGE'));
    });
    it('fits a maximum-size 720p picture and its routing envelope inside the message limit', () => {
        const frame = { type: 'video', lessonId: 'a'.repeat(96), seq: Number.MAX_SAFE_INTEGER, data: jpeg(1280, 720, 196573) };
        assert.equal(frame.data.length, 262143);
        protocol.validateLessonMessage(frame);
        assert(Buffer.byteLength(JSON.stringify(frame)) < protocol.LESSON_MAX_MESSAGE_BYTES);
    });
    it('uses independent camera, audio and control budgets and bounds the camera byte rate', () => {
        const limiter = new protocol.LessonRateLimit(); let videos = 0; let audios = 0;
        for (let i = 0; i < 50; i++) if (limiter.accept('video', 262144, 100000)) videos++;
        for (let i = 0; i < 50; i++) if (limiter.accept('audio', 856, 100000)) audios++;
        assert.equal(videos, 2); assert.equal(audios, 8);
        assert.equal(limiter.accept('pulse', 0, 100000), true);
        assert.equal(limiter.accept('video', 262144, 100500), true);
        assert.equal(limiter.accept('audio', 856, 100040), true);
    });
    it('sustains a minute of 30 fps 720p-size frames within the camera byte budget', () => {
        const limiter = new protocol.LessonRateLimit();
        for (let frame = 0; frame < 30 * 60; frame++) {
            const now = 100000 + frame * 1000 / 30;
            assert.equal(limiter.accept('video', 96 * 1024, now), true, `Frame ${frame} must not be throttled`);
        }
    });
    it('drops a camera flood within bounded frame and byte bursts while retaining audio and control capacity', () => {
        const frameLimiter = new protocol.LessonRateLimit();
        for (let i = 0; i < 3; i++) assert.equal(frameLimiter.accept('video', 1024, 100000), true);
        assert.equal(frameLimiter.accept('video', 1024, 100000), false);

        const byteLimiter = new protocol.LessonRateLimit();
        let acceptedBytes = 0; let dropped = 0;
        for (let elapsed = 0; elapsed <= 10000; elapsed += 20) {
            if (byteLimiter.accept('video', 262144, 100000 + elapsed)) acceptedBytes += 262144;
            else dropped++;
        }
        assert(dropped > 0, 'A faster-than-budget camera must lose frames instead of accumulating a queue');
        assert(acceptedBytes <= 512 * 1024 + 10 * 3 * 1024 * 1024, 'Camera traffic stays within 3 MiB/s plus a bounded 512 KiB burst');
        for (let i = 0; i < 8; i++) assert.equal(byteLimiter.accept('audio', 856, 110000), true);
        assert.equal(byteLimiter.accept('pulse', 0, 110000), true);
    });
    it('bounds large camera IPC independently so congestion does not consume microphone or control capacity', () => {
        const pending = [];
        const handlers = load('packages/hydrooj/src/handler/lesson.ts', {
            '../lib/lesson': protocol,
            '../lib/live_share': { LiveShareError: class extends Error {} },
            '../model/lesson': {}, '../model/builtin': { PERM: {}, PRIV: {} },
            '../model/token': {}, '../model/workspace': {},
            '../service/bus': { parallel() { throw new Error('Cluster media must use live IPC'); } },
            '../service/server': { Handler: class {}, ConnectionHandler: class {}, subscribe: () => () => {} },
        }, { process: { env: { exec_mode: 'cluster_mode', name: 'hydro-test' }, connected: true,
            send(message, done) { pending.push({ message, done }); } } });
        const event = { uid: 10, lessonId: 'lesson-testing', sentAt: Date.now(),
            message: { type: 'video', lessonId: 'lesson-testing', seq: 1, data: jpeg(1280, 720, 196573) } };
        for (let i = 0; i < 20; i++) handlers.emitLesson(event);
        const videos = pending.length;
        assert(videos > 0 && videos < 20);
        assert(pending.reduce((bytes, item) => bytes + Buffer.byteLength(item.message.data.payload), 0) <= 2 * 1024 * 1024);
        handlers.emitLesson({ ...event, message: { type: 'audio', lessonId: 'lesson-testing', seq: 1, data: audio } });
        handlers.emitLesson({ ...event, message: { type: 'peer', online: true } });
        assert.equal(pending.length, videos + 2, 'A full camera budget leaves the existing audio/control allowance available');
        for (const item of pending) item.done();
        handlers.emitLesson(event);
        assert.equal(pending.length, videos + 3, 'Completed IPC frees its camera budget');
        pending.at(-1).done();
    });
});
