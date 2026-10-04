const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { build } = require('esbuild');
const patchMonitor = require('../build/scratch/patch-monitor.cjs');

const root = path.resolve(__dirname, '..');
const candidates = [process.env.SCRATCH_BUILD_DIR, path.join(root, '.cache/scratch-player-build'),
    path.join(os.homedir(), 'Desktop/hydro-tibor/.cache/scratch-player-build')].filter(Boolean);
const workspace = candidates.find((dir) => fs.existsSync(path.join(dir, 'src/components/monitor/default-monitor.jsx')));
let playwright;
for (const location of [process.env.SCRATCH_PLAYWRIGHT_MODULE, 'playwright',
    path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')].filter(Boolean)) {
    try { playwright = require(location); break; } catch { /* Optional native layout test runtime. */ }
}
const chrome = process.env.SCRATCH_CHROMIUM_PATH || path.join(os.homedir(),
    'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium');
const available = workspace && playwright && fs.existsSync(chrome);
let browser; let compiled; let css; let classes;

before(async () => {
    if (!available) return;
    const upstream = (name) => require(path.join(workspace, 'node_modules', name));
    const filename = path.join(workspace, 'src/components/monitor/monitor.css');
    // Use the pinned monitor stylesheet and the same PostCSS steps as its build.
    const result = await upstream('postcss')([upstream('postcss-import'), upstream('postcss-simple-vars')])
        .process(fs.readFileSync(filename, 'utf8'), { from: filename });
    classes = {};
    result.root.walkRules((rule) => {
        rule.selector = rule.selector.replace(/\.([a-z][a-z-]*)/g, (_, name) => {
            const value = `monitor_${name}_fixture`;
            classes[name.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase())] = value;
            return `.${value}`;
        });
    });
    css = result.root.toString();
    compiled = (await build({
        stdin: { resolveDir: workspace, loader: 'jsx', contents: `
            import React from 'react';
            import ReactDOM from 'react-dom';
            import DefaultMonitor from './src/components/monitor/default-monitor.jsx';
            import SliderMonitor from './src/components/monitor/slider-monitor.jsx';
            import install from ${JSON.stringify(path.join(root, 'build/scratch/player-monitor-layout.js'))};
            window.installMonitor = install;
            window.renderMonitor = (element, label, value, slider) => ReactDOM.render(
                React.createElement(slider ? SliderMonitor : DefaultMonitor, {
                    label, value, categoryColor: {background: '#ff8c1a', text: '#fff'}, onSliderUpdate() {}
                }), element);
        ` }, bundle: true, write: false, platform: 'browser', format: 'iife',
        plugins: [{ name: 'native-monitor-css', setup(builder) {
            builder.onLoad({ filter: /monitor\.css$/ }, () => ({ contents: `export default ${JSON.stringify(classes)}`, loader: 'js' }));
        } }],
    })).outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath: chrome, headless: true });
});
after(async () => { await browser?.close(); });
const test = (name, run) => it(name, { skip: !available && 'Set SCRATCH_BUILD_DIR and local Playwright/Chromium paths for native monitor layout tests' }, run);

