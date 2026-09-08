const assert = require('node:assert/strict');
const path = require('node:path');
const { describe, it } = require('node:test');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');
const postcss = require('postcss');

class LayoutLoader extends nunjucks.Loader {
    getSource(name) {
        if (name !== 'layout/basic.html') return null;
        return {
            src: '<!doctype html><html><body>{% block content %}{% endblock %}</body></html>',
            path: 'test/layout/basic.html',
            noCache: true,
        };
    }
}

function createEnvironment() {
    const env = new nunjucks.Environment([
        new LayoutLoader(),
        new nunjucks.FileSystemLoader(path.resolve(__dirname, '../packages/ui-default/templates'), { noCache: true }),
    ], { autoescape: true, throwOnUndefined: true });
    env.addGlobal('_', (value) => (value === 'problem_mistake' ? '错题集' : value));
    env.addGlobal('typeof', (value) => typeof value);
    env.addGlobal('set', (target, key, value) => {
        target[key] = value;
        return '';
    });
    env.addGlobal('datetimeSpan', () => '<time datetime="2026-09-08T12:00:00Z">2026-09-08</time>');
    env.addGlobal('paginate', (page) => [['current', page], ['next', page + 1]]);
    env.addGlobal('url', (route, options = {}) => {
        const routes = {
            problem_mistake: '/d/class-a/mistakes',
            problem_detail: `/d/class-a/p/${encodeURIComponent(options.pid)}`,
            problem_main: '/d/class-a/p',
            record_detail: `/d/class-a/record/${encodeURIComponent(options.rid)}`,
        };
        return `${routes[route]}${options.query ? `?${new URLSearchParams(options.query)}` : ''}`;
    });
    return env;
}

function context(overrides = {}) {
    return {
        mcount: 31,
        mdocs: [
            { pid: 1, status: 'review', importance: 5, practiceToken: 'fresh-token', updatedAt: new Date() },
            { pid: 2, status: 'review', importance: 2, practiceToken: 'used-token', deepenedPracticeToken: 'used-token', updatedAt: new Date() },
            { pid: 3, status: 'review', updatedAt: new Date() },
            { pid: 4, status: 'mastered', importance: 3, updatedAt: new Date() },
        ],
        pdict: Object.fromEntries([1, 2, 3, 4].map((pid) => [pid, {
            docId: pid,
            pid: `P${pid}`,
            title: `练习题 ${pid}`,
            tag: ['Python 语法', '循环'],
        }])),
        psdict: { 1: { rid: 'record-1', status: 2, score: 30 }, 2: { rid: 'record-2', status: 1, score: 100 } },
        model: { builtin: {
            STATUS_CODES: { 1: 'pass', 2: 'fail' },
            STATUS_TEXTS: { 1: 'Accepted', 2: 'Wrong Answer' },
        } },
        STATUS: { STATUS_JUDGING: 20 },
        utils: {
            status: { getScoreColor: () => '#aa7700' },
            buildQueryString: (query) => new URLSearchParams(query).toString(),
        },
        status: 'review',
        page: 2,
        ppcount: 4,
        ...overrides,
    };
}

function render(overrides, executeScript = false) {
    const html = createEnvironment().render('problem_mistake.html', context(overrides));
    return new JSDOM(html, { url: 'http://localhost/d/class-a/mistakes', ...(executeScript ? { runScripts: 'dangerously' } : {}) });
}

function formFor(card, operation) {
    return card.querySelector(`input[name="operation"][value="${operation}"]`)?.closest('form');
}

