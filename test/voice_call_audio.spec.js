const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const file = path.join(__dirname, '../packages/ui-default/components/voice_call/audio.ts');
const moduleValue = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code,
    { module: moduleValue, exports: moduleValue.exports, btoa, atob, Uint8Array });
const { VOICE_WORKLET_SOURCE, encodeVoiceFrame, decodeVoiceFrame } = moduleValue.exports;
function processor(rate = 48000) {
    let Processor;
    const frames = [];
    vm.runInNewContext(VOICE_WORKLET_SOURCE, {
        AudioWorkletProcessor: class { constructor() { this.port = { postMessage: (value) => frames.push(value) }; } },
        registerProcessor(name, ctor) { assert.equal(name, 'onebyone-voice'); Processor = ctor; },
        sampleRate: rate, Uint8Array, Float32Array,
    });
    const instance = new Processor();
    return { instance, frames, message(data) { instance.port.onmessage({ data }); } };
}
it('640-byte frames round-trip exactly and reject malformed or oversized payloads', () => {
    const bytes = Uint8Array.from({ length: 640 }, (_, i) => i % 256);
    const encoded = encodeVoiceFrame(bytes);
    assert.equal(encoded.length, 856);
    assert.deepEqual(decodeVoiceFrame(encoded), bytes);
    for (const invalid of ['', encoded + '=', '!'.repeat(856), btoa('a'.repeat(639)), encoded.slice(0, -2) + 'AA']) assert.equal(decodeVoiceFrame(invalid), null);
});
for (const rate of [44100, 48000]) it(`real processor resamples ${rate} Hz to 25 exact 40 ms frames with stable sound`, () => {
    const p = processor(rate);
    p.message({ type: 'capture', enabled: true });
    for (let base = 0; base < rate; base += 128) {
        const input = Float32Array.from({ length: Math.min(128, rate - base) }, (_, i) => Math.sin((base + i) * Math.PI * 2 * 440 / rate) * 0.5);
        p.instance.process([[input]], [[new Float32Array(input.length)]]);
    }
    assert.equal(p.frames.length, 25);
    assert.ok(p.frames.every((f) => f.bytes.length === 640 && f.level > 0.3 && f.level < 0.4));
    const pcm = p.frames.flatMap((f) => [...f.bytes].map((v) => p.instance.decode(v)));
    assert.equal(pcm.length, 16000);
    let energy = 0; let error = 0;
    for (let i = 0; i < pcm.length; i++) {
        const expected = Math.sin((i + 0.5 - 8000 / rate) * Math.PI * 2 * 440 / 16000) * 0.5;
        energy += expected ** 2; error += (expected - pcm[i]) ** 2;
    }
    assert.ok(10 * Math.log10(energy / error) > 30, 'wideband speech codec signal-to-noise remains over 30 dB');
});
it('microphone stays silent before consent/active call and flushes partial frames on mute', () => {
    const p = processor();
    for (let i = 0; i < 30; i++) p.instance.process([[new Float32Array(128).fill(0.5)]], [[new Float32Array(128)]]);
    assert.equal(p.frames.length, 0);
    p.message({ type: 'capture', enabled: true });
    p.instance.process([[new Float32Array(128).fill(0.5)]], [[new Float32Array(128)]]);
    p.message({ type: 'capture', enabled: false });
    for (let i = 0; i < 30; i++) p.instance.process([[new Float32Array(128).fill(0.5)]], [[new Float32Array(128)]]);
    assert.equal(p.frames.length, 0); assert.equal(p.instance.frameIndex, 0);
});
it('playback starts after a short jitter buffer, stays bounded, and clears old speech', () => {
    const p = processor();
    const frame = new Uint8Array(640).fill(p.instance.encode(0.2));
    const output = new Float32Array(128);
    p.message({ type: 'play', bytes: frame }); p.instance.process([], [[output]]);
    assert.equal(output.some(Boolean), false);
    p.message({ type: 'play', bytes: frame }); p.instance.process([], [[output]]);
    assert.ok(output.every((v) => v > 0.19 && v < 0.21));
    for (let i = 0; i < 100; i++) p.message({ type: 'play', bytes: frame });
    assert.ok(p.instance.queue.length <= 6);
    p.message({ type: 'clear' }); p.instance.process([], [[output]]);
    assert.equal(output.some(Boolean), false); assert.equal(p.instance.queue.length, 0);
});

