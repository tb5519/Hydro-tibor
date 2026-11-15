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
const { createTeacherCameraBeauty, normalizeBeautySettings, DEFAULT_TEACHER_BEAUTY, detectCameraEyes } = moduleValue.exports;
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
        uniform4f(location, x, y, z, w) { calls.uniforms[location.name] = [x, y, z, w]; },
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
    const processor = createTeacherCameraBeauty(canvas, message => { statuses.push(message); options.onStatus?.(message); }, options.processorOptions);
    const event = name => {
        const value = { prevented: false, preventDefault() { this.prevented = true; } };
        listeners.get(name)?.(value); return value;
    };
    return { processor, canvas, gl, calls, resources, deleted, contexts, statuses, listeners, options, event };
}

it('normalizes persisted slider values without trusting malformed or non-finite values', () => {
    assert.deepEqual(plain(DEFAULT_TEACHER_BEAUTY), { whitening: 20, smoothing: 25, eyeBrightening: 20 });
    for (const value of [undefined, null, false, '90', [], {}]) {
        assert.deepEqual(plain(normalizeBeautySettings(value)), { whitening: 20, smoothing: 25, eyeBrightening: 20 });
    }
    assert.deepEqual(plain(normalizeBeautySettings({ whitening: -10, smoothing: 170 })), { whitening: 0, smoothing: 100, eyeBrightening: 20 });
    assert.deepEqual(plain(normalizeBeautySettings({ whitening: 33.6, smoothing: 0 })), { whitening: 34, smoothing: 0, eyeBrightening: 20 });
    assert.deepEqual(plain(normalizeBeautySettings({ whitening: Infinity, smoothing: '100' })), { whitening: 20, smoothing: 25, eyeBrightening: 20 });
});

it('disabled effects and a camera awaiting metadata return the original frame without allocating GPU resources', () => {
    const f = fixture(); const source = frame();
    assert.equal(f.processor.process(source, { whitening: 0, smoothing: 0, eyeBrightening: 0 }), source);
    assert.equal(f.processor.process(frame(0, 0), DEFAULT_TEACHER_BEAUTY).videoWidth, 0);
    assert.equal(f.contexts.length, 0); assert.equal(f.resources.length, 0); assert.equal(f.calls.draws.length, 0);
    f.processor.dispose();
});

it('renders adjustable effects into the same bounded canvas that the preview and JPEG encoder can share', () => {
    const f = fixture(); const source = frame(1920, 1080);
    assert.equal(f.processor.process(source, { whitening: 20, smoothing: 25, eyeBrightening: 20 }), f.canvas);
    assert.equal(f.canvas.width, 960); assert.equal(f.canvas.height, 540);
    assert.equal(f.calls.uploads[0], source);
    assert.deepEqual(f.calls.viewports[0], [0, 0, 960, 540]);
    assert.equal(f.calls.draws[0].u_whitening, .2);
    assert(f.calls.draws[0].u_smoothing > .35 && f.calls.draws[0].u_smoothing < .5);
    assert.deepEqual(f.calls.draws[0].u_texel, [1 / 960, 1 / 540]);
    const allocated = f.resources.length;
    assert.equal(f.processor.process(source, { whitening: 80, smoothing: 60 }), f.canvas);
    assert.equal(f.resources.length, allocated, 'slider updates and new frames reuse their GPU resources');
    assert.equal(f.calls.draws[1].u_whitening, .8);
    assert(f.calls.draws[1].u_smoothing > f.calls.draws[0].u_smoothing);
    assert.equal(f.processor.process(source, { whitening: 0, smoothing: 0, eyeBrightening: 0 }), source);
    assert.equal(f.calls.draws.length, 2, 'turning both controls off immediately restores the raw path');
    f.processor.dispose();
});

