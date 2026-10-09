const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { buildSync, transformSync } = require('esbuild');
const jqueryFactory = require('jquery');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Provider } = require('react-redux');
const { createStore } = require('redux');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const pageUrl = 'https://example.test/d/class-a/p/P1002?tid=6aa000000000000000000002&lang=zh#statement';
const actionUrl = '/d/class-a/p/1002';
const settle = () => new Promise((done) => setImmediate(done));
function load(relative, globals = {}, dependencies = {}) {
    const mod = { exports: {} };
    const code = transformSync(fs.readFileSync(path.join(uiRoot, relative), 'utf8'), {
        loader: relative.endsWith('tsx') ? 'tsx' : 'ts', format: 'cjs', target: 'es2022',
    }).code;
    vm.runInNewContext(code, {
        module: mod, exports: mod.exports, ...globals,
        require: (name) => {
            assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`);
            return dependencies[name];
        },
    });
    return mod.exports;
}

function renderActions(overrides = {}) {
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(uiRoot, 'templates')), { autoescape: true });
    const detail = fs.readFileSync(path.join(uiRoot, 'templates/problem_detail.html'), 'utf8');
    const beginning = detail.indexOf('{% if canUseMistake %}', detail.indexOf('<div class="ui-v2-problem-detail">'));
    const end = detail.indexOf('<div class="row" data-sticky-parent>', beginning);
    assert.ok(beginning > 0 && end > beginning, 'use the actual problem-detail mistake prompt template');
    const context = { canUseMistake: true, mistakeActionUrl: actionUrl, pdoc: { docId: 1002 }, ...overrides };
    return env.renderString(detail.slice(beginning, end), context)
        + env.render('partials/problem_mistake_action.html', context);
}

function actionsHarness(post, overrides = {}) {
    const dom = new JSDOM(`${renderActions(overrides)}
        <div id="scratchpad"><textarea id="editor-draft">print("未保存的代码")</textarea></div>
        <form id="ordinary"><button type="submit">普通操作</button></form>`, { url: pageUrl });
    const { document } = dom.window;
    const calls = [];
    const notifications = { success: [], error: [] };
    const notify = {
        success: (value) => notifications.success.push(value),
        error: (value) => notifications.error.push(value),
    };
    const { bindMistakeActions } = load('components/mistake_actions.ts');
    const dispose = bindMistakeActions(document, (url, data) => {
        calls.push({ url, data });
        return post(url, data);
    }, notify);
    const forms = [...document.querySelectorAll('form[data-mistake-action]')];
    assert.equal(forms.length, 2, 'both the floating prompt and sidebar must be wired to Ajax');
    const buttons = forms.map((form) => form.querySelector('button[type="submit"]'));
    const draft = document.getElementById('editor-draft');
    const scratchpad = document.getElementById('scratchpad');
    dom.window.localStorage.setItem('20/class-a/1002@6aa000000000000000000002', draft.value);
    return {
        dom, document, calls, notifications, forms, buttons, draft, scratchpad, dispose,
        submit: (index = 0) => forms[index].dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
        cleanup: () => { dispose(); dom.window.close(); },
    };
}

function assertDraftPreserved(h) {
    assert.equal(h.dom.window.location.href, pageUrl, 'saving must preserve the current homework URL and fragment');
    assert.equal(h.document.getElementById('scratchpad'), h.scratchpad, 'the editor mount must not be replaced');
    assert.equal(h.document.getElementById('editor-draft'), h.draft);
    assert.equal(h.draft.value, 'print("未保存的代码")');
    assert.equal(h.dom.window.localStorage.getItem('20/class-a/1002@6aa000000000000000000002'), h.draft.value);
}

describe('in-place learner mistake actions', () => {
    it('sends one request across both controls while pending and preserves the homework editor and draft', async () => {
        let resolve;
        const h = actionsHarness(() => new Promise((done) => { resolve = done; }));
        try {
            let legacyClicks = 0;
            h.document.addEventListener('click', () => { legacyClicks += 1; });
            h.buttons[0].click();
            h.submit();
            h.submit(1);
            h.buttons[1].click();
            assert.equal(h.calls.length, 1);
            assert.equal(h.calls[0].url, new URL(actionUrl, pageUrl).href);
            assert.equal(h.calls[0].data.operation, 'add_mistake');
            assert.equal(legacyClicks, 0, 'legacy global five-second form throttling must not capture this action');
            for (const button of h.buttons) {
                assert.equal(button.disabled, true);
                assert.equal(button.getAttribute('aria-busy'), 'true');
            }
            assert.equal(h.document.querySelector('#ordinary button').disabled, false);
            assertDraftPreserved(h);
            resolve({ mistakeStatus: 'review' });
            await settle();
            for (const button of h.buttons) {
                assert.equal(button.disabled, false);
                assert.equal(button.getAttribute('aria-busy'), null);
                assert.match(button.textContent, /标记已掌握/);
            }
            for (const form of h.forms) assert.equal(form.querySelector('[name="operation"]').value, 'master_mistake');
            assert.equal(h.document.querySelector('.problem-mistake-float').dataset.mistakeState, 'review');
            assert.equal(h.document.querySelector('.problem-mistake-float__title').textContent, '已加入错题集');
            assert.deepEqual(h.notifications.success, ['已加入错题集']);
            assertDraftPreserved(h);
        } finally { h.cleanup(); }
    });

    it('synchronizes mastery and re-addition from either control using server-confirmed status', async () => {
        const h = actionsHarness(async (url, data) => ({ data: {
            mistakeStatus: data.operation === 'master_mistake' ? 'mastered' : 'review',
        } }), { mistakeDoc: { status: 'review' } });
        try {
            h.buttons[1].click();
            await settle();
            assert.equal(h.calls[0].data.operation, 'master_mistake');
            assert.equal(h.document.querySelector('.problem-mistake-float__title').textContent, '已掌握本题');
            assert.equal(h.document.querySelector('.problem-mistake-float__button').classList.contains('secondary'), false);
            for (const form of h.forms) assert.equal(form.querySelector('[name="operation"]').value, 'add_mistake');
            for (const button of h.buttons) assert.match(button.textContent, /重新加入错题集/);
            h.buttons[0].click();
            await settle();
            assert.equal(h.calls[1].data.operation, 'add_mistake');
            assert.equal(h.document.querySelector('.problem-mistake-float').dataset.mistakeState, 'review');
            assert.equal(h.document.querySelector('.problem-mistake-float__button').classList.contains('secondary'), true);
            assert.deepEqual(h.notifications.success, ['已标记掌握', '已加入错题集']);
            assertDraftPreserved(h);
        } finally { h.cleanup(); }
    });

    it('retains the previous state on failure and allows an immediate native-click retry', async () => {
        let attempts = 0;
        const h = actionsHarness(async () => {
            if (!attempts++) throw new Error('网络暂时不可用');
            return { mistakeStatus: 'review' };
        });
        try {
            const title = h.document.querySelector('.problem-mistake-float__title').textContent;
            h.buttons[0].click();
            await settle();
            assert.equal(h.calls.length, 1);
            assert.equal(h.document.querySelector('.problem-mistake-float__title').textContent, title);
            assert.equal(h.document.querySelector('.problem-mistake-float').dataset.mistakeState, '');
            assert.deepEqual(h.notifications.error, ['网络暂时不可用']);
            assert.equal(h.notifications.success.length, 0);
            for (const button of h.buttons) assert.equal(button.disabled, false);
            h.buttons[1].click();
            await settle();
            assert.equal(h.calls.length, 2);
            assert.equal(h.document.querySelector('.problem-mistake-float').dataset.mistakeState, 'review');
            assertDraftPreserved(h);
        } finally { h.cleanup(); }
    });

    it('does not claim success or mutate controls for a response missing the saved status', async () => {
        const h = actionsHarness(async () => ({ ok: true }));
        try {
            h.buttons[0].click();
            await settle();
            assert.equal(h.notifications.success.length, 0);
            assert.match(h.notifications.error[0], /确认保存结果/);
            for (const form of h.forms) assert.equal(form.querySelector('[name="operation"]').value, 'add_mistake');
            assert.equal(h.buttons[0].disabled, false);
            assertDraftPreserved(h);
        } finally { h.cleanup(); }
    });

    it('leaves unrelated form submissions untouched and removes its listeners on disposal', () => {
        const h = actionsHarness(async () => ({ mistakeStatus: 'review' }));
        try {
            const ordinary = new h.dom.window.Event('submit', { bubbles: true, cancelable: true });
            h.document.getElementById('ordinary').dispatchEvent(ordinary);
            assert.equal(ordinary.defaultPrevented, false);
            assert.equal(h.calls.length, 0);
            h.dispose();
            assert.equal(h.submit(), true, 'disposing must restore native submit handling');
            assert.equal(h.calls.length, 0);
        } finally { h.cleanup(); }
    });
});

const toolbarCode = buildSync({
    entryPoints: [path.join(uiRoot, 'components/scratchpad/ScratchpadToolbarContainer.jsx')],
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
function renderToolbar(context = {}) {
    const dom = new JSDOM('', { url: pageUrl });
    const mod = { exports: {} };
    const uiContext = { pdoc: { config: { type: 'default' } }, canUseMistake: true, ...context };
    vm.runInNewContext(toolbarCode, {
        module: mod, exports: mod.exports, React, window: dom.window, UiContext: uiContext,
        require: (name) => {
            if (name === 'vj/components/react/IconComponent') return ({ name: icon }) => React.createElement('i', { 'data-icon': icon });
            if (name === 'vj/components/notification') return { error() {} };
            if (name === 'vj/utils') {
                return {
                    getAvailableLangs: () => ({ python3: { display: 'Python 3' } }), i18n: (value) => value,
                    request: { post: async () => ({}), get: async () => ({}) },
                };
            }
            return require(name);
        },
    });
    const store = createStore((state = {
        ui: { pretest: { visible: true }, records: { visible: true }, formalSubmitRids: [], pretestWaitSec: 0, submitWaitSec: 0 },
        editor: { lang: 'python3', code: 'print(1)' }, pretest: { input: '', isRunning: false },
    }) => state);
    const html = renderToStaticMarkup(React.createElement(Provider, { store }, React.createElement(mod.exports.default)));
    dom.window.document.body.innerHTML = html;
    return dom;
}

describe('mistake toolbar entry', () => {
    it('keeps the learner toolbar focused on coding without the extra mistake button', () => {
        const dom = renderToolbar({ showMistakePrompt: false });
        try {
            assert.equal(dom.window.document.querySelector('[data-mistake-prompt-open]'), null);
            assert.ok(dom.window.document.querySelector('[data-global-hotkey="f10"]'));
            assert.ok(dom.window.document.querySelector('[data-global-hotkey="alt+p"]'));
        } finally { dom.window.close(); }
    });

    it('omits the learner action for ineligible problems, IDE mode, and an unauthorized review', () => {
        for (const context of [
            { canUseMistake: false }, { ideMode: true },
            { homeworkReview: { name: '小明', uid: 23, rid: '' } },
        ]) {
            const dom = renderToolbar(context);
            try {
                assert.equal(dom.window.document.querySelector('[data-mistake-prompt-open]'), null);
            } finally { dom.window.close(); }
        }
    });

    it('shows a separate student-specific action only for an authorized review and retains saved status', () => {
        for (const added of [false, true]) {
            const dom = renderToolbar({
                homeworkReview: { name: '小明', uid: 23, rid: '' },
                homeworkReviewMistake: { url: `${actionUrl}?tid=homework&reviewUid=23`, studentName: '小明', added },
            });
            try {
                assert.equal(dom.window.document.querySelector('[data-mistake-prompt-open]'), null);
                const button = dom.window.document.querySelector('[data-homework-review-mistake]');
                assert.ok(button);
                assert.equal(button.type, 'button');
                assert.equal(button.disabled, added);
                assert.match(button.textContent, added ? /已加入小明的错题集/ : /加入小明的错题集/);
                assert.equal(dom.window.document.querySelector('[data-global-hotkey="f10"]'), null);
            } finally { dom.window.close(); }
        }
        const dom = renderToolbar({ homeworkReviewMistake: { url: actionUrl, studentName: '小明', added: false } });
        try {
            assert.equal(dom.window.document.querySelector('[data-homework-review-mistake]'), null);
        } finally { dom.window.close(); }
    });
});

async function promptHarness({ showMistakePrompt = false } = {}) {
    const dom = new JSDOM(`${renderActions({ showMistakePrompt })}
        <button data-mistake-prompt-open aria-expanded="${String(showMistakePrompt)}" aria-controls="problem-mistake-prompt">错题集</button>
        <div class="problem-content-container"><div class="problem-content"></div></div>
        <div class="scratchpad-container" id="scratchpad"><textarea id="draft">print(42)</textarea></div>
        <button id="outside">外部</button>`, { url: pageUrl });
    const $ = jqueryFactory(dom.window);
    const context = { canUseMistake: true, showMistakePrompt, pdoc: { config: { type: 'default' } } };
    let callback;
    const nothing = () => {};
    const bindMistakeActions = load('components/mistake_actions.ts').bindMistakeActions;
    load('pages/problem_detail.page.tsx', {
        window: dom.window, document: dom.window.document, UiContext: context, console, setTimeout, URL,
    }, {
        '@hydrooj/common': { NORMAL_STATUS: [1, 2], STATUS: { STATUS_ACCEPTED: 1 }, STATUS_TEXTS: {} },
        jquery: $, react: React, 'react-dom/client': {},
        'vj/components/dialog': { InfoDialog: class {} },
        'vj/components/notification': { success: nothing, error: nothing },
        'vj/components/zipDownloader': {},
        'vj/misc/Page': { NamedPage: class { constructor(names, init) { callback = init; } } },
        'vj/utils': { request: { post: async () => ({ mistakeStatus: 'review' }) } },
        '../components/badge_ac_effect': { createBadgeAcThemePlayer: () => ({ play: nothing }) },
        '../components/contest_points': {}, '../components/homework_review_copy': {},
        '../components/homework_review_mistake': { bindHomeworkReviewMistake: nothing },
        '../components/mistake_actions': { bindMistakeActions },
        '../components/mistake_practice': { bindMistakePracticeActions: nothing },
        '../components/objective/objective': {},
        '../components/problem_record_picker': { bindProblemRecordPicker: nothing },
        '../components/record_replay_import': { prepareRecordReplayDraft: async () => {} },
    });
    await callback();
    return {
        dom, context, document: dom.window.document,
        button: dom.window.document.querySelector('[data-mistake-prompt-open]'),
        panel: dom.window.document.querySelector('.problem-mistake-float'),
        close: dom.window.document.querySelector('[data-mistake-prompt-close]'),
    };
}

describe('manual mistake prompt lifecycle', () => {
    it('dismisses an automatic prompt on Escape without taking focus or selection away from the editor', async () => {
        const h = await promptHarness({ showMistakePrompt: true });
        try {
            const draft = h.document.getElementById('draft');
            draft.focus();
            draft.setSelectionRange(2, 5);
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), false);
            draft.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), true);
            assert.equal(h.button.getAttribute('aria-expanded'), 'false');
            assert.equal(h.document.activeElement, draft, 'dismissing a background prompt must not move editor focus to the toolbar');
            assert.equal(draft.selectionStart, 2);
            assert.equal(draft.selectionEnd, 5);
            assert.equal(draft.value, 'print(42)');
        } finally { h.dom.window.close(); }
    });

    it('can reopen after close, Escape, outside click, and a previous dismissal without changing the editor', async () => {
        const h = await promptHarness();
        try {
            const draft = h.document.getElementById('draft');
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), true);
            assert.equal(h.panel.id, h.button.getAttribute('aria-controls'));
            h.button.click();
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), false);
            assert.equal(h.button.getAttribute('aria-expanded'), 'true');
            assert.equal(h.document.activeElement, h.close);
            h.close.click();
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), true);
            assert.equal(h.document.activeElement, h.button);
            h.button.click();
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), false);
            h.close.dispatchEvent(new h.dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), true);
            assert.equal(h.document.activeElement, h.button);
            h.button.click();
            h.panel.querySelector('.problem-mistake-float__title').click();
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), false, 'internal clicks must stay open');
            h.document.getElementById('outside').click();
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), true);
            h.button.click();
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), false, 'auto-prompt dismissal must not disable manual entry');
            h.button.click();
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), true, 'the manual entry also toggles closed');
            assert.equal(h.document.getElementById('draft'), draft);
            assert.equal(draft.value, 'print(42)');
            assert.equal(h.dom.window.location.href, pageUrl);
        } finally { h.dom.window.close(); }
    });

    it('guards manual opening if eligibility disappears or the page is an unauthorized review', async () => {
        const h = await promptHarness();
        try {
            h.context.canUseMistake = false;
            h.button.click();
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), true);
            h.context.canUseMistake = true;
            h.context.homeworkReview = { uid: 23 };
            h.button.click();
            assert.equal(h.panel.classList.contains('problem-mistake-float--hidden'), true);
        } finally { h.dom.window.close(); }
    });
});

function teacherHarness(post, overrides = {}) {
    const review = { name: '小明', uid: 23, rid: '6aa000000000000000000023', returnUrl: '/homework/review' };
    const context = { url: `${actionUrl}?tid=6aa000000000000000000002&reviewUid=23`, studentName: review.name, added: false, ...overrides };
    const toolbar = renderToolbar({ homeworkReview: review, homeworkReviewMistake: context });
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.join(uiRoot, 'templates')), { autoescape: true });
    const sidebar = env.render('partials/problem_sidebar_review.html', {
        UiContext: { homeworkReview: review, homeworkReviewMistake: context }, pdoc: { docId: 1002, config: { type: 'default' } },
    });
    const reviewUrl = new URL(pageUrl);
    reviewUrl.searchParams.set('reviewUid', '23');
    const dom = new JSDOM(`${sidebar}${toolbar.window.document.body.innerHTML}
        <div id="scratchpad"><textarea id="editor-draft">只读的学员代码</textarea></div>`, { url: reviewUrl.href });
    toolbar.window.close();
    const calls = [];
    const messages = { success: [], error: [] };
    const { bindHomeworkReviewMistake } = load('components/homework_review_mistake.ts');
    const dispose = bindHomeworkReviewMistake(dom.window.document, context, (url, data) => {
        calls.push({ url, data });
        return post(url, data);
    }, { success: (text) => messages.success.push(text), error: (text) => messages.error.push(text) });
    const buttons = [...dom.window.document.querySelectorAll('[data-homework-review-mistake]')];
    assert.equal(buttons.length, 2, 'the review sidebar and editor toolbar both offer the teacher action');
    const form = dom.window.document.querySelector('[data-homework-review-mistake-form]');
    return {
        dom, context, calls, messages, buttons, form,
        submit: () => form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
        cleanup: () => { dispose(); dom.window.close(); },
    };
}

describe('teacher adding the reviewed student to their mistake book', () => {
    it('uses the authorized review URL once, synchronizes both controls, and never touches the teacher draft', async () => {
        let resolve;
        const h = teacherHarness(() => new Promise((done) => { resolve = done; }));
        try {
            const document = h.dom.window.document;
            const draft = document.getElementById('editor-draft');
            const originalUrl = h.dom.window.location.href;
            h.dom.window.localStorage.setItem('teacher/problem-own-draft', '老师自己的未保存代码');
            h.buttons[1].querySelector('[data-homework-review-mistake-label]').click();
            h.submit();
            h.buttons[0].click();
            assert.equal(h.calls.length, 1);
            assert.equal(h.calls[0].url, h.context.url);
            assert.equal(new URL(h.calls[0].url, pageUrl).searchParams.get('reviewUid'), '23');
            assert.equal(new URL(h.calls[0].url, pageUrl).searchParams.get('tid'), '6aa000000000000000000002');
            assert.equal(h.calls[0].data.operation, 'add_review_mistake');
            for (const button of h.buttons) {
                assert.equal(button.disabled, true);
                assert.equal(button.getAttribute('aria-busy'), 'true');
            }
            resolve({ reviewMistakeAdded: true });
            await settle();
            assert.equal(h.context.added, true);
            for (const button of h.buttons) {
                assert.equal(button.disabled, true);
                assert.equal(button.getAttribute('aria-busy'), null);
                assert.equal(button.querySelector('[data-homework-review-mistake-label]').textContent, '已加入小明的错题集');
            }
            assert.deepEqual(h.messages.success, ['已加入「小明」的错题集']);
            h.submit();
            assert.equal(h.calls.length, 1, 'an already saved review must not send duplicate requests');
            assert.equal(document.getElementById('editor-draft'), draft);
            assert.equal(draft.value, '只读的学员代码');
            assert.equal(h.dom.window.localStorage.getItem('teacher/problem-own-draft'), '老师自己的未保存代码');
            assert.equal(h.dom.window.location.href, originalUrl);
        } finally { h.cleanup(); }
    });

    it('allows keyboard-form retry after failure and treats student names as text', async () => {
        let attempts = 0;
        const studentName = '<img src=x onerror=alert(1)> & 小明';
        const h = teacherHarness(async () => {
            if (!attempts++) throw new Error('保存失败，请重试');
            return { reviewMistakeAdded: true };
        }, { studentName });
        try {
            h.buttons[0].click();
            await settle();
            assert.equal(h.context.added, false);
            for (const button of h.buttons) assert.equal(button.disabled, false);
            assert.deepEqual(h.messages.error, ['保存失败，请重试']);
            assert.equal(h.submit(), false, 'keyboard submit remains intercepted for in-place saving');
            await settle();
            assert.equal(h.calls.length, 2);
            assert.equal(h.context.added, true);
            for (const label of h.dom.window.document.querySelectorAll('[data-homework-review-mistake-label]')) {
                assert.equal(label.textContent, `已加入${studentName}的错题集`);
                assert.equal(label.children.length, 0);
            }
            assert.equal(h.dom.window.document.querySelector('img[onerror]'), null);
        } finally { h.cleanup(); }
    });

    it('requires a confirmed success and keeps already-added records disabled', async () => {
        const h = teacherHarness(async () => ({ mistakeStatus: 'review' }));
        try {
            h.buttons[0].click();
            await settle();
            assert.equal(h.context.added, false);
            assert.equal(h.messages.success.length, 0);
            assert.match(h.messages.error[0], /确认保存结果/);
            for (const button of h.buttons) assert.equal(button.disabled, false);
        } finally { h.cleanup(); }
        const added = teacherHarness(async () => { throw new Error('must not post'); }, { added: true });
        try {
            added.buttons[0].click();
            added.submit();
            assert.equal(added.calls.length, 0);
            for (const button of added.buttons) assert.equal(button.disabled, true);
        } finally { added.cleanup(); }
    });

    it('does not bind teacher actions without server-provided review authorization', () => {
        const dom = new JSDOM('<button data-homework-review-mistake>伪造的按钮</button>');
        try {
            let posts = 0;
            const { bindHomeworkReviewMistake } = load('components/homework_review_mistake.ts');
            const dispose = bindHomeworkReviewMistake(dom.window.document, undefined, async () => { posts += 1; }, {});
            dom.window.document.querySelector('button').click();
            assert.equal(posts, 0);
            dispose();
        } finally { dom.window.close(); }
    });
});
