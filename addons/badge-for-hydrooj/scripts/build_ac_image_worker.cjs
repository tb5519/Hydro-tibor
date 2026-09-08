// Run locally only: node addons/badge-for-hydrooj/scripts/build_ac_image_worker.cjs
const path = require('node:path');
const { build } = require('esbuild');

build({
    entryPoints: [path.join(__dirname, 'ac_image_worker.cjs')],
    outfile: path.join(__dirname, '../vendor/ac_image_worker.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node18',
    minify: true,
    legalComments: 'inline',
    banner: { js: '/* Locally generated. Includes pngjs 5.0.0 (MIT); see PNGJS-LICENSE.txt. Do not build on the server. */' },
}).catch((error) => { process.stderr.write(`${error}\n`); process.exitCode = 1; });
