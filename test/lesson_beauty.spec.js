const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const file = path.join(__dirname, '../packages/ui-default/components/lesson/beauty.ts');
const moduleValue = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
    module: moduleValue, exports: moduleValue.exports, Float32Array,
});
const { createTeacherCameraBeauty, normalizeBeautySettings, DEFAULT_TEACHER_BEAUTY } = moduleValue.exports;
const frame = (width = 1280, height = 720) => ({ videoWidth: width, videoHeight: height });
const plain = value => JSON.parse(JSON.stringify(value));

function fixture(options = {}) {
    let nextId = 0;
    const resources = []; const deleted = []; const contexts = []; const statuses = [];
    const listeners = new Map();
    const calls = { uploads: [], draws: [], uniforms: {}, viewports: [], errorChecks: 0 };
    const make = kind => { const resource = { kind, id: ++nextId }; resources.push(resource); return resource; };
    const gl = {
        VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
        ARRAY_BUFFER: 5, STATIC_DRAW: 6, FLOAT: 7, TEXTURE0: 8, TEXTURE_2D: 9,
        TEXTURE_WRAP_S: 10, TEXTURE_WRAP_T: 11, CLAMP_TO_EDGE: 12, TEXTURE_MIN_FILTER: 13,
        TEXTURE_MAG_FILTER: 14, LINEAR: 15, UNPACK_FLIP_Y_WEBGL: 16,
        RGBA: 17, UNSIGNED_BYTE: 18, TRIANGLE_STRIP: 19, NO_ERROR: 0,
        isContextLost: () => !!options.lost,
        getExtension(name) { return name === 'WEBGL_lose_context' ? { loseContext() { options.lost = true; } } : null; },
        createShader: () => make('shader'), shaderSource() {}, compileShader() {},
        getShaderParameter: () => options.compile !== false,
        createProgram: () => make('program'), attachShader() {}, linkProgram() {},
        getProgramParameter: () => options.link !== false,
        useProgram() {}, createBuffer: () => make('buffer'), createTexture: () => make('texture'),
        bindBuffer() {}, bufferData() {}, getAttribLocation: () => 0,
        enableVertexAttribArray() {}, vertexAttribPointer() {}, activeTexture() {}, bindTexture() {},
        texParameteri() {}, pixelStorei() {}, getUniformLocation: (_program, name) => ({ name }),
        uniform1i(location, value) { calls.uniforms[location.name] = value; },
        uniform1f(location, value) { calls.uniforms[location.name] = value; },
        uniform2f(location, x, y) { calls.uniforms[location.name] = [x, y]; },
        viewport(...args) { calls.viewports.push(args); },
        texImage2D(...args) { if (options.uploadFails) throw new Error('GPU upload failed'); calls.uploads.push(args.at(-1)); },
        drawArrays() { calls.draws.push(structuredClone(calls.uniforms)); },
        getError() { calls.errorChecks++; return options.errorAfterDraw || 0; },
        deleteShader(value) { deleted.push(value); }, deleteProgram(value) { deleted.push(value); },
        deleteTexture(value) { deleted.push(value); }, deleteBuffer(value) { deleted.push(value); },
    };
    const canvas = {
        width: 300, height: 150,
        getContext(name, attributes) { contexts.push({ name, attributes }); return options.unavailable ? null : gl; },
        addEventListener(name, handler) { listeners.set(name, handler); },
        removeEventListener(name, handler) { if (listeners.get(name) === handler) listeners.delete(name); },
    };
    const processor = createTeacherCameraBeauty(canvas, message => { statuses.push(message); options.onStatus?.(message); });
    const event = name => {
        const value = { prevented: false, preventDefault() { this.prevented = true; } };
        listeners.get(name)?.(value); return value;
    };
    return { processor, canvas, gl, calls, resources, deleted, contexts, statuses, listeners, options, event };
}

it('normalizes persisted slider values without trusting malformed or non-finite values', () => {
    assert.deepEqual(plain(DEFAULT_TEACHER_BEAUTY), { whitening: 20, smoothing: 25 });
    for (const value of [undefined, null, false, '90', [], {}]) {
        assert.deepEqual(plain(normalizeBeautySettings(value)), { whitening: 20, smoothing: 25 });
    }
    assert.deepEqual(plain(normalizeBeautySettings({ whitening: -10, smoothing: 170 })), { whitening: 0, smoothing: 100 });
    assert.deepEqual(plain(normalizeBeautySettings({ whitening: 33.6, smoothing: 0 })), { whitening: 34, smoothing: 0 });
    assert.deepEqual(plain(normalizeBeautySettings({ whitening: Infinity, smoothing: '100' })), { whitening: 20, smoothing: 25 });
});

it('disabled effects and a camera awaiting metadata return the original frame without allocating GPU resources', () => {
    const f = fixture(); const source = frame();
    assert.equal(f.processor.process(source, { whitening: 0, smoothing: 0 }), source);
    assert.equal(f.processor.process(frame(0, 0), DEFAULT_TEACHER_BEAUTY).videoWidth, 0);
    assert.equal(f.contexts.length, 0); assert.equal(f.resources.length, 0); assert.equal(f.calls.draws.length, 0);
    f.processor.dispose();
});

