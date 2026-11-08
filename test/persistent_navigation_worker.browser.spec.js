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

test('versioned registration replaces a permanently stale root worker and configures its new controller', async (t) => {
    assert(executablePath, 'Chromium is required for the worker upgrade regression');
    const workerDiagnostics = [];
    const registrationBundle = buildSync({
        entryPoints: [path.join(__dirname, '../packages/ui-default/utils/service-worker-registration.ts')],
        bundle: true, write: false, format: 'iife', globalName: 'WorkerRegistration',
    }).outputFiles[0].text;
    const version = '0123456789abcdef0123456789abcdef';
    const requests = [];
    const staleWorker = `self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
      self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
      self.addEventListener('fetch', e => {
        if (e.request.mode === 'navigate') e.respondWith(fetch(e.request));
        if (e.request.url.endsWith('/service-worker-config')) {
          e.waitUntil(e.request.text());
          e.respondWith(new Response('old configuration'));
        }
      });`;
    const server = http.createServer(async (request, response) => {
        for await (const _ of request) { /* Drain configuration bodies. */ }
        const url = new URL(request.url, 'http://local.test');
        requests.push({ path: url.pathname, search: url.search, destination: request.headers['sec-fetch-dest'] });
        response.setHeader('Cache-Control', 'no-store');
        if (url.pathname === '/service-worker.js') {
            // Reproduce a proxy that indefinitely serves an old, mutable URL.
            response.setHeader('Content-Type', 'application/javascript');
            response.end(url.searchParams.get('v') === version ? worker : staleWorker);
            return;
        }
        if (url.pathname === '/assets/probe.txt') {
            response.setHeader('Content-Type', 'text/plain');
            response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            response.end('configured asset cache');
            return;
        }
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.setHeader('Vary', 'Sec-Fetch-Dest');
        response.end(`<!doctype html><html><body><h1>${request.headers['sec-fetch-dest'] || 'missing'}</h1></body></html>`);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const browser = await playwright.chromium.launch({ executablePath, headless: true });
    t.after(() => browser.close());
    const page = await browser.newPage();
    page.on('console', (message) => workerDiagnostics.push(message.text()));
    page.on('pageerror', (error) => workerDiagnostics.push(String(error)));
    await page.goto(origin);
    await page.evaluate(async () => {
        await navigator.serviceWorker.register('/service-worker.js', { scope: '/', updateViaCache: 'none' });
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
    });
    await page.reload();
    assert.equal(await page.locator('h1').textContent(), 'empty', 'the stale worker must reproduce destination loss before the upgrade');
    await page.addScriptTag({ content: registrationBundle });
    await page.evaluate(({ version, origin }) => {
        window.configuredControllers = [];
        window.registrationOptions = [];
        const nativeRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
        navigator.serviceWorker.register = (url, options) => {
            window.registrationOptions.push({ url: String(url), ...options });
            return nativeRegister(url, options);
        };
        window.registrationResult = WorkerRegistration.registerPlatformServiceWorker(navigator.serviceWorker, version, async () => {
            await fetch('/service-worker-config', {
                method: 'POST', body: JSON.stringify({ hosts: [origin], assets: [`${origin}/assets/`], domains: [] }),
            });
            window.configuredControllers.push(navigator.serviceWorker.controller?.scriptURL);
        });
    }, { version, origin });
    await page.waitForFunction((version) => navigator.serviceWorker.controller?.scriptURL.endsWith(`?v=${version}`)
        && window.configuredControllers.some((url) => url?.endsWith(`?v=${version}`)), version, { timeout: 10000 }).catch(async (error) => {
        const state = await page.evaluate(async () => ({
            controller: navigator.serviceWorker.controller?.scriptURL,
            configured: window.configuredControllers,
            options: window.registrationOptions,
            result: await Promise.resolve(window.registrationResult).then(() => 'registered', (reason) => String(reason)),
            registrations: (await navigator.serviceWorker.getRegistrations()).map((item) => ({
                active: item.active?.scriptURL, waiting: item.waiting?.scriptURL, installing: item.installing?.scriptURL,
            })),
        }));
        throw new Error(`${error.message}: ${JSON.stringify({ state, requests, workerDiagnostics })}`);
    });
    const state = await page.evaluate(async () => ({
        registrations: (await navigator.serviceWorker.getRegistrations()).map((item) => ({ scope: item.scope, active: item.active?.scriptURL })),
        options: window.registrationOptions,
        configured: window.configuredControllers,
    }));
    assert.deepEqual(state.registrations, [{ scope: `${origin}/`, active: `${origin}/service-worker.js?v=${version}` }]);
    assert.deepEqual(state.configured, [`${origin}/service-worker.js?v=${version}`],
        'obsolete controllers must not receive configuration while the requested worker is taking over');
    assert.equal(state.options[0].scope, '/');
    assert.equal(state.options[0].updateViaCache, 'none');
    assert.match(state.options[0].url, new RegExp(`/service-worker\\.js\\?v=${version}$`));
    assert.deepEqual(await page.evaluate(async () => [
        await (await fetch('/assets/probe.txt')).text(),
        await (await fetch('/assets/probe.txt')).text(),
    ]), ['configured asset cache', 'configured asset cache']);
    assert.equal(requests.filter((item) => item.path === '/assets/probe.txt').length, 1,
        'configuration must reach the newly activated worker so it can cache assets immediately');
    await page.reload();
    assert.equal(await page.locator('h1').textContent(), 'document');
    await page.reload();
    assert.equal(await page.locator('h1').textContent(), 'document');
    await page.evaluate(() => { const frame = document.createElement('iframe'); frame.src = '/content'; document.body.append(frame); });
    await page.frameLocator('iframe').locator('h1').waitFor();
    assert.equal(await page.frameLocator('iframe').locator('h1').textContent(), 'iframe');
    assert.equal((await page.evaluate(() => navigator.serviceWorker.getRegistrations().then((items) => items.length))), 1);
});
