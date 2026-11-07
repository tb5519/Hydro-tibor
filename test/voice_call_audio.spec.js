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