it('the smoothing slider progressively widens its skin filter and increases strength without changing whitening', () => {
    const f = fixture(); const source = frame();
    for (const smoothing of [0, 25, 50, 75, 100]) {
        assert.equal(f.processor.process(source, { whitening: 20, smoothing }), f.canvas);
    }
    const profiles = f.calls.draws;
    assert.equal(profiles[0].u_smoothing, 0, 'zero disables smoothing independently of whitening');
    assert(profiles[1].u_smoothing > .35, 'the default smoothing setting is visible rather than only a tiny linear blend');
    for (let index = 1; index < profiles.length; index++) {
        assert(profiles[index].u_smoothing > profiles[index - 1].u_smoothing);
        assert(profiles[index].u_smoothing_radius[0] > profiles[index - 1].u_smoothing_radius[0]);
        assert(profiles[index].u_smoothing_radius[1] > profiles[index - 1].u_smoothing_radius[1]);
        assert(profiles[index].u_smoothing_range < profiles[index - 1].u_smoothing_range);
        assert.equal(profiles[index].u_whitening, .2);
    }
    assert(profiles.at(-1).u_smoothing > .9 && profiles.at(-1).u_smoothing < 1);
    assert(profiles.at(-1).u_smoothing_radius[1] >= 8, 'high smoothing reaches blemishes beyond the old two-pixel neighborhood');
    assert(profiles.every(profile => profile.u_smoothing_radius[0] > 0 && profile.u_smoothing_radius[1] <= 10));
    assert(f.resources.length < 10, 'slider changes keep the original GPU allocations');
    f.processor.dispose();
});

it('unavailable WebGL falls back to the camera and reports one useful status instead of failing each frame', () => {
    const f = fixture({ unavailable: true }); const source = frame();
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    assert.equal(f.statuses.length, 1); assert.match(f.statuses[0], /当前使用原画/);
    assert.equal(f.contexts.length, 2, 'only the initial WebGL and compatibility lookup are attempted');
    f.processor.process(source, { whitening: 0, smoothing: 0, eyeBrightening: 0 }); assert.equal(f.statuses.at(-1), '');
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
    assert(f.resources.length > allocated); assert.match(f.statuses.at(-1), /寻找双眼/);
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
    assert.equal(f.canvas.width, 960); assert.equal(f.canvas.height, 540);
    assert(f.resources.length > allocated); assert.equal(f.calls.draws.at(-1).u_whitening, .4);
    assert(f.calls.draws.at(-1).u_smoothing > .5 && f.calls.draws.at(-1).u_smoothing < .8);
    next.dispose();
    assert.equal(f.options.lost, undefined); assert.equal(f.listeners.size, 0);
    assert.deepEqual(new Set(f.deleted), new Set(f.resources));
});

it('an error in the status UI never prevents fallback camera frames', () => {
    const f = fixture({ unavailable: true, onStatus() { throw new Error('Status UI unavailable'); } });
    const source = frame(); assert.equal(f.processor.process(source, DEFAULT_TEACHER_BEAUTY), source);
    f.processor.dispose();
});

function facePixels({ closed = false, oneEye = false, multiFace = false, lashes = false } = {}) {
    const width = 160; const height = 90;
    const data = new Uint8ClampedArray(width * height * 4);
    const paint = (x, y, r, g, b) => { const i = (y * width + x) * 4; data.set([r, g, b, 255], i); };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) paint(x, y, 130, 170, 210);
    const face = (cx, cy, rx, ry) => {
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
            if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1) paint(x, y, 192, 142, 115);
        }
        for (const [eyeIndex, ex] of [cx - rx * .43, cx + rx * .43].entries()) {
            if (oneEye && eyeIndex) continue;
            const eyeY = Math.round(cy - ry * .30); const eyeX = Math.round(ex);
            if (!closed) for (let y = eyeY - 2; y <= eyeY + 2; y++) for (let x = eyeX - 5; x <= eyeX + 5; x++) paint(x, y, 210, 215, 215);
            if (lashes && !closed) for (let x = eyeX - 5; x <= eyeX + 5; x++) paint(x, eyeY - 2, 28, 30, 32);
            for (let y = eyeY - (closed ? 0 : 2); y <= eyeY + (closed ? 0 : 2); y++) for (let x = eyeX - (closed ? 4 : 1); x <= eyeX + (closed ? 4 : 1); x++) paint(x, y, 28, 30, 32);
        }
    };
    if (multiFace) { face(42, 47, 25, 35); face(118, 47, 25, 35); }
    else face(80, 47, 33, 39);
    return { data, width, height };
}

