// Built locally into ../vendor/ac_image_worker.cjs. The server needs no pngjs installation.
const { parentPort, workerData } = require('node:worker_threads');
const { PNG } = require('pngjs');

const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_PIXELS = 8 * 1024 * 1024;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function validate(buffer, size) {
    if (![384, 768].includes(size)) throw new Error('Unsupported display size');
    if (buffer.length < 33 || buffer.length > MAX_INPUT_BYTES || !buffer.subarray(0, 8).equals(SIGNATURE)
        || buffer.readUInt32BE(8) !== 13 || buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Invalid PNG');
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    if (!width || !height || width > 8192 || height > 8192 || width * height > MAX_PIXELS) throw new Error('PNG dimensions exceed limit');
    // pngjs 5's interlaced inflater is unbounded. Keep interlaced/animated PNGs
    // as originals instead of decoding them or silently dropping animation.
    if (buffer[28] !== 0 || ![1, 2, 4, 8, 16].includes(buffer[24])) throw new Error('Unsupported PNG encoding');
    let offset = 8;
    let chunks = 0;
    let ended = false;
    while (offset + 12 <= buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const kind = buffer.toString('ascii', offset + 4, offset + 8);
        if (++chunks > 2048 || offset + 12 + length > buffer.length || kind === 'acTL') throw new Error('Unsupported PNG chunks');
        offset += length + 12;
        if (kind === 'IEND') {
            ended = true;
            break;
        }
    }
    if (!ended || offset !== buffer.length) throw new Error('Incomplete PNG');
}

function resizePng(input, size) {
    validate(input, size);
    const source = PNG.sync.read(input, { checkCRC: true });
    const ratio = Math.min(1, size / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * ratio));
    const height = Math.max(1, Math.round(source.height * ratio));
    const data = Buffer.alloc(width * height * 4);
    const scaleX = source.width / width;
    const scaleY = source.height / height;
    // Area resampling in premultiplied alpha prevents dark fringes around
    // translucent artwork; never crop, upscale, or flatten onto a background.
    for (let y = 0; y < height; y++) {
        const top = y * scaleY;
        const bottom = (y + 1) * scaleY;
        for (let x = 0; x < width; x++) {
            const left = x * scaleX;
            const right = (x + 1) * scaleX;
            let red = 0;
            let green = 0;
            let blue = 0;
            let alpha = 0;
            for (let sy = Math.floor(top); sy < Math.min(source.height, Math.ceil(bottom)); sy++) {
                const yWeight = Math.min(bottom, sy + 1) - Math.max(top, sy);
                for (let sx = Math.floor(left); sx < Math.min(source.width, Math.ceil(right)); sx++) {
                    const weight = yWeight * (Math.min(right, sx + 1) - Math.max(left, sx));
                    const index = (sy * source.width + sx) * 4;
                    const weightedAlpha = source.data[index + 3] * weight;
                    alpha += weightedAlpha;
                    red += source.data[index] * weightedAlpha;
                    green += source.data[index + 1] * weightedAlpha;
                    blue += source.data[index + 2] * weightedAlpha;
                }
            }
            const target = (y * width + x) * 4;
            if (alpha > 0) {
                data[target] = Math.round(red / alpha);
                data[target + 1] = Math.round(green / alpha);
                data[target + 2] = Math.round(blue / alpha);
            }
            data[target + 3] = Math.round(alpha / (scaleX * scaleY));
        }
    }
    return PNG.sync.write({ width, height, data }, { colorType: 6, inputColorType: 6, deflateLevel: 6 });
}

try {
    const output = resizePng(Buffer.from(workerData.input), workerData.size);
    const bytes = Uint8Array.from(output);
    parentPort.postMessage({ ok: true, bytes }, [bytes.buffer]);
} catch (error) {
    parentPort.postMessage({ ok: false, error: error.message });
}
