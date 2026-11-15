const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const jqueryFactory = require('jquery');

const source = path.join(__dirname, '../packages/ui-default/components/navigation/navigation.page.js');
const code = transformSync(fs.readFileSync(source, 'utf8'), { loader: 'js', format: 'cjs' }).code;
const tick = () => new Promise((resolve) => setImmediate(resolve));

function fixture(t, options = {}) {
    const dom = new JSDOM('<div id="panel"><div id="menu"></div><a name="nav_logout" href="/user_logout">退出登录</a><a name="nav_switch_account" href="#account">切换账号</a></div>', {
        url: 'https://onebyone.test/lesson', pretendToBeVisual: true,
    });
    const { window } = dom;
    const $ = jqueryFactory(window);
    const requests = []; const events = []; const errors = [];
    let host = window;
    if (options.parentOrigin) {
        const parent = new JSDOM('<main>课堂宿主</main>', { url: `${options.parentOrigin}/host` });
        host = parent.window;
        Object.defineProperty(window, 'parent', { value: host });
        t.after(() => host.close());
    }
    const currentHost = options.parentOrigin && options.parentOrigin !== window.location.origin ? window : host;
    currentHost.addEventListener('onebyone:lesson-before-exit', (event) => {
        events.push({ name: event.type, reason: event.detail.reason, cancelable: event.cancelable });
        if (!options.acceptExit) event.preventDefault();
    });
    currentHost.addEventListener('onebyone:lesson-exit-failed', (event) => {
        events.push({ name: event.type, reason: event.detail.reason });
    });
    const module = { exports: {} };
    vm.runInNewContext(code, {
        module, exports: module.exports, window, document: window.document, setInterval() {},
        require(name) {
            if (name === 'jquery') return $;
            if (name === 'vj/breakpoints.json') return { mobile: 600 };
            if (name === 'vj/components/dropdown/Dropdown') return {};
            if (name === 'vj/components/notification') return { error(message) { errors.push(message); } };
            if (name === 'vj/components/selectUser') return async () => options.noTarget ? null : { _id: 10 };
            if (name === 'vj/misc/Page') return { AutoloadPage: class { constructor(name, initialize) { this.initialize = initialize; } } };
            if (name === 'vj/utils') return {
                i18n: (message) => message,
                request: Object.fromEntries(['post', 'get'].map(method => [method, async (url) => {
                    requests.push({ method, url, events: events.length });
                    if (options.requestError) throw new Error('网络暂不可用');
                    return { url: '#complete' };
                }])),
            };
            throw new Error(`Unexpected navigation dependency: ${name}`);
        },
    });
    module.exports.default.initialize();
    t.after(() => window.close());
    return { window, host, requests, events, errors, async click(name) {
        window.document.querySelector(`[name="${name}"]`).dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
        await tick(); await tick();
    } };
}

for (const action of [
    { name: 'nav_logout', reason: 'logout', method: 'post', url: '/user_logout' },
    { name: 'nav_switch_account', reason: 'switch-account', method: 'get', url: '/account/10' },
]) {
    it(`cancelling ${action.reason} in the classroom host leaves the session and iframe unchanged`, async (t) => {
        const f = fixture(t, { parentOrigin: 'https://onebyone.test' });
        let localEvents = 0;
        f.window.addEventListener('onebyone:lesson-before-exit', () => { localEvents++; });
        await f.click(action.name);
        assert.deepEqual(f.events, [{ name: 'onebyone:lesson-before-exit', reason: action.reason, cancelable: true }]);
        assert.equal(localEvents, 0, 'the persistent classroom host owns the confirmation');
        assert.equal(f.requests.length, 0); assert.equal(f.window.location.href, 'https://onebyone.test/lesson');
        assert.deepEqual(f.errors, []);
    });

    it(`accepting ${action.reason} confirms before the session request`, async (t) => {
        const f = fixture(t, { acceptExit: true });
        await f.click(action.name);
        assert.deepEqual(f.requests, [{ method: action.method, url: action.url, events: 1 }]);
        assert.deepEqual(f.events, [{ name: 'onebyone:lesson-before-exit', reason: action.reason, cancelable: true }]);
        assert.equal(f.window.location.hash, '#complete'); assert.deepEqual(f.errors, []);
    });

    it(`a failed ${action.reason} resets the host's unload permission`, async (t) => {
        const f = fixture(t, { acceptExit: true, requestError: true, parentOrigin: 'https://onebyone.test' });
        await f.click(action.name);
        assert.equal(f.requests.length, 1);
        assert.deepEqual(f.events.at(-1), { name: 'onebyone:lesson-exit-failed', reason: action.reason });
        assert.deepEqual(f.errors, ['网络暂不可用']);
        assert.equal(f.window.location.href, 'https://onebyone.test/lesson');
    });
}

it('cancelling account selection never requests a classroom exit or session change', async (t) => {
    const f = fixture(t, { noTarget: true, acceptExit: true });
    await f.click('nav_switch_account');
    assert.deepEqual(f.events, []); assert.deepEqual(f.requests, []);
});

it('a different-origin parent cannot receive or approve a platform exit', async (t) => {
    const f = fixture(t, { parentOrigin: 'https://other.test' });
    let foreignEvents = 0;
    f.host.addEventListener('onebyone:lesson-before-exit', () => { foreignEvents++; });
    await f.click('nav_logout');
    assert.equal(foreignEvents, 0); assert.equal(f.events.length, 1); assert.equal(f.requests.length, 0);
});
