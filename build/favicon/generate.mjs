import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';

// Keep the glyphs as paths: output must not depend on installed fonts.
const here = path.dirname(fileURLToPath(import.meta.url));
const ui = path.resolve(here, '../../packages/ui-default');
const source = await readFile(path.join(here, 'favicon.svg'));
const render = (size) => Buffer.from(new Resvg(source, {
    fitTo: { mode: 'width', value: size },
    font: { loadSystemFonts: false },
}).render().asPng());

// PNG-compressed ICO entries work in all supported modern browsers and Windows.
function ico(sizes) {
    const frames = sizes.map((size) => ({ size, png: render(size) }));
    const header = Buffer.alloc(6 + frames.length * 16);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(frames.length, 4);
    let offset = header.length;
    frames.forEach(({ size, png }, index) => {
        const entry = 6 + index * 16;
        header.writeUInt8(size === 256 ? 0 : size, entry);
        header.writeUInt8(size === 256 ? 0 : size, entry + 1);
        header.writeUInt16LE(1, entry + 4);
        header.writeUInt16LE(32, entry + 6);
        header.writeUInt32LE(png.length, entry + 8);
        header.writeUInt32LE(offset, entry + 12);
        offset += png.length;
    });
    return Buffer.concat([header, ...frames.map(({ png }) => png)]);
}

const assets = new Map([
    ['favicon.svg', source],
    ['favicon.ico', ico([16, 32, 48, 64])],
    ['favicon-16x16.png', render(16)],
    ['favicon-32x32.png', render(32)],
    ['favicon-96x96.png', render(96)],
    ['apple-touch-icon-180x180.png', render(180)],
    ['android-chrome-192x192.png', render(192)],
]);
for (const directory of ['static', 'public']) {
    await mkdir(path.join(ui, directory), { recursive: true });
    for (const [name, bytes] of assets) await writeFile(path.join(ui, directory, name), bytes);
}

// A normal UI build copies static/ and regenerates this manifest automatically.
// Also keep an already-built local release consistent when only icons changed.
const manifestPath = path.join(ui, 'public/manifest.json');
try {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    for (const name of assets.keys()) manifest[name] = `/${name}`;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
} catch (error) {
    if (error.code !== 'ENOENT') throw error;
}
console.log(`Generated ${assets.size} OneByOne One icons in static/ and public/.`);
