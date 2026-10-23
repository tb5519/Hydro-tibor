const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'packages/ui-default/templates/user_detail.html'), 'utf8');
const sectionStart = template.indexOf('    {% if acDifficulty %}');
const sectionEnd = template.indexOf('    {% endif %}', template.indexOf('</section>', sectionStart));
assert.ok(sectionStart >= 0 && sectionEnd > sectionStart, 'profile contains the difficulty card');
const section = template.slice(sectionStart, sectionEnd + '    {% endif %}'.length);
const env = new nunjucks.Environment(null, { autoescape: true, throwOnUndefined: true });
const moduleFixture = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.join(root, 'packages/hydrooj/src/lib/profile_ac_difficulty.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: moduleFixture, exports: moduleFixture.exports });

function render(problems) {
    const acDifficulty = moduleFixture.exports.getProfileAcDifficulty(problems);
    const html = env.renderString(section, { acDifficulty });
    const dom = new JSDOM(html);
    return { html, document: dom.window.document, close: () => dom.window.close() };
}

describe('profile AC difficulty card rendering', () => {
    it('renders ten distinct level counts, current AC total and highest solved difficulty', () => {
        const problems = [];
        for (let difficulty = 1; difficulty <= 10; difficulty++) {
            for (let count = 0; count < difficulty; count++) {
                problems.push({ domainId: 'python', docId: problems.length + 1, difficulty });
            }
        }
        // Duplicate accepted metadata must not inflate either the rows or total.
        problems.push(problems[0]);
        const page = render(problems);
        const rows = [...page.document.querySelectorAll('ol li')];
        assert.equal(rows.length, 10);
        rows.forEach((row, index) => {
            const level = index + 1;
            assert.equal(row.querySelector('[class$="__level"]').textContent, `${level}`);
            assert.equal(row.querySelector('[class$="__count"]').textContent, `${level}题`);
            assert.equal(row.querySelector('[class$="__track"] > span').style.width, `${level * 10}%`);
        });
        assert.equal(page.document.querySelector('[class$="__total"] strong').textContent, '55');
        assert.equal(page.document.querySelector('[class$="__highest"] strong').textContent, '10');
        assert.equal(page.document.querySelector('[class$="__unrated"]'), null);
        page.close();
    });

    it('separates ungraded ACs from level one and keeps bar widths relative to the largest level', () => {
        const page = render([
            { domainId: 'python', docId: 1, difficulty: 6 },
            { domainId: 'python', docId: 2, difficulty: 6 },
            { domainId: 'python', docId: 3, difficulty: 9 },
            { domainId: 'python', docId: 4 },
            { domainId: 'python', docId: 5, difficulty: 0 },
        ]);
        const rows = [...page.document.querySelectorAll('ol li')];
        assert.equal(page.document.querySelector('[class$="__total"] strong').textContent, '5');
        assert.equal(rows[0].querySelector('[class$="__count"]').textContent, '0题');
        assert.equal(rows[5].querySelector('[class$="__track"] > span').style.width, '100%');
        assert.equal(rows[8].querySelector('[class$="__track"] > span').style.width, '50%');
        assert.equal(page.document.querySelector('[class$="__unrated"] strong').textContent, '2');
        assert.match(page.document.querySelector('[class$="__footnote"]').textContent, /当前设置的难度/);
        page.close();
    });

    it('shows a useful empty state with all zero counts and no invalid numerical widths', () => {
        const page = render([]);
        assert.equal(page.document.querySelector('[class$="__total"] strong').textContent, '0');
        assert.equal(page.document.querySelector('[class$="__highest"]'), null);
        assert.match(page.document.querySelector('[class$="__summary-note"]').textContent, /第一道挑战/);
        assert.match(page.document.querySelector('[class$="__footnote"]').textContent, /还没有 AC 记录/);
        for (const row of page.document.querySelectorAll('ol li')) {
            assert.equal(row.querySelector('[class$="__count"]').textContent, '0题');
            assert.equal(row.querySelector('[class$="__track"] > span').style.width, '0%');
        }
        assert.doesNotMatch(page.html, /NaN|Infinity|undefined/);
        page.close();
    });

    it('distinguishes existing ungraded ACs from a never-solved profile', () => {
        const page = render([{ domainId: 'python', docId: 1, difficulty: 0 }]);
        assert.equal(page.document.querySelector('[class$="__highest"]'), null);
        assert.match(page.document.querySelector('[class$="__summary-note"]').textContent, /题目暂未设置难度/);
        assert.equal(page.document.querySelector('[class$="__unrated"] strong').textContent, '1');
        assert.doesNotMatch(page.document.querySelector('[class$="__footnote"]').textContent, /还没有 AC/);
        page.close();
    });

    it('renders large counts faithfully and never interpolates problem metadata into HTML or inline styles', () => {
        const problems = Array.from({ length: 10001 }, (_, index) => ({
            domainId: 'python', docId: index + 1, difficulty: 2,
            title: '<img src=x onerror=alert(1)>', tag: ['<script>alert(1)</script>'],
        }));
        problems.push({ domainId: 'python', docId: 20000, difficulty: '1; color:red; --evil:<script>' });
        const page = render(problems);
        assert.equal(page.document.querySelector('[class$="__total"] strong').textContent, '10002');
        assert.equal(page.document.querySelector('[data-level="2"] [class$="__count"]').textContent, '10001题');
        assert.equal(page.document.querySelector('[data-level="2"] [class$="__track"] > span').getAttribute('style'), 'width: 100%');
        assert.equal(page.document.querySelector('[class$="__unrated"] strong').textContent, '1');
        assert.equal(page.document.querySelectorAll('script, img, [onerror]').length, 0);
        assert.doesNotMatch(page.html, /evil|color:red|alert\(1\)/);
        page.close();
    });

    it('labels difficulty numbers without school-grade or editor-level terminology in every state', () => {
        const states = [
            [],
            [{ domainId: 'python', docId: 1, difficulty: 10 }],
            [{ domainId: 'python', docId: 1, difficulty: 0 }],
        ];
        for (const problems of states) {
            const page = render(problems);
            assert.doesNotMatch(page.document.body.textContent, /级|Lv\./);
            const unrated = page.document.querySelector('[class$="__unrated"]');
            if (unrated) assert.match(unrated.textContent, /未设置难度/);
            page.close();
        }
    });
});
