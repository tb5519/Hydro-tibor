import { Worker } from 'worker_threads';

/** Reuse the locally bundled AC resampler, without decoding untrusted PNGs in the server process. */
export function createAchievementThumbnail(input: Buffer) {
    return new Promise<Buffer>((resolve, reject) => {
        const worker = new Worker(require.resolve('../../../../addons/badge-for-hydrooj/vendor/ac_image_worker.cjs'), {
            workerData: { input, size: 384 }, execArgv: [],
            resourceLimits: { maxOldGenerationSizeMb: 128, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
        });
        let finished = false;
        let timer: ReturnType<typeof setTimeout>;
        const finish = (error?: Error, output?: Buffer) => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            void worker.terminate();
            if (error) reject(error);
            else resolve(output!);
        };
        timer = setTimeout(() => finish(new Error('Achievement image processing timed out')), 8000);
        worker.once('message', (message) => {
            if (!message?.ok || !message.bytes || message.bytes.byteLength > 4 * 1024 * 1024) {
                finish(new Error('Achievement image could not be resized'));
            } else finish(undefined, Buffer.from(message.bytes));
        });
        worker.once('error', (error) => finish(error));
        worker.once('exit', (code) => {
            if (!finished) finish(new Error(`Achievement image worker exited (${code})`));
        });
    });
}
