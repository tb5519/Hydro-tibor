const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const esbuild = require('esbuild');
const nunjucks = require('nunjucks');

const root = path.resolve(__dirname, '..');
const templates = path.join(root, 'packages/ui-default/templates');

function loadHelper() {
    const source = fs.readFileSync(path.join(root, 'packages/ui-default/backendlib/problem-activity.ts'), 'utf8');
    const compiled = esbuild.transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2022' }).code;
    const module = { exports: {} };
    vm.runInNewContext(compiled, { module, exports: module.exports, Math, Number, String });
    return module.exports;
}

const activity = loadHelper();

describe('problem activity display', () => {
    it('targets only the established Python/C++ banks and local fixture ids', () => {
        for (const domain of [
            { _id: 'system', name: 'Python' },
            { _id: 'SYSTEM', name: '编程训练' },
            { _id: 'C0001', name: 'C++题库' },
            { _id: 'C0001', name: 'A renamed bank' },
            { _id: 'python', name: 'Development' },
            { _id: 'CPP', name: 'Development' },
        ]) assert.equal(activity.isSeededActivityDomain(domain), true, JSON.stringify(domain));

        for (const domain of [
            { _id: 'teacher-python', name: 'Python' },
            { _id: 'cpp', name: 'Scratch', domainType: 'scratch' },
            null,
        ]) assert.equal(activity.isSeededActivityDomain(domain), false, JSON.stringify(domain));
    });

    it('adds stable in-range boosts without mutating real statistics', () => {
        const domain = { _id: 'system', name: 'Python' };
        const problem = { docId: 1001, nSubmit: 2, nAccept: 1 };
        const snapshot = { ...problem };
        const first = activity.getProblemActivityDisplay(domain, problem);
        const second = activity.getProblemActivityDisplay(domain, problem);

        assert.deepEqual(first, second);
        assert.deepEqual({ ...first }, { nSubmit: 12, nAccept: 7, seeded: true });
        assert.deepEqual(problem, snapshot);
        assert.equal(first.seeded, true);
        assert.ok(first.nSubmit - problem.nSubmit >= 10 && first.nSubmit - problem.nSubmit <= 30);
        assert.ok(first.nAccept - problem.nAccept >= 3 && first.nAccept - problem.nAccept <= 9);
        assert.ok(first.nAccept < first.nSubmit);
    });

    it('keeps every valid low-count pair within the requested ranges and strictly ordered', () => {
        const domain = { _id: 'C0001', name: 'C++' };
        for (let docId = 1; docId <= 50; docId++) {
            for (let nSubmit = 0; nSubmit < 10; nSubmit++) {
                for (let nAccept = 0; nAccept <= nSubmit; nAccept++) {
                    const display = activity.getProblemActivityDisplay(domain, { docId, nSubmit, nAccept });
                    assert.ok(display.nSubmit - nSubmit >= 10 && display.nSubmit - nSubmit <= 30);
                    assert.ok(display.nAccept - nAccept >= 3 && display.nAccept - nAccept <= 9);
                    assert.ok(display.nAccept < display.nSubmit);
                }
            }
        }
    });

    it('leaves non-target and established activity real, while safely bounding corrupt low counts', () => {
        assert.deepEqual(
            { ...activity.getProblemActivityDisplay({ _id: 'other', name: 'Other' }, { docId: 1, nSubmit: 2, nAccept: 1 }) },
            { nSubmit: 2, nAccept: 1, seeded: false },
        );
        assert.deepEqual(
            { ...activity.getProblemActivityDisplay({ _id: 'system', name: 'Python' }, { docId: 1, nSubmit: 10, nAccept: 8 }) },
            { nSubmit: 10, nAccept: 8, seeded: false },
        );
        const corrupt = activity.getProblemActivityDisplay(
            { _id: 'system', name: 'Python' }, { docId: 1, nSubmit: 0, nAccept: 999 },
        );
        assert.equal(corrupt.seeded, true);
        assert.equal(corrupt.nAccept, corrupt.nSubmit - 1);
    });

    it('renders seeded counts as plain numbers', () => {
        const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templates), { autoescape: true });
        const source = `{% set display = lib.problemActivity(domain, pdoc) %}
          <span>{{ display.nAccept }} / {{ display.nSubmit }}</span>`;
        const seeded = env.renderString(source, {
            lib: { problemActivity: activity.getProblemActivityDisplay },
            domain: { _id: 'system', name: 'Python' },
            pdoc: { docId: 3, nSubmit: 1, nAccept: 1 },
        });
        assert.match(seeded, /<span>\d+ \/ \d+<\/span>/);
        assert.doesNotMatch(seeded, /problem-activity-seeded|初始活跃度|icon-info/);
    });

    it('wires all requested surfaces while retaining real-count difficulty inputs', () => {
        const files = [
            'partials/problem_list.html',
            'problem_detail.html',
            'partials/problem-sidebar-information.html',
            'partials/training_detail.html',
        ];
        const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templates), { autoescape: true });
        for (const file of files) {
            const source = fs.readFileSync(path.join(templates, file), 'utf8');
            assert.match(source, /lib\.problemActivity\(handler\.domain, pdoc\)/, file);
            assert.doesNotMatch(source, /problemActivity\.marker|problem-activity-seeded|初始活跃度/, file);
            assert.match(source, /lib\.difficulty\(pdoc\.nSubmit, pdoc\.nAccept\)/, file);
            assert.doesNotThrow(() => env.getTemplate(file), file);
        }
        const templateBackend = fs.readFileSync(path.join(root, 'packages/ui-default/backendlib/template.ts'), 'utf8');
        assert.match(templateBackend, /problemActivity:\s*getProblemActivityDisplay/);
    });
});