function audioFixture({ capture, resume, setupState } = {}) {
    const nodes = []; const errors = []; const states = []; const calls = []; const tracks = [];
    let captures = 0;
    class AudioContext {
        constructor() { this.destination = {}; this.audioWorklet = { async addModule() {} }; }
        resume() { calls.push('resume'); return resume ? resume(this) : Promise.resolve(); }
        async close() {}
        createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
    }
    class AudioWorkletNode {
        constructor() { this.port = { postMessage() {}, close() {} }; nodes.push(this); }
        connect() {}
        disconnect() {}
    }
    const window = { isSecureContext: true, AudioContext, AudioWorkletNode,
        setTimeout, clearTimeout, setInterval: () => 1, clearInterval() {} };
    const value = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(file, 'utf8'), { loader: 'ts', format: 'cjs' }).code, {
        module: value, exports: value.exports, window, AudioContext, AudioWorkletNode, Blob,
        URL: { createObjectURL: () => 'blob:voice-worklet', revokeObjectURL() {} },
        navigator: { mediaDevices: { async getUserMedia() {
            captures++; calls.push('capture');
            if (capture) return capture();
            const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
            tracks.push(track);
            return { getTracks: () => [track], getAudioTracks: () => [track] };
        } } },
        btoa, atob, Uint8Array,
    });
    const audio = new value.exports.VoiceAudio({ onFrame() {}, onError(error) { errors.push(error.message); },
        onSetupState(state) { states.push(state); setupState?.(state); } });
    return { audio, nodes, errors, states, calls, tracks, window, get captures() { return captures; } };
}

it('an error from a stopped audio processor cannot interrupt a later classroom microphone', async () => {
    const { audio, nodes, errors } = audioFixture();
    await audio.start(); const previous = nodes[0];
    audio.stop(); await audio.start();
    previous.onprocessorerror();
    assert.equal(errors.length, 0); assert.equal(audio.ready, true);
    nodes[1].onprocessorerror();
    assert.equal(errors.length, 1, 'the current processor still reports real device errors');
    audio.stop();
});

it('resuming an existing microphone has a bounded autoplay timeout and never captures another device', async () => {
    const f = audioFixture();
    await f.audio.start();
    const context = f.audio.context;
    f.window.setTimeout = (callback, delay) => setTimeout(callback, delay === 1800 ? 5 : delay);
    context.resume = () => new Promise(() => {});
    await assert.rejects(f.audio.start(), /重试设备/);
    assert.equal(f.audio.ready, true); assert.equal(f.audio.context, context);
    assert.equal(f.captures, 1); assert.equal(f.nodes.length, 1);
    context.resume = async () => {};
    await f.audio.start();
    assert.equal(f.captures, 1); assert.equal(f.nodes.length, 1);
    f.audio.stop();
});

it('reports microphone setup while initiating resume and capture synchronously in the click', async () => {
    const f = audioFixture();
    const starting = f.audio.start();
    assert.deepEqual(f.calls, ['resume', 'capture'], 'neither browser operation waits for a permission query or timer');
    assert.deepEqual(f.states, ['idle', 'microphone-pending']);
    await starting;
    assert.deepEqual(f.states, ['idle', 'microphone-pending', 'microphone-granted', 'ready']);
    assert.equal(f.audio.ready, true);
    await f.audio.start();
    assert.equal(f.captures, 1, 'resuming the current device does not request microphone permission again');
    assert.equal(f.states.at(-1), 'ready');
    f.audio.stop();
    assert.equal(f.states.at(-1), 'idle');
    assert.equal(f.tracks[0].stopped, true);
});