it('locates observed paired sclera and dark pupils rather than lighting a fixed face proportion', () => {
    const image = facePixels();
    const eyes = plain(detectCameraEyes(image.data, image.width, image.height));
    assert.equal(eyes.length, 2);
    assert(Math.abs(eyes[0].x * image.width - 66) <= 2);
    assert(Math.abs(eyes[1].x * image.width - 94) <= 2);
    assert(eyes.every(eye => Math.abs(eye.y * image.height - 35) <= 2));
    assert(eyes.every(eye => eye.radiusX > 0 && eye.radiusX < .06 && eye.radiusY > 0 && eye.radiusY < .06));
    const withLashes = facePixels({ lashes: true });
    assert.equal(detectCameraEyes(withLashes.data, withLashes.width, withLashes.height).length, 2);
    for (const options of [{ closed: true }, { oneEye: true }, { multiFace: true }]) {
        const missing = facePixels(options);
        assert.deepEqual(plain(detectCameraEyes(missing.data, missing.width, missing.height)), []);
    }
    assert.deepEqual(plain(detectCameraEyes(new Uint8Array(0), 160, 90)), []);
    assert.deepEqual(plain(detectCameraEyes(image.data, 1920, 1080)), []);
});

it('only enables the eye shader with fresh paired detections and converts top-origin regions to GPU coordinates', () => {
    let now = 1000; let image = facePixels(); let reads = 0; let draws = 0;
    const analysis = { width: 0, height: 0, getContext: () => ({
        drawImage() { draws++; }, getImageData() { reads++; return { data: image.data }; },
    }) };
    const f = fixture({ processorOptions: { now: () => now, createAnalysisCanvas: () => analysis } });
    const source = frame(160, 90); source.srcObject = {}; source.currentTime = 1;
    const settings = { whitening: 0, smoothing: 0, eyeBrightening: 80 };
    assert.equal(f.processor.process(source, settings), f.canvas);
    const expected = plain(detectCameraEyes(image.data, 160, 90));
    assert.equal(f.calls.draws[0].u_eye_brightening, .8);
    assert.deepEqual(f.calls.draws[0].u_eye_left, [expected[0].x, 1 - expected[0].y, expected[0].radiusX, expected[0].radiusY]);
    assert.deepEqual(f.calls.draws[0].u_eye_right, [expected[1].x, 1 - expected[1].y, expected[1].radiusX, expected[1].radiusY]);
    now += 100; source.currentTime += .1; f.processor.process(source, settings);
    assert.equal(reads, 1, 'pixel analysis stays on a low-frequency cadence');
    image = facePixels({ closed: true }); now += 300; source.currentTime += .3;
    assert.equal(f.processor.process(source, settings), source, 'closed or unrecognized eyes do not brighten arbitrary skin');
    assert.equal(reads, 2); assert.match(f.statuses.at(-1), /寻找双眼/);
    image = facePixels(); now += 300; source.currentTime += .3; f.processor.process(source, settings);
    assert.equal(reads, 3);
    image = facePixels({ oneEye: true }); source.srcObject = {}; now += 10;
    assert.equal(f.processor.process(source, settings), source, 'a replacement camera must not inherit stale positions');
    assert.equal(reads, 4);
    image = facePixels(); source.videoWidth = 0; f.processor.process(source, settings); source.videoWidth = 160;
    assert.equal(f.processor.process(source, settings), f.canvas, 'metadata changes force a fresh detector read');
    assert.equal(reads, 5);
    f.processor.dispose(); assert.equal(analysis.width, 0); assert.equal(analysis.height, 0);
    assert.equal(draws, reads);
});

it('detector failures and missing eyes keep whitening working without enabling global eye exposure', () => {
    let now = 1000;
    const f = fixture({ processorOptions: { now: () => now, createAnalysisCanvas: () => ({
        width: 0, height: 0, getContext: () => ({ drawImage() { throw new Error('Pixel read unavailable'); } }),
    }) } });
    const source = frame();
    assert.equal(f.processor.process(source, { whitening: 30, smoothing: 20, eyeBrightening: 100 }), f.canvas);
    assert.equal(f.calls.draws[0].u_eye_brightening, 0);
    assert.equal(f.calls.draws[0].u_whitening, .3);
    now += 300;
    assert.equal(f.processor.process(source, { whitening: 0, smoothing: 0, eyeBrightening: 100 }), source);
    assert.equal(f.calls.draws.length, 1);
    f.processor.dispose();
});
