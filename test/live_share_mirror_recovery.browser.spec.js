const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { build } = require('esbuild');
const root = path.resolve(__dirname, '..');
const playwright = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((file) => file && fs.existsSync(file));
let browser; let script;
before(async () => {
    assert(executablePath, 'Chromium is required');
    script = (await build({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/mirror.ts')],
        bundle: true, format: 'iife', globalName: 'Mirror', write: false, loader: { '.css': 'empty' },
        plugins: [{ name: 'actual-replay-with-faults', setup(builder) {
            builder.onResolve({ filter: /^\.\/vendor$/ }, () => ({ path: 'actual-rrweb', namespace: 'test' }));
            builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ resolveDir: root, contents: `
                export { record } from ${JSON.stringify(path.join(root, 'build/live-share/node_modules/rrweb/dist/rrweb.js'))};
                import { Replayer as ActualReplayer } from ${JSON.stringify(path.join(root, 'build/live-share/node_modules/rrweb/dist/rrweb.js'))};
                export class Replayer extends ActualReplayer {
                    constructor(...args) {
                        if (window.rejectReplay) { window.rejectReplay = false; throw new Error('injected iframe creation failure'); }
                        super(...args);
                    }
                    rebuildFullSnapshot(...args) {
                        if (window.deferReplay) {
                            window.deferReplay = false;
                            window.finishReplay = () => super.rebuildFullSnapshot(...args);
                            return;
                        }
                        return super.rebuildFullSnapshot(...args);
                    }
                }` }));
        } }],
    })).outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => browser?.close());

async function fixture(t, { stallCss = false } = {}) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
    t.after(() => page.close());
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    let releaseCss;
    const cssGate = new Promise((resolve) => { releaseCss = resolve; });
    await page.route('https://mirror-recovery.test/**', async (route) => {
        if (route.request().url().endsWith('.css')) {
            if (stallCss) await cssGate;
            return route.fulfill({ contentType: 'text/css', body: 'body{font:18px system-ui;background:#eef2f6}h1{color:rgb(12, 80, 120)}' }).catch(() => {});
        }
        return route.fulfill({ contentType: 'text/html', body: '<!doctype html><div id="stage" style="position:relative;width:1000px;height:750px"></div>' });
    });
    t.after(() => releaseCss());
    await page.goto('https://mirror-recovery.test/view');
    await page.addScriptTag({ content: script });
    await page.evaluate(() => {
        window.statuses = []; window.readies = 0; window.sequence = 0;
        window.viewer = Mirror.attachViewerMirror({ pageId: 'recovery-page', readOnly: true,
            container: document.querySelector('#stage'), sendCommand() {},
            onStatus: (message) => statuses.push(message), onReady: () => readies++ });
        window.snapshot = (text, css = false) => {
            const element = (id, tagName, attributes = {}, childNodes = []) => ({ type: 2, id, tagName, attributes, childNodes });
            viewer.receive({ type: 'rrweb', sequence: ++sequence, event: { type: 4, timestamp: Date.now(), data: { width: 1000, height: 750, href: location.href } } });
            viewer.receive({ type: 'rrweb', sequence: ++sequence, event: { type: 2, timestamp: Date.now(), data: {
                node: { type: 0, id: 1, childNodes: [element(2, 'html', {}, [element(3, 'head', {}, css
                    ? [element(4, 'link', { rel: 'stylesheet', href: 'https://mirror-recovery.test/lesson.css' })] : []),
                element(6, 'body', {}, [element(8, 'h1', { id: 'lesson' }, [{ type: 3, id: 9, textContent: text }]),
                    element(10, 'div', { 'data-live-share-editor': 'editor-one', style: 'width:400px;height:200px' }),
                    element(11, 'div', { 'data-live-share-frame': 'frame-one', style: 'width:300px;height:100px' })])])] },
                initialOffset: { top: 0, left: 0 },
            } } });
        };
        window.change = (value) => viewer.receive({ type: 'rrweb', sequence: ++sequence, event: { type: 3, timestamp: Date.now(),
            data: { source: 0, adds: [], removes: [], attributes: [], texts: [{ id: 9, value }] } } });
        window.currentText = () => [...document.querySelectorAll('#stage iframe')]
            .filter((frame) => getComputedStyle(frame).visibility === 'visible')
            .map((frame) => frame.contentDocument?.querySelector('#lesson')?.textContent);
    });
    return { page, releaseCss, errors };
}

it('keeps the last complete frame while rebuilding and applies increments received before the new DOM exists', async (t) => {
    const { page, errors } = await fixture(t);
    await page.evaluate(() => snapshot('已显示的课堂'));
    await page.waitForFunction(() => readies === 1);
    await page.evaluate(() => { window.originalFrame = document.querySelector('#stage iframe'); window.deferReplay = true; snapshot('下一页快照'); });
    await page.waitForFunction(() => typeof finishReplay === 'function');
    assert.deepEqual(await page.evaluate(() => currentText()), ['已显示的课堂']);
    assert.equal(await page.evaluate(() => readies), 1, 'a sandbox shell is not a ready frame');
    assert.deepEqual(await page.evaluate(() => [viewer.getEditorRect('editor-one')?.width, viewer.getFrameRect('frame-one')?.width]), [400, 300],
        'previous editor and Scratch overlays retain display geometry until their replacement is ready');
    assert.equal(await page.evaluate(() => viewer.getDrawingNode(10)), null, 'the retained image cannot issue stale controls');
    await page.evaluate(() => change('构建期间的最新修改'));
    await page.waitForTimeout(100);
    await page.evaluate(() => finishReplay());
    await page.waitForFunction(() => readies === 2 && currentText()[0] === '构建期间的最新修改');
    assert.equal(await page.evaluate(() => originalFrame.isConnected), false);
    assert.equal(await page.locator('#stage iframe').count(), 1);
    assert.equal(await page.locator('#stage iframe').getAttribute('sandbox'), 'allow-same-origin');
    assert.deepEqual(errors, []);
});