it('keeps microphone permission rejection distinct from browser playback blocking', async () => {
    const denied = Object.assign(new Error('permission denied'), { name: 'NotAllowedError' });
    const f = audioFixture({ capture: () => Promise.reject(denied) });
    await assert.rejects(f.audio.start(), (error) => error === denied);
    assert.deepEqual(f.states, ['idle', 'microphone-pending', 'idle']);
    assert.equal(f.audio.ready, false);
});

for (const synchronous of [false, true]) it(`labels a ${synchronous ? 'synchronous' : 'rejected'} audio resume failure as playback blocking`, async () => {
    const denied = Object.assign(new Error('autoplay denied'), { name: 'NotAllowedError' });
    const f = audioFixture({ resume: () => { if (synchronous) throw denied; return Promise.reject(denied); } });
    await assert.rejects(f.audio.start(), (error) => error.name === 'VoicePlaybackBlockedError' && /开启声音/.test(error.message));
    assert.deepEqual(f.states, ['idle', 'microphone-pending', 'microphone-granted', 'idle']);
    assert.equal(f.captures, 1);
    assert.equal(f.tracks[0].stopped, true, 'a failed setup does not leave a microphone running');
    assert.equal(f.audio.ready, false);
});

it('reports a bounded playback timeout after microphone grant without mistaking it for microphone denial', async () => {
    const f = audioFixture({ resume: () => new Promise(() => {}) });
    f.window.setTimeout = (callback, delay) => setTimeout(callback, delay === 1800 ? 5 : delay);
    await assert.rejects(f.audio.start(), (error) => error.name === 'VoicePlaybackBlockedError');
    assert.deepEqual(f.states, ['idle', 'microphone-pending', 'microphone-granted', 'idle']);
    assert.equal(f.tracks[0].stopped, true);
});

it('cancels a still-pending permission request and stops a late stream without stale setup callbacks', async () => {
    let resolveCapture;
    const track = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
    const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
    const f = audioFixture({ capture: () => new Promise((resolve) => { resolveCapture = resolve; }) });
    const starting = f.audio.start();
    f.audio.stop();
    const stoppedStates = f.states.slice();
    resolveCapture(stream); await starting;
    assert.equal(track.stopped, true);
    assert.equal(f.nodes.length, 0);
    assert.equal(f.audio.ready, false);
    assert.deepEqual(f.states, stoppedStates, 'a late permission response cannot reopen the guide or mark the call ready');
});

it('an old permission response cannot overwrite setup for a later microphone', async () => {
    let resolveFirst;
    let captures = 0;
    const oldTrack = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
    const newTrack = { stopped: false, stop() { this.stopped = true; }, addEventListener() {} };
    const stream = (track) => ({ getTracks: () => [track], getAudioTracks: () => [track] });
    const f = audioFixture({ capture: () => ++captures === 1 ? new Promise((resolve) => { resolveFirst = resolve; }) : Promise.resolve(stream(newTrack)) });
    const first = f.audio.start();
    f.audio.stop(); await f.audio.start();
    const readyStates = f.states.slice();
    resolveFirst(stream(oldTrack)); await first;
    assert.equal(oldTrack.stopped, true); assert.equal(newTrack.stopped, false);
    assert.equal(f.audio.ready, true); assert.equal(f.nodes.length, 1);
    assert.deepEqual(f.states, readyStates);
    f.audio.stop();
});

it('a stale resume response never reports ready after the device has been stopped', async () => {
    const f = audioFixture();
    await f.audio.start();
    let resolveResume;
    f.audio.context.resume = () => new Promise((resolve) => { resolveResume = resolve; });
    const resuming = f.audio.start();
    f.audio.stop(); const stoppedStates = f.states.slice();
    resolveResume(); await resuming;
    assert.deepEqual(f.states, stoppedStates);
    assert.equal(f.audio.ready, false);
});
