const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const runtime = path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const playwright = require(runtime);
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((candidate) => candidate && fs.existsSync(candidate));
let browser;
let script;
before(async () => {
    assert(executablePath, 'Chromium is required for live sharing interaction tests');
    const result = await esbuild.build({ entryPoints: [path.join(root, 'packages/ui-default/components/live_share/mirror.ts')],
        bundle: true, format: 'iife', globalName: 'Mirror', write: false, loader: { '.css': 'empty' },
        plugins: [{ name: 'mirror-vendor', setup(build) {
            build.onResolve({ filter: /^\.\/vendor$/ }, () => ({ path: 'mirror-vendor', namespace: 'test' }));
            build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
                contents: `export { record, Replayer } from ${JSON.stringify(path.join(root, 'build/live-share/node_modules/rrweb/dist/rrweb.js'))};`,
                resolveDir: root,
            }));
        } }],
    });
    script = result.outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });

async function fixture({ latency = 0, editorMarkup = '' } = {}) {
    const studentContext = await browser.newContext({ viewport: { width: 1000, height: 700 } });
    const teacherContext = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    const student = await studentContext.newPage();
    const teacher = await teacherContext.newPage();
    student.setDefaultTimeout(7000); teacher.setDefaultTimeout(7000);
    const packets = [];
    const commands = [];
    const acks = [];
    const errors = [];
    let studentReady = false;
    student.on('pageerror', (e) => errors.push(`student: ${e.message}`));
    teacher.on('pageerror', (e) => errors.push(`teacher: ${e.message}`));
    for (const context of [studentContext, teacherContext]) {
        await context.route('https://sharing.test/**', async (route) => {
            const teacherPage = new URL(route.request().url()).pathname === '/teacher';
            const body = teacherPage ? '<textarea id="teacher-draft">teacher own code</textarea><main id="mirror" style="position:relative;width:1000px;height:700px"></main>' : `
                ${editorMarkup}<header>OneByOne</header><h1 id="title">学生正在练习</h1>
                <a id="next" href="/d/C0001/p/P2">下一道题</a>
                <a id="open-editor" href="javascript:;" name="problem-sidebar__open-scratchpad" onclick="window.opens++">进入在线编程</a>
                <a id="evil-link" href="/d/C0001/manage">控制面板</a>
                <button id="unknown" type="button" onclick="window.saves++">保存修改</button>
                <div id="scratchpad"><div class="scratchpad__toolbar__language"><select id="lang"><option value="py">Python</option><option value="cpp">C++</option></select></div>
                <button id="run" type="button" class="scratchpad__toolbar__pretest" onclick="window.runs++;document.querySelector('#result').textContent='运行 '+window.runs">运行</button>
                <button id="submit" type="button" class="scratchpad__toolbar__submit" onclick="window.submits++">提交</button><p id="result">未运行</p></div>
                <div data-live-share-editor="editor-one" style="height:140px"><div class="monaco-editor">private unsaved code managed separately</div></div>
                <input type="password" value="student password"><input type="hidden" value="csrf secret">
                <div data-private>private account data</div><aside data-live-share-ui>正在共享 <button>断开</button></aside>
                <iframe srcdoc="<p>inner secret</p>"></iframe>
                <form method="get" action="/d/C0001/p"><input id="search" type="search" name="q" value=""><button>查找</button></form>
                <div id="nested" style="height:180px;overflow:auto"><div id="nested-content" style="height:1200px;width:1400px">独立滚动内容</div></div><div id="long" style="height:1600px">学习内容</div><p id="bottom">底部</p>
                <script>window.runs=0;window.submits=0;window.saves=0;window.opens=0;window.sourceScriptRan=true;document.querySelector('#lang').addEventListener('change',e=>document.body.dataset.language=e.target.value)</script>`;
            return route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;font:16px system-ui;background:#f1f5f9}header{background:white;padding:18px}h1{font-size:24px}button,a,select{margin:8px;padding:8px}#mirror{background:white}</style></head><body>${body}<script>${script}</script></body></html>` });
        });
    }
    await teacher.goto('https://sharing.test/teacher');
    await student.goto('https://sharing.test/d/C0001/p/P1');
    await teacher.exposeFunction('sendCommand', async (data) => {
        commands.push(data);
        if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
        if (studentReady) await student.evaluate((value) => window.source.receiveCommand(value), data);
    });
    await teacher.evaluate(() => {
        window.statuses = [];
        window.viewer = Mirror.attachViewerMirror({ pageId: 'page-1', container: document.querySelector('#mirror'),
            sendCommand: (data) => window.sendCommand(data), onStatus: (message) => window.statuses.push(message) });
    });
    await student.exposeFunction('sendPacket', async (data) => {
        packets.push(data);
        if (latency) await new Promise((resolve) => setTimeout(resolve, latency));
        await teacher.evaluate((value) => window.viewer.receive(value), data);
    });
    await student.exposeFunction('sendAck', (data) => { acks.push(data); });
    await student.evaluate(() => {
        window.statuses = [];
        window.source = Mirror.attachSourceMirror({ pageId: 'page-1', send: (data) => window.sendPacket(data),
            sendAck: (data) => window.sendAck(data), onStatus: (message) => window.statuses.push(message) });
    });
    studentReady = true;
    await teacher.frameLocator('#mirror iframe').locator('#title').waitFor();
    const close = async () => {
        studentReady = false;
        await Promise.allSettled([student.evaluate(() => window.source?.dispose()), teacher.evaluate(() => window.viewer?.dispose())]);
        await studentContext.close(); await teacherContext.close();
    };
    return { student, teacher, packets, commands, acks, errors, close,
        frame: () => teacher.frameLocator('#mirror iframe') };
}

