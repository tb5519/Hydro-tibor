const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const { buildSync } = require('esbuild');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Support bundled runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((candidate) => candidate && fs.existsSync(candidate));
let browser; let script;
const rid = '0123456789abcdef01234567';
before(async () => {
    assert(executablePath, 'Chromium is required for solution run checks');
    script = buildSync({ entryPoints: ['packages/ui-default/components/class_chat/solution_run.ts'], bundle: true, write: false,
        format: 'iife', globalName: 'SolutionRun' }).outputFiles[0].text;
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => { await browser?.close(); });
async function fixture(t, { record, post, canRun = true, submitUrl = '/d/C0001/p/53/submit?tid=not-the-student-contest', recordUrl } = {}) {
    const context = await browser.newContext(); t.after(() => context.close());
    const requests = [];
    await context.route('**/*', async (route) => {
        const request = route.request(); const url = new URL(request.url());
        if (url.pathname === '/workspace') return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
          <main id="root"><button data-solution-run>运行自测</button><button data-solution-submit>提交评测</button>
          <span data-solution-run-status></span><section data-solution-run-panel hidden><textarea data-solution-run-input></textarea>
          <pre data-solution-run-output></pre><span data-solution-run-detail></span><button data-solution-run-close>收起</button></section></main>
          <script>${script}</script>` });
        requests.push({ method: request.method(), pathname: url.pathname, query: url.search, body: request.postDataJSON() });
        if (request.method() === 'POST' && post) return post(route);
        if (url.pathname.includes('/record/') && record) return record(route, requests);
        return route.fulfill({ contentType: 'application/json', body: JSON.stringify(request.method() === 'POST' ? { rid }
            : { rdoc: { _id: rid, status: 1, score: 100, time: 3, memory: 1024, testCases: [{ status: 1, message: '3\n' }] } }) });
    });
    const page = await context.newPage(); await page.goto('https://solution.test/workspace');
    await page.evaluate(({ canRun, submitUrl, recordUrl }) => {
        window.sourceCode = 'cout << 1 + 2;';
        window.store = { marker: 'ordinary-scratchpad-must-not-change' };
        window.runner = SolutionRun.installSolutionRunner({ root: document.querySelector('#root'), canRun, sourceMessageId: 'source-message-123',
            submitUrl, recordUrl, getCode: () => sourceCode, getLang: () => 'cc.cc14' });
    }, { canRun, submitUrl, recordUrl });
    return { page, requests };
}

it('runs raw beginner code without changing drafts, displays self-test stdout and formal AC in the same compact panel', async (t) => {
    const { page, requests } = await fixture(t);
    await page.evaluate(() => { document.querySelector('[data-solution-run-input]').value = '1 2'; });
    await page.locator('[data-solution-run]').click();
    await page.waitForFunction(() => document.querySelector('[data-solution-run-status]').textContent === '运行完成');
    assert.equal(await page.locator('[data-solution-run-output]').textContent(), '3\n');
    assert.deepEqual(requests[0], { method: 'POST', pathname: '/d/C0001/p/53/submit', query: '',
        body: { lang: 'cc.cc14', code: 'cout << 1 + 2;', source: 'teaching-solution', solutionSource: 'source-message-123', pretest: true, input: ['1 2'] } });
    await page.locator('[data-solution-submit]').click();
    await page.waitForFunction(() => document.querySelector('[data-solution-run-status]').textContent === 'AC · 全部通过');
    assert.match(await page.locator('[data-solution-run-detail]').textContent(), /通过 1\/1.*100 分/);
    assert.equal(requests.filter((request) => request.method === 'POST')[1].body.pretest, false);
    assert.equal(requests.filter((request) => request.method === 'GET').every((request) => request.pathname === `/d/C0001/record/${rid}`), true);
    assert.deepEqual(await page.evaluate(() => [sourceCode, store]), ['cout << 1 + 2;', { marker: 'ordinary-scratchpad-must-not-change' }]);
});

it('one pending run blocks double submits and compilers errors are text, never executable markup', async (t) => {
    let polls = 0;
    const { page, requests } = await fixture(t, { record: (route) => route.fulfill({ contentType: 'application/json', body: JSON.stringify({
        rdoc: { _id: rid, status: ++polls === 1 ? 0 : 7, compilerTexts: ['<img src=x onerror=alert(1)>'], testCases: [] },
    }) }) });
    await page.evaluate(() => { void runner.run(true); void runner.run(false); void runner.run(true); });
    await page.waitForFunction(() => document.querySelector('[data-solution-run-status]').textContent === '等待评测…');
    assert.equal(await page.locator('[data-solution-run]').isDisabled(), true);
    assert.equal(await page.locator('[data-solution-submit]').isDisabled(), true);
    await page.waitForFunction(() => document.querySelector('[data-solution-run-status]').textContent === '编译错误');
    assert.equal(requests.filter((request) => request.method === 'POST').length, 1);
    assert.equal(await page.locator('[data-solution-run-output] img').count(), 0);
    assert.equal(await page.locator('[data-solution-run-output]').textContent(), '<img src=x onerror=alert(1)>');
});

it('lost submission responses are not retried and readonly or foreign-origin endpoints cannot submit', async (t) => {
    const failed = await fixture(t, { post: (route) => route.abort('failed') });
    await failed.page.locator('[data-solution-run]').click();
    await failed.page.waitForFunction(() => document.querySelector('[data-solution-run-status]').textContent === '暂未取得结果');
    assert.equal(failed.requests.length, 1);
    for (const options of [{ canRun: false }, { submitUrl: 'https://other.test/d/C0001/p/53/submit' }]) {
        const f = await fixture(t, options);
        await f.page.evaluate(() => runner.run(true));
        assert.equal(await f.page.locator('[data-solution-run]').isDisabled(), true); assert.deepEqual(f.requests, []);
    }
});

it('disposing stops exact-record polling and late responses cannot overwrite a new workspace status', async (t) => {
    const { page, requests } = await fixture(t, { record: async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 300));
        await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ rdoc: { _id: rid, status: 1 } }) }).catch(() => {});
    } });
    await page.locator('[data-solution-run]').click();
    await page.waitForRequest((request) => request.url().includes('/record/'));
    await page.evaluate(() => { runner.dispose(); document.querySelector('[data-solution-run-status]').textContent = '新的工作台'; });
    await page.waitForTimeout(1300);
    assert.equal(await page.locator('[data-solution-run-status]').textContent(), '新的工作台');
    assert.equal(requests.length, 2);
});