it('keeps live DOM updates flowing when external stylesheets stall, with bounded first-frame readiness', async (t) => {
    const { page, releaseCss, errors } = await fixture(t, { stallCss: true });
    await page.evaluate(() => snapshot('等待样式的课堂', true));
    await page.waitForFunction(() => document.querySelector('#stage iframe')?.contentDocument?.querySelector('#lesson'));
    assert.equal(await page.evaluate(() => readies), 0, 'loading CSS cannot be reported as a completed first frame');
    await page.waitForFunction(() => readies === 1, undefined, { timeout: 4000 });
    await page.evaluate(() => change('CDN暂时不可用仍持续更新'));
    await page.waitForFunction(() => currentText()[0] === 'CDN暂时不可用仍持续更新');
    releaseCss();
    await page.waitForFunction(() => document.querySelector('#stage iframe').contentDocument.querySelector('link').sheet);
    await page.evaluate(() => change('样式恢复后仍持续更新'));
    await page.waitForFunction(() => currentText()[0] === '样式恢复后仍持续更新');
    assert.deepEqual(errors, []);
});

it('a failed replacement retains the previous frame and can recover on a fresh snapshot', async (t) => {
    const { page, errors } = await fixture(t);
    await page.evaluate(() => snapshot('原有课堂画面'));
    await page.waitForFunction(() => readies === 1);
    await page.evaluate(() => { window.rejectReplay = true; snapshot('构建失败的页面'); });
    await page.waitForFunction(() => statuses.some((status) => status.includes('同步中断')));
    assert.deepEqual(await page.evaluate(() => currentText()), ['原有课堂画面']);
    assert.equal(await page.evaluate(() => readies), 1);
    await page.evaluate(() => { viewer.setConnected(true); snapshot('自动重连后的新画面'); });
    await page.waitForFunction(() => readies === 2 && currentText()[0] === '自动重连后的新画面');
    assert.deepEqual(errors, []);
});

it('missing final fragments fail during idle time, while steady progress and a newer complete snapshot cancel expiry', async (t) => {
    const { page } = await fixture(t);
    await page.clock.install();
    await page.evaluate(() => {
        window.accepted = []; window.failures = [];
        window.assembler = new Mirror.MirrorAssembler((event) => accepted.push(event), (message) => failures.push(message));
        window.fragment = (id, sequence, index, total = 3) => assembler.receive({ type: 'rrweb-chunk', id, sequence, index,
            total, encoding: 'json', chunk: ' ' });
        fragment('incomplete-first', 1, 0);
    });
    await page.clock.runFor(6000);
    await page.evaluate(() => fragment('incomplete-first', 1, 1));
    await page.clock.runFor(6000);
    assert.equal(await page.evaluate(() => failures.length), 0, 'progress extends the idle deadline');
    await page.clock.runFor(2100);
    assert.equal(await page.evaluate(() => failures.length), 1, 'no next packet is required to detect a lost last chunk');
    await page.evaluate(() => {
        fragment('older-snapshot', 2, 0);
        assembler.receive({ type: 'rrweb', sequence: 3, event: { type: 2, timestamp: Date.now(), data: { node: { type: 3, id: 1, textContent: 'recovered' } } } });
    });
    await page.clock.runFor(9000);
    assert.equal(await page.evaluate(() => accepted.length), 1);
    assert.equal(await page.evaluate(() => failures.length), 1, 'a superseded incomplete snapshot cannot break the recovered stream');
    await page.evaluate(() => { fragment('disposed', 4, 0); assembler.dispose(); });
    await page.clock.runFor(9000);
    assert.equal(await page.evaluate(() => failures.length), 1);
});

it('coalesces resync bursts during a large initial snapshot without overflowing or losing the follow-up', async (t) => {
    const { page, errors } = await fixture(t);
    await page.evaluate(() => {
        viewer.dispose(); document.querySelector('#stage').remove();
        const content = document.createElement('p'); content.id = 'lesson'; content.textContent = '课堂同步'.repeat(180000); document.body.append(content);
        window.sourcePackets = []; window.sourceStatuses = []; window.snapshots = [];
        window.sourceAssembler = new Mirror.MirrorAssembler((event) => { if (event.type === 2) snapshots.push(event); }, (status) => sourceStatuses.push(status));
        window.source = Mirror.attachSourceMirror({ pageId: 'source-burst',
            send: (packet) => { sourcePackets.push(packet); sourceAssembler.receive(packet); },
            onStatus: (status) => sourceStatuses.push(status) });
    });
    await page.waitForFunction(() => sourcePackets.length > 0);
    await page.evaluate(() => { for (let index = 0; index < 40; index++) source.snapshot(); });
    await page.waitForFunction(() => snapshots.length === 2, undefined, { timeout: 6000 });
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(() => snapshots.length), 2, 'one follow-up serves viewers who missed the initial snapshot start');
    assert.deepEqual(await page.evaluate(() => sourceStatuses), []);
    await page.evaluate(() => { source.dispose(); sourceAssembler.dispose(); });
    assert.deepEqual(errors, []);
});
