const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { test } = require('node:test');
const { buildSync } = require('esbuild');

let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Try next runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const worker = buildSync({ entryPoints: [path.join(__dirname, '../packages/ui-default/service-worker.ts')],
    bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } }).outputFiles[0].text;

test('a controlling worker preserves document/iframe destinations, redirects and one-shot POST navigation', async (t) => {
    assert(executablePath, 'Chromium is required for the navigation worker regression');
    const requests = [];
    let workerSource = `self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
      self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', e => { if (e.request.mode === 'navigate') e.respondWith(fetch(e.request)); });`;
    const server = http.createServer(async (request, response) => {
        let body = '';
        for await (const chunk of request) body += chunk;
        const url = new URL(request.url, 'http://local.test');
        requests.push({ path: url.pathname, method: request.method, destination: request.headers['sec-fetch-dest'],
            cookie: request.headers.cookie, body });
        response.setHeader('Cache-Control', 'no-store');
        if (url.pathname === '/service-worker.js') {
            response.setHeader('Content-Type', 'application/javascript'); response.end(workerSource); return;
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Vary', 'Sec-Fetch-Dest');
        if (url.pathname === '/redirect') { response.writeHead(302, { Location: '/page.html?redirected=1' }); response.end(); return; }
        if (url.pathname === '/submit' || url.pathname === '/api-submit') {
            response.statusCode = 500; response.end(`<p>Submitted ${body}</p>`); return;
        }
        if (url.pathname === '/') response.setHeader('Set-Cookie', 'classroom=active; Path=/; HttpOnly; SameSite=Lax');
        response.end(`<!doctype html><html><body><h1>${request.headers['sec-fetch-dest'] || 'missing'}</h1>
          <form method="post" action="/submit"><input name="answer" value="123"><button>提交</button></form></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await playwright.chromium.launch({ executablePath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    await page.goto(origin);
    await page.evaluate(async () => {
        await navigator.serviceWorker.register('/service-worker.js');
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    await page.goto(`${origin}/page.html`);
    assert.equal(await page.locator('h1').textContent(), 'empty', 'the legacy worker reproduces the original destination loss');
    workerSource = worker;
    await page.evaluate(async () => {
        const changed = new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        await (await navigator.serviceWorker.getRegistration()).update();
        await changed;
    });
    await page.evaluate(async (origin) => {
        await fetch('/service-worker-config', { method: 'POST', body: JSON.stringify({ hosts: [origin], assets: [], domains: ['unused-mirror.test'] }) });
        const cache = await caches.open('ui-resources-cache');
        await cache.put('/page.html', new Response('<h1>stale cached page</h1>', { headers: { 'Content-Type': 'text/html' } }));
    }, origin);
    await page.goto(`${origin}/page.html`);
    assert.equal(await page.locator('h1').textContent(), 'document');
    assert.equal(await page.evaluate(() => !!navigator.serviceWorker.controller), true);
    await page.reload();
    assert.equal(await page.locator('h1').textContent(), 'document', 'a controlled reload must still be recognized as a top-level host');
    await page.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/frame.html'; document.body.append(frame); });
    await page.frameLocator('iframe').locator('h1').waitFor();
    const frame = page.frames().find((item) => item.url().endsWith('/frame.html'));
    assert.equal(await frame.locator('h1').textContent(), 'iframe', 'content navigation must never be mistaken for a top-level host');
    await Promise.all([frame.waitForNavigation(), frame.locator('button').click()]);
    assert.equal(await frame.locator('p').textContent(), 'Submitted answer=123');
    const submitted = requests.filter((item) => item.path === '/submit');
    assert.equal(submitted.length, 1, 'failed form submissions are never retried');
    assert.equal(submitted[0].method, 'POST'); assert.equal(submitted[0].destination, 'iframe');
    assert.equal(submitted[0].body, 'answer=123'); assert.match(submitted[0].cookie, /classroom=active/);
    assert.equal(await page.evaluate(async () => (await fetch('/api-submit', { method: 'POST', body: 'message=test' })).status), 500);
    assert.equal(requests.filter((item) => item.path === '/api-submit').length, 1);
    await page.goto(`${origin}/redirect`);
    assert.equal(await page.locator('h1').textContent(), 'document');
    assert.equal(page.url(), `${origin}/page.html?redirected=1`);
});