it('renders adjustable effects into the same bounded canvas that the preview and JPEG encoder can share', () => {
    const f = fixture(); const source = frame(1920, 1080);
    assert.equal(f.processor.process(source, { whitening: 20, smoothing: 25 }), f.canvas);
    assert.equal(f.canvas.width, 1280); assert.equal(f.canvas.height, 720);
    assert.equal(f.calls.uploads[0], source);
    assert.deepEqual(f.calls.viewports[0], [0, 0, 1280, 720]);
    assert.equal(f.calls.draws[0].u_whitening, .2); assert.equal(f.calls.draws[0].u_smoothing, .25);
    assert.deepEqual(f.calls.draws[0].u_texel, [1 / 1280, 1 / 720]);
    const allocated = f.resources.length;
    assert.equal(f.processor.process(source, { whitening: 80, smoothing: 60 }), f.canvas);
    assert.equal(f.resources.length, allocated, 'slider updates and new frames reuse their GPU resources');
    assert.equal(f.calls.draws[1].u_whitening, .8); assert.equal(f.calls.draws[1].u_smoothing, .6);
    assert.equal(f.processor.process(source, { whitening: 0, smoothing: 0 }), source);
    assert.equal(f.calls.draws.length, 2, 'turning both controls off immediately restores the raw path');
    f.processor.dispose();
});

it('unavailable WebGL falls back to the camera and reports one useful status instead of failing each frame', () => {
    const f = fixture({ unavailable: true }); const source = frame();
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    assert.equal(f.statuses.length, 1); assert.match(f.statuses[0], /当前使用原画/);
    assert.equal(f.contexts.length, 2, 'only the initial WebGL and compatibility lookup are attempted');
    f.processor.process(source, { whitening: 0, smoothing: 0 }); assert.equal(f.statuses.at(-1), '');
    f.processor.process(source, DEFAULT_TEACHER_BEAUTY); assert.match(f.statuses.at(-1), /当前使用原画/);
    f.processor.dispose();
});

it('shader and program failures release partial allocations and leave original camera delivery available', () => {
    for (const failure of [{ compile: false }, { link: false }]) {
        const f = fixture(failure); const source = frame();
        assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
        assert.deepEqual(new Set(f.deleted), new Set(f.resources));
        assert.equal(f.calls.draws.length, 0); assert.match(f.statuses[0], /美颜暂不可用/);
        f.processor.dispose(); assert.equal(f.deleted.length, f.resources.length);
    }
});

it('a GPU upload failure immediately releases its resources and keeps subsequent frames on the original camera', () => {
    const f = fixture({ uploadFails: true }); const source = frame();
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    assert.deepEqual(new Set(f.deleted), new Set(f.resources));
    const contexts = f.contexts.length;
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    assert.equal(f.contexts.length, contexts); assert.equal(f.statuses.length, 1);
    f.processor.dispose();
});

it('non-throwing GPU memory and draw errors immediately fall back to raw frames rather than a black canvas', () => {
    for (const errorAfterDraw of [1285, 1282]) {
        const f = fixture({ errorAfterDraw }); const source = frame();
        assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
        assert.equal(f.calls.errorChecks, 1); assert.equal(f.calls.draws.length, 1);
        assert.deepEqual(new Set(f.deleted), new Set(f.resources));
        assert.match(f.statuses[0], /当前使用原画/);
        assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
        assert.equal(f.calls.draws.length, 1, 'a failed renderer cannot replace subsequent camera pictures');
        assert.equal(f.calls.errorChecks, 1); f.processor.dispose();
    }
});

it('context loss uses raw video until restoration, then rebuilds the processing canvas without touching the source', () => {
    const f = fixture(); const source = frame();
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), f.canvas);
    const allocated = f.resources.length;
    assert.equal(f.event('webglcontextlost').prevented, true);
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    assert.equal(f.resources.length, allocated); assert.equal(f.deleted.length, allocated);
    f.event('webglcontextrestored');
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), f.canvas);
    assert(f.resources.length > allocated); assert.equal(f.statuses.at(-1), '');
    assert.equal(source.videoWidth, 1280); assert.equal(source.videoHeight, 720);
    f.processor.dispose(); assert.deepEqual(new Set(f.deleted), new Set(f.resources));
});

it('dispose is idempotent and late context events cannot recreate resources or replace the source', () => {
    const f = fixture(); const source = frame();
    f.processor.process(source, DEFAULT_TEACHER_BEAUTY); f.processor.dispose(); f.processor.dispose();
    assert.equal(f.listeners.size, 0); assert.deepEqual(new Set(f.deleted), new Set(f.resources));
    assert.equal(f.deleted.length, f.resources.length); assert.equal(f.canvas.width, 0); assert.equal(f.canvas.height, 0);
    const allocated = f.resources.length; const contexts = f.contexts.length;
    f.event('webglcontextlost'); f.event('webglcontextrestored');
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    assert.equal(f.resources.length, allocated); assert.equal(f.contexts.length, contexts);
});

it('a later class can create a new processor on the same canvas after the previous processor is disposed', () => {
    const f = fixture(); const source = frame();
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), f.canvas);
    f.processor.dispose();
    const allocated = f.resources.length;
    assert.equal(f.options.lost, undefined, 'disposing one class must not permanently lose the canvas context');
    const next = createTeacherCameraBeauty(f.canvas);
    assert.equal(next.process(source, { whitening: 40, smoothing: 50 }), f.canvas);
    assert.equal(f.canvas.width, 1280); assert.equal(f.canvas.height, 720);
    assert(f.resources.length > allocated); assert.equal(f.calls.draws.at(-1).u_whitening, .4);
    assert.equal(f.calls.draws.at(-1).u_smoothing, .5);
    next.dispose();
    assert.equal(f.options.lost, undefined); assert.equal(f.listeners.size, 0);
    assert.deepEqual(new Set(f.deleted), new Set(f.resources));
});

it('an error in the status UI never prevents fallback camera frames', () => {
    const f = fixture({ unavailable: true, onStatus() { throw new Error('Status UI unavailable'); } });
    const source = frame(); assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    f.processor.dispose();
});