async function harness({ fixed = true, mode = 'player', scale = 1, x = 375, label = '击败骷髅', slider = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    const integrationCSS = fs.readFileSync(path.join(root, 'build/scratch/editor.ejs'), 'utf8').match(/<style>([\s\S]*?)<\/style>/)[1];
    await page.setContent(`<!doctype html><html data-onebyone-mode="${mode}"><head><style>
        *{box-sizing:border-box}html{font-size:16px}body{margin:0}
        .monitor-overlay{position:relative;width:480px;height:360px;overflow:hidden;transform-origin:top left;transform:scale(${scale})}
        ${css}${integrationCSS}
        </style></head><body><div class="monitor-overlay"><div id="scalar" class="${classes.monitorContainer}" style="left:${x}px;top:5px"></div></div></body></html>`);
    await page.addScriptTag({ content: compiled });
    await page.evaluate(({ fixed, mode, label, slider }) => {
        const element = document.querySelector('#scalar');
        window.renderMonitor(element, label, 0, slider);
        if (fixed) window.cleanupMonitor = window.installMonitor(element, { mode: slider ? 'slider' : 'default', draggable: mode === 'editor' });
    }, { fixed, mode, label, slider });
    return page;
}
async function measure(page) {
    return page.evaluate(() => {
        const element = document.querySelector('#scalar');
        const label = element.querySelector('[class*="monitor_label_"]');
        const range = document.createRange();
        range.selectNodeContents(label);
        const lineTops = [...new Set([...range.getClientRects()].map((rect) => rect.top.toFixed(3)))];
        const rect = element.getBoundingClientRect();
        const stage = element.closest('.monitor-overlay').getBoundingClientRect();
        return { lines: lineTops.length, left: element.offsetLeft, width: element.offsetWidth,
            right: rect.right, stageRight: stage.right, height: element.offsetHeight,
            fixed: element.hasAttribute('data-onebyone-scalar-monitor'), text: label.textContent };
    });
}

test('reproduces the Chinese label wrap when a saved monitor is mounted near the stage right edge', async () => {
    const page = await harness({ fixed: false });
    try { const result = await measure(page); assert(result.lines > 1, `The unpatched saved-position monitor must reproduce the reported wrap: ${JSON.stringify(result)}`); }
    finally { await page.close(); }
});

test('keeps native Chinese scalar and slider labels on one line inside the stage at small, normal and fullscreen scales', async () => {
    for (const scale of [0.625, 1, 2.75]) {
        for (const slider of [false, true]) {
            const page = await harness({ scale, slider });
            try {
                const result = await measure(page);
                assert.equal(result.lines, 1);
                assert.equal(result.text, '击败骷髅');
                assert(result.right <= result.stageRight + 0.01, JSON.stringify(result));
                assert(result.left >= 0);
            } finally { await page.close(); }
        }
    }
});

test('reflows a growing value and returns to the saved x position when space becomes available', async () => {
    const page = await harness({ x: 320 });
    try {
        assert.equal((await measure(page)).left, 320);
        await page.evaluate(() => window.renderMonitor(document.querySelector('#scalar'), '击败骷髅', 123456789012345, false));
        await page.waitForFunction(() => {
            const element = document.querySelector('#scalar');
            return element.offsetLeft + element.offsetWidth <= 480 && element.offsetLeft < 320;
        });
        assert.equal((await measure(page)).lines, 1);
        await page.evaluate(() => window.renderMonitor(document.querySelector('#scalar'), '击败骷髅', 0, false));
        await page.waitForFunction(() => document.querySelector('#scalar').offsetLeft === 320);
        await page.evaluate(() => { document.querySelector('.monitor-overlay').style.width = '380px'; });
        await page.waitForFunction(() => {
            const element = document.querySelector('#scalar');
            return element.offsetLeft + element.offsetWidth <= 380;
        });
        const result = await measure(page);
        assert.equal(result.lines, 1);
        assert(result.right <= result.stageRight + 0.01);
    } finally { await page.close(); }
});

test('does not alter editor monitors or list dimensions, and disconnects observers on unmount', async () => {
    const editor = await harness({ mode: 'editor' });
    const player = await harness();
    try {
        const original = await measure(editor);
        assert.equal(original.fixed, false);
        assert.equal(original.left, 375);
        const result = await player.evaluate(() => {
            const list = document.createElement('div');
            list.style.cssText = 'position:absolute;left:365px;width:100px;height:180px';
            document.querySelector('.monitor-overlay').append(list);
            const stopList = window.installMonitor(list, { mode: 'list', draggable: false });
            const listResult = { width: list.offsetWidth, height: list.offsetHeight, left: list.offsetLeft,
                fixed: list.hasAttribute('data-onebyone-scalar-monitor') };
            stopList();
            const scalar = document.querySelector('#scalar');
            window.cleanupMonitor();
            return { list: listResult, stopped: !scalar.hasAttribute('data-onebyone-scalar-monitor') };
        });
        assert.deepEqual(result.list, { width: 100, height: 180, left: 365, fixed: false });
        assert.equal(result.stopped, true);
    } finally { await editor.close(); await player.close(); }
});

it('patches exactly the pinned monitor lifecycle and fails closed if upstream changes', { skip: !workspace }, () => {
    const { execFileSync } = require('node:child_process');
    const upstream = JSON.parse(fs.readFileSync(path.join(root, 'build/scratch/upstream.json'), 'utf8'));
    const source = execFileSync('git', ['show', `${upstream.commit}:src/containers/monitor.jsx`], { cwd: workspace, encoding: 'utf8' });
    const output = patchMonitor(source);
    assert.match(output, /onebyoneStopMonitorLayout = installPlayerMonitorLayout\(this.element, this.props\)/);
    assert.match(output, /if \(this.onebyoneStopMonitorLayout\) this.onebyoneStopMonitorLayout\(\);/);
    assert.throws(() => patchMonitor(output), /no longer matches/);
    assert.throws(() => patchMonitor(source.replace('componentWillUnmount', 'changedHook')), /no longer matches/);
});
