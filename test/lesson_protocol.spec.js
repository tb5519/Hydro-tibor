const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
function load(file, dependencies = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, file), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, Buffer, URL, Date, process, console,
        require: (name) => dependencies[name] ?? require(name) });
    return module.exports;
}
const protocol = load('packages/hydrooj/src/lib/lesson.ts');
const code = (expected) => (error) => error.code === expected;
const audio = Buffer.alloc(640, 127).toString('base64');
// Small baseline JPEG SOF fixture. The protocol bounds dimensions before decode.
function jpeg(width = 320, height = 240) {
    const bytes = Buffer.from([255, 216, 255, 192, 0, 11, 8, height >> 8, height & 255, width >> 8, width & 255,
        1, 1, 17, 0, 255, 217]);
    return `data:image/jpeg;base64,${bytes.toString('base64')}`;
}
const tab = (uid) => `lesson-tab-${uid}-testing`;
describe('lesson media protocol', () => {
    it('accepts only bounded JPEG and exact μ-law audio without client routing fields', () => {
        protocol.validateLessonMessage({ type: 'join', lessonId: 'lesson-testing', tabId: 'tab-testing' });
        protocol.validateLessonMessage({ type: 'video', lessonId: 'lesson-testing', seq: 0, data: jpeg() });
        protocol.validateLessonMessage({ type: 'audio', lessonId: 'lesson-testing', seq: 0, data: audio });
        for (const value of [
            null, [], { type: 'unknown' }, { type: 'join', lessonId: 'x', tabId: 'tab-testing' },
            { type: 'video', lessonId: 'lesson-testing', seq: -1, data: jpeg() },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: jpeg(641, 1) },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: jpeg(1, 481) },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: 'data:image/svg+xml;base64,PHN2Zz4=' },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: `${jpeg()}AAAA` },
            { type: 'video', lessonId: 'lesson-testing', seq: 1, data: `data:image/jpeg;base64,${Buffer.alloc(30000).toString('base64')}` },
            { type: 'audio', lessonId: 'lesson-testing', seq: 1, data: Buffer.alloc(641).toString('base64') },
            { type: 'audio', lessonId: 'lesson-testing', seq: 1, data: audio, uid: 11 },
            { type: 'pulse', lessonId: 'lesson-testing' },
        ]) assert.throws(() => protocol.validateLessonMessage(value), code('INVALID_MESSAGE'));
    });
    it('uses independent camera, audio and control budgets and bounds the camera byte rate', () => {
        const limiter = new protocol.LessonRateLimit(); let videos = 0; let audios = 0;
        for (let i = 0; i < 50; i++) if (limiter.accept('video', 32768, 100000)) videos++;
        for (let i = 0; i < 50; i++) if (limiter.accept('audio', 856, 100000)) audios++;
        assert.equal(videos, 2); assert.equal(audios, 8);
        assert.equal(limiter.accept('pulse', 0, 100000), true);
        assert.equal(limiter.accept('video', 32768, 100500), true);
        assert.equal(limiter.accept('audio', 856, 100040), true);
    });
});
