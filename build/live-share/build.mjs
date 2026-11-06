// Local-only browser vendor build. Production uses the committed UI chunks.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const require = createRequire(path.join(root, 'package.json'));
const { build } = require('esbuild');
const target = path.join(root, 'packages/ui-default/components/live_share');
await build({ entryPoints: [path.join(here, 'entry.js')], outfile: path.join(target, 'vendor.js'),
  bundle: true, format: 'esm', platform: 'browser', target: 'es2020', minify: true,
  external: ['monaco-editor'], legalComments: 'eof',
  banner: { js: '/* Generated locally by build/live-share/build.mjs. See vendor.LICENSE.txt. */' } });
const licenses = [];
const visit = (dir) => {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!item.isDirectory() || item.name === '.bin') continue;
    const folder = path.join(dir, item.name);
    if (item.name.startsWith('@')) { visit(folder); continue; }
    const pkg = path.join(folder, 'package.json');
    if (!fs.existsSync(pkg)) continue;
    const meta = JSON.parse(fs.readFileSync(pkg, 'utf8'));
    const license = fs.readdirSync(folder).find((name) => /^licen[cs]e(?:\.|$)/i.test(name));
    if (license) licenses.push(`${meta.name}@${meta.version}\n${fs.readFileSync(path.join(folder, license), 'utf8')}`);
  }
};
visit(path.join(here, 'node_modules'));
fs.writeFileSync(path.join(target, 'vendor.LICENSE.txt'), licenses.sort().join('\n\n--------------------\n\n'));
console.log('Built browser-only live sharing dependencies. No server dependency install is required.');