describe('mistake book template', () => {
    it('renders actual problem, record and paginator macros, preserving the supplied priority order', () => {
        const document = render().window.document;
        const cards = [...document.querySelectorAll('.mistake-card')];
        assert.deepEqual(cards.map((card) => card.dataset.mistakePid), ['1', '2', '3', '4']);
        assert.deepEqual(cards.map((card) => card.querySelector('.mistake-importance__value').textContent.trim()), ['5', '2', '1', '3']);
        assert.equal(cards[0].querySelector('.mistake-problem__title a').getAttribute('href'), '/d/class-a/p/P1');
        assert.equal(cards[0].querySelector('.problem__tag-link').textContent, 'Python 语法');
        assert.equal(cards[0].querySelector('.record-status--text').getAttribute('href'), '/d/class-a/record/record-1');
        assert.match(cards[0].querySelector('.mistake-record').textContent, /30\s+Wrong Answer/);
        assert.match(cards[1].querySelector('.mistake-record').textContent, /100\s+Accepted/);
        assert.equal(document.querySelector('.mistake-book__count strong').textContent, '31');
        assert.equal(document.querySelectorAll('.pager').length, 2);
        assert.ok(document.querySelector('.mistake-problem__updated time'));
        assert.match(cards[2].textContent, /暂无提交记录/);
    });

    it('starts every retry through POST instead of linking to a persisted scratchpad', () => {
        const document = render().window.document;
        for (const card of document.querySelectorAll('.mistake-card')) {
            const form = formFor(card, 'start_mistake_practice');
            assert.equal(form.method, 'post');
            assert.match(form.getAttribute('action'), /^\/d\/class-a\/p\/P\d$/);
            assert.equal(form.querySelector('button').type, 'submit');
            assert.match(form.querySelector('button').title, /空白代码/);
        }
        assert.equal(document.querySelectorAll('a[href*="scratchpad"]').length, 0);
        assert.match(document.querySelector('.mistake-book__help').textContent, /每轮练习可加深标记一次/);
    });

    it('allows one deepen per token and clearly distinguishes unused, used and not-started rounds', () => {
        const cards = [...render().window.document.querySelectorAll('.mistake-card')];
        const fresh = formFor(cards[0], 'deepen_mistake');
        assert.equal(fresh.method, 'post');
        assert.equal(fresh.querySelector('[name="practiceToken"]').value, 'fresh-token');
        assert.equal(fresh.querySelector('button').disabled, false);
        assert.match(fresh.querySelector('button').textContent, /加深标记/);
        const used = formFor(cards[1], 'deepen_mistake');
        assert.equal(used.querySelector('button').disabled, true);
        assert.match(used.querySelector('button').textContent, /本轮已加深/);
        assert.match(cards[1].textContent, /下次练习后可再次加深/);
        assert.equal(formFor(cards[2], 'deepen_mistake'), undefined);
        assert.match(cards[2].textContent, /重新练习后可加深标记/);
        assert.ok(formFor(cards[0], 'master_mistake'));
        assert.equal(formFor(cards[3], 'master_mistake'), undefined);
        assert.equal(formFor(cards[3], 'deepen_mistake'), undefined);
    });

    it('allows a mastered problem to be deepened after explicitly starting another practice', () => {
        const original = context();
        original.mdocs[3].practiceToken = 'new-mastered-practice';
        const document = render(original).window.document;
        const card = document.querySelector('[data-mistake-pid="4"]');
        assert.equal(formFor(card, 'deepen_mistake').querySelector('button').disabled, false);
        assert.ok(card.classList.contains('mistake-card--mastered'));
    });

    it('renders legacy missing, zero and negative importance as one and keeps large importance readable', () => {
        const original = context();
        for (const [index, mdoc] of original.mdocs.entries()) {
            mdoc.importance = [undefined, 0, -5, 12345][index];
        }
        const document = render(original).window.document;
        assert.deepEqual([...document.querySelectorAll('.mistake-importance__value')].map((el) => el.textContent.trim()), ['1', '1', '1', '12345']);
        assert.equal(document.querySelectorAll('.mistake-card--important').length, 1);
    });

    it('preserves selected status and pagination filter, using total count instead of current page length', () => {
        for (const status of ['review', 'mastered', 'all']) {
            const document = render({ status, mcount: 86 }).window.document;
            const active = document.querySelector('.mistake-book__tab.active');
            assert.equal(active.getAttribute('aria-current'), 'page');
            assert.equal(active.textContent, { review: '待复盘', mastered: '已掌握', all: '全部' }[status]);
            assert.equal(document.querySelector('.mistake-book__count strong').textContent, '86');
            const next = new URL(document.querySelector('.pager-top a.next').href);
            assert.equal(next.searchParams.get('page'), '3');
            assert.equal(next.searchParams.get('status'), status === 'review' ? '' : status);
        }
    });

    it('provides useful empty states without retry or deepen actions', () => {
        for (const status of ['review', 'mastered', 'all']) {
            const document = render({ status, mdocs: [], mcount: 0 }).window.document;
            assert.equal(document.querySelectorAll('.mistake-card, form[data-mistake-action], .pager').length, 0);
            assert.equal(document.querySelector('.mistake-book__count strong').textContent, '0');
            assert.equal(document.querySelector('.mistake-book__empty a').getAttribute('href'), '/d/class-a/p');
            assert.match(document.querySelector('.mistake-book__empty p').textContent, status === 'mastered' ? /标记为“已掌握”/ : /加入错题集/);
        }
    });

    it('escapes problem names, tags, tokens and custom problem identifiers', () => {
        const original = context();
        const payload = '"><img src=x onerror="window.bad=true">';
        original.pdict[1].title = payload;
        original.pdict[1].tag = [payload];
        original.pdict[1].pid = payload;
        original.mdocs[0].practiceToken = payload;
        const document = render(original).window.document;
        const card = document.querySelector('[data-mistake-pid="1"]');
        assert.equal(card.querySelectorAll('img, [onerror]').length, 0);
        assert.ok(card.querySelector('.mistake-problem__title').textContent.includes(payload));
        assert.equal(card.querySelector('.problem__tag-link').textContent, payload);
        assert.equal(formFor(card, 'deepen_mistake').querySelector('[name="practiceToken"]').value, payload);
        assert.equal(formFor(card, 'start_mistake_practice').getAttribute('action'), `/d/class-a/p/${encodeURIComponent(payload)}`);
    });

    it('prevents double submissions and restores only temporarily disabled buttons on back navigation', () => {
        const dom = render(undefined, true);
        const { document, Event } = dom.window;
        const fresh = formFor(document.querySelector('[data-mistake-pid="1"]'), 'deepen_mistake');
        const used = formFor(document.querySelector('[data-mistake-pid="2"]'), 'deepen_mistake');
        assert.equal(fresh.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), true);
        assert.equal(fresh.querySelector('button').disabled, true);
        assert.equal(fresh.getAttribute('aria-busy'), 'true');
        assert.equal(new dom.window.FormData(fresh).get('practiceToken'), 'fresh-token');
        assert.equal(new dom.window.FormData(fresh).get('operation'), 'deepen_mistake');
        assert.equal(fresh.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), false);
        dom.window.dispatchEvent(new Event('pageshow'));
        assert.equal(fresh.querySelector('button').disabled, false);
        assert.equal(fresh.getAttribute('aria-busy'), null);
        assert.equal(used.querySelector('button').disabled, true);
        assert.equal(fresh.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })), true);
        dom.window.close();
    });

    it('uses scoped responsive cards without the old wide mobile table or new image requests', () => {
        const document = render().window.document;
        const style = document.querySelector('style').textContent;
        const css = postcss.parse(style);
        const mediaQueries = [];
        css.walkAtRules('media', (rule) => mediaQueries.push(rule.params));
        assert.ok(mediaQueries.includes('(max-width: 40em)'));
        assert.ok(mediaQueries.includes('(prefers-reduced-motion: reduce)'));
        assert.doesNotMatch(style, /min-width:\s*840px|url\(/);
        assert.match(style, /\.mistake-action\s*\{[^}]*grid-column:\s*1 \/ -1/);
        assert.match(style, /:focus-visible/);
        assert.equal(document.querySelectorAll('img').length, 0);
    });
});