it('mirrors ordinary DOM changes, blocks private/editor content, and does not run student scripts in the replay', async () => {
    const f = await fixture();
    try {
        const frame = f.frame();
        assert.equal(await frame.locator('#title').textContent(), '学生正在练习');
        const recorded = JSON.stringify(f.packets);
        for (const secret of ['student password', 'csrf secret', 'private account data', 'private unsaved code managed separately', 'inner secret']) {
            assert(!recorded.includes(secret), `${secret} must not leave the student's page`);
        }
        assert.equal(await f.teacher.locator('#mirror iframe').getAttribute('sandbox'), 'allow-same-origin');
        assert.equal(await f.teacher.locator('#mirror iframe').evaluate((iframe) => iframe.contentWindow.sourceScriptRan), undefined);
        await f.student.evaluate(() => { document.querySelector('#title').textContent = '新的题目内容'; });
        await frame.locator('#title').getByText('新的题目内容', { exact: true }).waitFor();
        assert.equal(await f.teacher.locator('#teacher-draft').inputValue(), 'teacher own code');
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('anchors the editor to the replay placeholder immediately during teacher scrolling and safely updates late bindings and sizes', async () => {
    const f = await fixture({ latency: 100 });
    try {
        await f.teacher.waitForFunction(() => window.viewer.getEditorRect('editor-one')?.height === 140);
        const result = await f.teacher.evaluate(() => {
            const before = window.viewer.getEditorRect('editor-one');
            const doc = document.querySelector('#mirror iframe').contentDocument;
            doc.querySelector('#title').dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 120 }));
            return { before, after: window.viewer.getEditorRect('editor-one') };
        });
        assert.equal(result.before.y - result.after.y, 120, 'overlay anchor moves with replay before the network round trip');
        await f.student.evaluate(() => {
            const node = document.createElement('div');
            node.className = 'monaco-editor';
            node.id = 'late-editor';
            node.style.cssText = 'width:600px;height:180px';
            node.textContent = 'private late editor contents';
            document.body.appendChild(node);
        });
        await f.teacher.waitForTimeout(350);
        await f.student.evaluate(() => { document.querySelector('#late-editor').setAttribute('data-live-share-editor', 'late-editor'); });
        await f.teacher.waitForFunction(() => window.viewer.getEditorRect('late-editor')?.width === 600);
        await f.student.evaluate(() => { document.querySelector('#late-editor').style.cssText = 'width:500px;height:250px'; });
        await f.teacher.waitForFunction(() => {
            const rect = window.viewer.getEditorRect('late-editor');
            return rect?.width === 500 && rect.height === 250;
        });
        await f.student.evaluate(() => { document.querySelector('#late-editor').removeAttribute('data-live-share-editor'); });
        await f.teacher.waitForFunction(() => window.viewer.getEditorRect('late-editor') === null);
        assert(!JSON.stringify(f.packets).includes('private late editor contents'));
        assert.equal(await f.teacher.evaluate(() => window.viewer.getEditorRect('bad"] selector')), null);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('preserves a textarea editor position and outer box without copying private content or arbitrary inline styles', async () => {
    const f = await fixture({ editorMarkup: '<textarea name="code" data-live-share-editor="textarea-editor" class="padded-editor" style="position:absolute;top:500px;left:30px;color:rgb(123,45,67)">private textarea code</textarea><style>.padded-editor{box-sizing:content-box;width:500px;height:120px;padding:12px;border:2px solid}</style>' });
    try {
        await f.teacher.waitForFunction(() => !!window.viewer.getEditorRect('textarea-editor'));
        const actual = await f.student.evaluate(() => {
            const rect = document.querySelector('.padded-editor').getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        });
        assert.deepEqual(await f.teacher.evaluate(() => window.viewer.getEditorRect('textarea-editor')), actual);
        const recorded = JSON.stringify(f.packets);
        assert(!recorded.includes('private textarea code'));
        assert(!recorded.includes('123,45,67'));
        await f.student.evaluate(() => { document.querySelector('.padded-editor').style.top = '600px'; });
        await f.teacher.waitForFunction(() => window.viewer.getEditorRect('textarea-editor')?.y === 600);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('refreshes the placeholder when an existing textarea becomes a shared editor after recording starts', async () => {
    const f = await fixture({ editorMarkup: '<textarea name="code" id="late-area">private late textarea</textarea>' });
    try {
        await f.student.evaluate(() => { document.querySelector('#late-area').setAttribute('data-live-share-editor', 'late-area'); });
        await f.teacher.waitForFunction(() => !!window.viewer.getEditorRect('late-area'));
        assert(!JSON.stringify(f.packets).includes('private late textarea'));
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('executes allowed teacher clicks once, synchronizes language changes, and refuses side-effect buttons', async () => {
    const f = await fixture();
    try {
        await f.frame().locator('#run').click();
        await f.student.waitForFunction(() => window.runs === 1);
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#result')?.textContent === '运行 1');
        const runCommand = f.commands.find((entry) => entry.action === 'click');
        assert(runCommand);
        await f.student.evaluate((data) => window.source.receiveCommand(data), runCommand);
        assert.equal(await f.student.evaluate(() => window.runs), 1, 'a retry must not run the code twice');
        await f.frame().locator('#lang').selectOption('cpp');
        await f.student.waitForFunction(() => document.body.dataset.language === 'cpp');
        await f.frame().locator('#submit').click();
        await f.frame().locator('#unknown').click();
        await f.teacher.waitForTimeout(120);
        assert.deepEqual(await f.student.evaluate(() => [window.submits, window.saves]), [0, 0]);
        assert(f.acks.some((ack) => !ack.ok && ack.reason.includes('提交')));
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('rejects stale page commands and disconnected controls without changing the student page', async () => {
    const f = await fixture();
    try {
        await f.frame().locator('#run').click();
        await f.student.waitForFunction(() => window.runs === 1);
        const valid = f.commands[0];
        const stale = await f.student.evaluate((data) => window.source.receiveCommand({ ...data, id: 'stale', pageId: 'page-old' }), valid);
        assert.equal(stale.ok, false);
        const hidden = await f.student.evaluate((data) => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
            const result = window.source.receiveCommand({ ...data, id: 'hidden-tab' });
            delete document.hidden;
            return result;
        }, valid);
        assert.equal(hidden.ok, false);
        await f.student.evaluate(() => window.source.setConnected(false));
        const disconnected = await f.student.evaluate((data) => window.source.receiveCommand({ ...data, id: 'disconnected' }), valid);
        assert.equal(disconnected.ok, false);
        assert.equal(await f.student.evaluate(() => window.runs), 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('teacher navigation changes only the student and refuses management links', async () => {
    const f = await fixture();
    try {
        await f.frame().locator('#evil-link').click();
        await f.teacher.waitForTimeout(100);
        assert.equal(new URL(f.student.url()).pathname, '/d/C0001/p/P1');
        await f.frame().locator('#next').click();
        await f.student.waitForURL('**/d/C0001/p/P2');
        assert.equal(f.teacher.url(), 'https://sharing.test/teacher');
        assert.equal(await f.teacher.locator('#teacher-draft').inputValue(), 'teacher own code');
    } finally { await f.close(); }
});

it('opens the named online editor without replaying javascript links and supports safe GET problem searches', async () => {
    const f = await fixture();
    try {
        assert.equal(await f.frame().locator('#open-editor').getAttribute('href'), null, 'executable URLs never enter the replay');
        await f.frame().locator('#open-editor').click();
        await f.student.waitForFunction(() => window.opens === 1);
        assert.equal(await f.teacher.locator('#mirror iframe').evaluate((iframe) => iframe.contentWindow.opens), undefined);
        assert.equal(await f.frame().locator('form').getAttribute('action'), null, 'the replay form cannot submit natively');
        await f.frame().locator('#search').fill('二分 搜索');
        await f.frame().locator('#search').press('Enter');
        await f.student.waitForURL('**/d/C0001/p?q=*');
        assert.equal(new URL(f.student.url()).searchParams.get('q'), '二分 搜索');
        assert.equal(f.teacher.url(), 'https://sharing.test/teacher');
    } finally { await f.close(); }
});

it('source scroll follows the student and teacher wheel scrolls the same student document', async () => {
    const f = await fixture();
    try {
        await f.student.evaluate(() => window.scrollTo(0, 500));
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentWindow.scrollY === 500);
        await f.frame().locator('#long').hover();
        await f.teacher.mouse.wheel(0, 160);
        await f.student.waitForFunction(() => window.scrollY > 500);
        assert(f.commands.some((command) => command.action === 'scroll'));
    } finally { await f.close(); }
});


it('continuously relays a teacher trackpad gesture without waiting for it to stop or jumping backwards on echoes', async () => {
    const f = await fixture({ latency: 60 });
    let gesture;
    try {
        await f.student.evaluate(() => window.scrollTo(0, 200));
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentWindow.scrollY === 200);
        gesture = f.teacher.evaluate(async () => {
            const doc = document.querySelector('#mirror iframe').contentDocument;
            const positions = [];
            for (let i = 0; i < 60; i++) {
                doc.querySelector('#long').dispatchEvent(new doc.defaultView.WheelEvent('wheel', { deltaY: 8, bubbles: true, cancelable: true }));
                positions.push(doc.scrollingElement.scrollTop);
                await new Promise((resolve) => setTimeout(resolve, 16));
            }
            return positions;
        });
        // A trailing debounce leaves the student completely still for this whole gesture.
        await f.student.waitForFunction(() => window.scrollY > 260, null, { timeout: 750 });
        const positions = await gesture;
        assert(positions.every((position, index) => !index || position >= positions[index - 1]), 'old replay echoes must not rewind the teacher');
        await f.student.waitForFunction(() => Math.abs(window.scrollY - 680) <= 1);
        await f.teacher.waitForFunction(() => Math.abs(document.querySelector('#mirror iframe').contentWindow.scrollY - 680) <= 1);
        const scrolls = f.commands.filter((entry) => entry.action === 'scroll');
        assert(scrolls.length >= 8 && scrolls.length <= 50, 'continuous scrolling is throttled, never sent once per idle gesture');
        await f.student.evaluate(() => window.scrollTo(0, 120));
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentWindow.scrollY === 120);
        assert.deepEqual(f.errors, []);
    } finally { await gesture?.catch(() => {}); await f.close(); }
});

it('teacher wheel controls nested scroll containers and clamps their bounds without moving the page', async () => {
    const f = await fixture({ latency: 40 });
    try {
        await f.teacher.evaluate(async () => {
            const doc = document.querySelector('#mirror iframe').contentDocument;
            for (let i = 0; i < 20; i++) {
                doc.querySelector('#nested-content').dispatchEvent(new doc.defaultView.WheelEvent('wheel', { deltaX: 20, deltaY: 12, bubbles: true, cancelable: true }));
                await new Promise((resolve) => setTimeout(resolve, 16));
            }
        });
        await f.student.waitForFunction(() => {
            const node = document.querySelector('#nested'); return Math.abs(node.scrollTop - 240) <= 1 && Math.abs(node.scrollLeft - 400) <= 1;
        });
        assert.equal(await f.student.evaluate(() => window.scrollY), 0);
        await f.teacher.waitForFunction(() => Math.abs(document.querySelector('#mirror iframe').contentDocument.querySelector('#nested').scrollTop - 240) <= 1);
        await f.teacher.evaluate(() => {
            const doc = document.querySelector('#mirror iframe').contentDocument;
            doc.querySelector('#nested-content').dispatchEvent(new doc.defaultView.WheelEvent('wheel', { deltaY: 10000, bubbles: true, cancelable: true }));
        });
        await f.student.waitForFunction(() => { const node = document.querySelector('#nested'); return node.scrollTop === node.scrollHeight - node.clientHeight; });
        assert.equal(await f.student.evaluate(() => window.scrollY), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});


it('disconnect discards an unsent wheel target', async () => {
    const f = await fixture();
    try {
        const before = f.commands.length;
        await f.teacher.evaluate(() => {
            const doc = document.querySelector('#mirror iframe').contentDocument;
            doc.querySelector('#long').dispatchEvent(new doc.defaultView.WheelEvent('wheel', { deltaY: 300, bubbles: true, cancelable: true }));
            window.viewer.setConnected(false);
        });
        await f.teacher.waitForTimeout(120);
        assert.equal(f.commands.length, before, 'a queued scroll must not run after disconnect');
        assert.equal(await f.student.evaluate(() => window.scrollY), 0);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('reconnect waits for a new snapshot and resumes updates and clicks on the current document', async () => {
    const f = await fixture();
    try {
        await f.teacher.evaluate(() => window.viewer.setConnected(false));
        await f.student.evaluate(() => { window.source.setConnected(false); document.querySelector('#title').textContent = '断线期间的新内容'; });
        await f.teacher.waitForTimeout(200);
        assert.equal(await f.frame().locator('#title').textContent(), '学生正在练习');
        await f.teacher.evaluate(() => window.viewer.setConnected(true));
        assert.equal(await f.teacher.locator('#mirror iframe').evaluate((iframe) => iframe.style.pointerEvents), 'none');
        await f.student.evaluate(() => window.source.setConnected(true));
        await f.teacher.waitForFunction(() => document.querySelector('#mirror iframe').contentDocument.querySelector('#title')?.textContent === '断线期间的新内容');
        await f.frame().locator('#run').click();
        await f.student.waitForFunction(() => window.runs === 1);
        assert.deepEqual(f.errors, []);
    } finally { await f.close(); }
});

it('large compressed Unicode snapshots reassemble and unsafe or missing sequences do not apply', async () => {
    const page = await browser.newPage();
    try {
        await page.goto('about:blank'); await page.addScriptTag({ content: script });
        const result = await page.evaluate(async () => {
            const accepted = []; const failures = [];
            const event = { type: 2, timestamp: Date.now(), data: { node: { type: 3, id: 1, textContent: '编程学习ABC'.repeat(20000) } } };
            const packets = await Mirror.mirrorPackets(event, 1);
            const assembler = new Mirror.MirrorAssembler((value) => accepted.push(value), (message) => failures.push(message));
            for (const packet of packets.toReversed()) assembler.receive(packet);
            await new Promise((resolve) => setTimeout(resolve, 150));
            assembler.receive({ type: 'rrweb', sequence: 3, event: { type: 3, timestamp: Date.now(), data: { source: 3, id: 1, x: 0, y: 50 } } });
            await new Promise((resolve) => setTimeout(resolve, 30));
            return { count: accepted.length, content: accepted[0]?.data.node.textContent, failures, encoding: packets[0].encoding };
        });
        assert.equal(result.count, 1);
        assert.equal(result.content, '编程学习ABC'.repeat(20000));
        assert.equal(result.encoding, 'gzip');
        assert.equal(result.failures.length, 1);
    } finally { await page.close(); }
});

it('safe study URLs reject account navigation, dangerous queries and encoded paths', async () => {
    const page = await browser.newPage();
    try {
        await page.goto('about:blank'); await page.addScriptTag({ content: script });
        const urls = await page.evaluate(() => {
            const base = 'https://sharing.test/d/C0001/p/P1';
            return ['https://evil.test/p/P2', '/logout', '/d/C0001/p/P1/edit', '/d/C0001/contest/create',
                '/p/P1?operation=delete', '/p/%252e%252e', 'javascript:alert(1)', '/home/account', '/p/P2?tid=abc', '/d/C0001/homework/abc']
                .map((url) => Mirror.safeStudyUrl(url, base));
        });
        assert(urls.slice(0, 8).every((url) => url === null));
        assert.equal(urls[8], 'https://sharing.test/p/P2?tid=abc');
        assert.equal(urls[9], 'https://sharing.test/d/C0001/homework/abc');
    } finally { await page.close(); }
});
