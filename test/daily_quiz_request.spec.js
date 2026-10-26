const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');

function requestFixture(failure) {
    const redirects = [];
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync('packages/ui-default/utils/base.ts', 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, {
        module, exports: module.exports, URL,
        window: { location: new URL('https://school.test/d/python/p/P10?tid=contest#scratchpad') },
        require(name) {
            if (name === 'jquery') return { ajax() {
                return { fail(callback) { callback(...failure); return this; }, done() {} };
            } };
            if (name.includes('daily_quiz_gate')) return { redirectToDailyQuiz: (url) => redirects.push(url) };
            return {};
        },
    });
    return { request: module.exports.request, redirects };
}

it('old and new daily-practice refusals give a useful error and trigger navigation instead of an empty submission result', async () => {
    for (const error of ['daily_quiz_required', { code: 'daily_quiz_required', message: '先完成每日一练' }]) {
        const f = requestFixture([{ status: 403, readyState: 4, responseJSON: {
            error, message: '先完成每日一练', dailyQuizUrl: '/daily-quiz?return=%2Fp%2F10',
        } }, 'error', 'Forbidden']);
        await assert.rejects(f.request.ajax({ url: '/p/10/submit' }), (e) => {
            assert.equal(e.message, '先完成每日一练');
            assert.equal(e.dailyQuizRequired, true);
            assert.equal(e.isUserFacingError, true);
            return true;
        });
        assert.deepEqual(f.redirects, ['/daily-quiz?return=%2Fp%2F10']);
    }
});

it('ordinary permission failures and third-party refusals do not redirect the current lesson', async () => {
    const f = requestFixture([{ status: 403, readyState: 4, responseJSON: { error: { message: '没有权限' } } }, 'error', 'Forbidden']);
    await assert.rejects(f.request.ajax({ url: '/p/10/submit' }), /没有权限/);
    assert.equal(f.redirects.length, 0);
    const outside = requestFixture([{ status: 403, readyState: 4, responseJSON: { error: 'daily_quiz_required' } }, 'error', 'Forbidden']);
    await assert.rejects(outside.request.ajax({ url: 'https://other.test/submit' }), /每日一练/);
    assert.equal(outside.redirects.length, 0);
});

function draftFixture() {
    const dom = new JSDOM('<form><select name="lang"><option value="cc">C++</option><option value="py">Python</option></select><textarea name="code"></textarea><input type="file"></form>', { url: 'https://school.test/d/a/p/10/submit?tid=abc' });
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync('packages/ui-default/components/daily_quiz_submit_draft.ts', 'utf8'), {
        loader: 'ts', format: 'cjs',
    }).code, { module, exports: module.exports });
    const form = dom.window.document.querySelector('form');
    const bind = (uid = 20) => module.exports.bindDailyQuizSubmitDraft(form, uid, dom.window);
    const redirect = () => {
        const event = new dom.window.CustomEvent('hydro:daily-quiz-redirect', { cancelable: true });
        dom.window.dispatchEvent(event);
        return event;
    };
    return { dom, form, bind, redirect, code: form.querySelector('textarea'), lang: form.querySelector('select') };
}

it('pasted code and language survive the daily-practice round trip, including the final keystroke and intentional clearing', () => {
    const f = draftFixture();
    try {
        let unbind = f.bind();
        f.code.value = 'print("最后一次输入")';
        f.lang.value = 'py';
        assert.equal(f.redirect().defaultPrevented, false);
        unbind();
        f.code.value = '';
        f.lang.value = 'cc';
        unbind = f.bind();
        assert.equal(f.code.value, 'print("最后一次输入")');
        assert.equal(f.lang.value, 'py');
        f.code.value = '';
        f.redirect();
        unbind();
        f.bind();
        assert.equal(f.code.value, '');
    } finally { f.dom.window.close(); }
});

it('submit drafts stay within the same account, problem and contest URL', () => {
    const f = draftFixture();
    try {
        let unbind = f.bind();
        f.code.value = 'private student code';
        f.redirect();
        unbind();
        f.code.value = '';
        unbind = f.bind(21);
        assert.equal(f.code.value, '');
        unbind();
        f.dom.reconfigure({ url: 'https://school.test/d/a/p/10/submit?tid=other' });
        f.bind();
        assert.equal(f.code.value, '');
    } finally { f.dom.window.close(); }
});

it('a selected upload or unavailable storage preserves the original page instead of discarding work', () => {
    const f = draftFixture();
    try {
        f.bind();
        Object.defineProperty(f.form.querySelector('input'), 'files', { value: [new f.dom.window.File(['code'], 'main.cpp')] });
        assert.equal(f.redirect().defaultPrevented, true);
    } finally { f.dom.window.close(); }
    const broken = draftFixture();
    try {
        broken.bind();
        broken.code.value = 'int main() {}';
        Object.defineProperty(broken.dom.window, 'sessionStorage', { value: { setItem() { throw new Error('quota'); } } });
        assert.equal(broken.redirect().defaultPrevented, true);
    } finally { broken.dom.window.close(); }
});

it('draft bindings are idempotent and removed bindings no longer block navigation', () => {
    const f = draftFixture();
    try {
        const dispose = f.bind();
        assert.equal(f.bind(), undefined);
        dispose();
        Object.defineProperty(f.form.querySelector('input'), 'files', { value: [new f.dom.window.File(['code'], 'main.cpp')] });
        assert.equal(f.redirect().defaultPrevented, false);
    } finally { f.dom.window.close(); }
});
