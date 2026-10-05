import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { describe, it } from 'node:test';
import { STATUS } from '@hydrooj/common';
import { judge } from '../../hydrojudge/src/judge/objective';
import {
    buildObjectivePaper, objectiveConfig, objectiveContent, ObjectivePaper, ObjectiveQuestion,
    parseObjective, parseObjectivePaper, parseObjectiveTags, rewriteObjectiveFiles,
} from '../src/lib/objective';
import { parseConfig } from '../src/lib/testdataConfig';

const single: ObjectiveQuestion = {
    version: 1,
    kind: 'single',
    stem: '下面哪种结构用于重复执行代码？',
    options: ['循环结构', '顺序结构', '选择结构'],
    answers: ['A'],
    analysis: '通过循环可以重复执行相同的代码块。',
};

function parse(changes: Record<string, unknown> = {}) {
    return parseObjective(JSON.stringify({ ...single, ...changes }));
}

async function score(question: ObjectiveQuestion, answer: string) {
    let result: any;
    await judge({
        config: load(objectiveConfig(question)),
        code: { content: Buffer.from(answer) },
        next: () => {},
        end: (value) => { result = value; },
    } as any);
    return result;
}

describe('objective authoring validation', () => {
    it('normalizes text, line endings and answer order', () => {
        const question = parse({ kind: 'multiple', stem: '  first\r\nsecond  ', answers: ['C', 'A'] });
        assert.equal(question.stem, 'first\nsecond');
        assert.deepEqual(question.answers, ['A', 'C']);
    });

    it('uses fixed labels for true/false questions', () => {
        assert.deepEqual(parse({ kind: 'judge', options: [], answers: ['B'] }).options, ['正确', '错误']);
    });

    it('does not retain unknown fields from submitted JSON', () => {
        assert.equal('config' in parse({ config: { type: 'remote_judge' } }), false);
    });

    for (const [name, changes] of Object.entries({
        'unsupported version': { version: 2 },
        'unknown kind': { kind: 'essay' },
        'empty stem': { stem: '   ' },
        'non-text stem': { stem: 123 },
        'too few options': { options: ['A'] },
        'too many options': { options: Array.from({ length: 9 }, (_, index) => `${index}`) },
        'blank option': { options: ['A', '  '] },
        'duplicate option': { options: ['A', ' A '] },
        'non-text option': { options: ['A', { text: 'B' }] },
        'missing answer': { answers: [] },
        'multiple answers on single choice': { answers: ['A', 'B'] },
        'single answer on multiple choice': { kind: 'multiple', answers: ['A'] },
        'duplicate answers': { kind: 'multiple', answers: ['A', 'A'] },
        'answer outside option range': { answers: ['D'] },
        'non-text answer': { answers: [1] },
        'invalid true/false answer': { kind: 'judge', answers: ['C'] },
        'oversized stem': { stem: 'x'.repeat(20001) },
        'oversized option': { options: ['A', 'x'.repeat(4001)] },
        'oversized analysis': { analysis: 'x'.repeat(20001) },
        'extra input in stem': { stem: 'Question {{ select(2) }}' },
        'extra input in option': { options: ['A', '{{ multiselect(2) }}'] },
    })) {
        it(`rejects ${name}`, () => assert.throws(() => parse(changes), { name: 'ValidationError' }));
    }

    it('rejects malformed or oversized JSON', () => {
        for (const source of ['{', 'null', '[]', 'x'.repeat(65536)]) {
            assert.throws(() => parseObjective(source), { name: 'ValidationError' });
        }
    });

    it('requires useful knowledge tags and de-duplicates them', () => {
        assert.deepEqual(parseObjectiveTags([' 循环 ', '', '循环', 'Python']), ['循环', 'Python']);
        assert.throws(() => parseObjectiveTags([' ', '']), { name: 'ValidationError' });
        assert.throws(() => parseObjectiveTags(['x'.repeat(41)]), { name: 'ValidationError' });
        assert.throws(() => parseObjectiveTags(Array.from({ length: 21 }, (_, index) => `tag${index}`)), { name: 'ValidationError' });
    });
});

describe('objective content and answer privacy', () => {
    it('generates the existing answer control followed by one list item per option', () => {
        const content = objectiveContent(parse({ options: ['first\n\nparagraph', 'second'] }));
        assert.match(content, /\{\{ select\(1\) \}\}\n\n- first\n {2}\n {2}paragraph\n- second\n$/);
        assert.equal(content.includes(single.analysis), false);
        assert.equal(content.includes('answers'), false);
    });

    it('selects checkbox controls for multiple choice', () => {
        assert.match(objectiveContent(parse({ kind: 'multiple', answers: ['A', 'C'] })), /\{\{ multiselect\(1\) \}\}/);
    });

    it('keeps the answer key out of public parsed configuration', async () => {
        const raw = objectiveConfig(single);
        assert.deepEqual(load(raw), { type: 'objective', answers: { 1: ['A', 100] } });
        const publicConfig = await parseConfig(raw, ['config.yaml']);
        assert.equal(publicConfig.type, 'objective');
        assert.equal(publicConfig.count, 1);
        assert.equal('answers' in publicConfig, false);
        assert.equal('analysis' in publicConfig, false);
    });
});

describe('compatibility with the objective judge', () => {
    it('grades single choice with 100 points or zero', async () => {
        assert.equal((await score(single, '1: A')).score, 100);
        assert.equal((await score(single, '1: B')).score, 0);
        assert.equal((await score(single, '1: B')).status, STATUS.STATUS_WRONG_ANSWER);
    });

    it('grades multiple choice independent of selection order and preserves existing partial credit', async () => {
        const question = parse({ kind: 'multiple', answers: ['A', 'C'] });
        assert.equal((await score(question, '1: [C, A]')).score, 100);
        assert.equal((await score(question, '1: [A]')).score, 50);
        assert.equal((await score(question, '1: [A, B]')).score, 0);
        assert.equal((await score(question, '1: [C, A]')).status, STATUS.STATUS_ACCEPTED);
    });

    it('grades true/false using the fixed A/B mapping', async () => {
        const question = parse({ kind: 'judge', answers: ['B'] });
        assert.equal((await score(question, '1: B')).score, 100);
        assert.equal((await score(question, '1: A')).score, 0);
        assert.equal((await score(question, '{}')).score, 0);
    });
});

describe('objective paper assembly', () => {
    const paper: ObjectivePaper = {
        version: 1,
        items: [
            { sourceId: 30, score: 20, title: 'source title', tags: ['循环'], objective: single },
            { sourceId: 12, score: 50, title: 'multiple', tags: ['Python'], objective: parse({ kind: 'multiple', answers: ['A', 'C'] }) },
            { sourceId: 90, score: 30, title: 'judge', tags: ['基础'], objective: parse({ kind: 'judge', answers: ['B'] }) },
        ],
    };

    it('preserves teacher-selected order and strips extra request fields', () => {
        assert.deepEqual(parseObjectivePaper(JSON.stringify({
            version: 1, answers: ['spoofed'], items: [{ id: 20, score: 30, objective: single }, { id: 2, score: 70 }],
        })), { version: 1, items: [{ id: 20, score: 30 }, { id: 2, score: 70 }] });
    });

    for (const [name, changes] of Object.entries({
        'unknown version': { version: 2 },
        'no items': { items: [] },
        'too many items': { items: Array.from({ length: 101 }, (_, index) => ({ id: index + 1, score: 1 })) },
        'duplicate source IDs': { items: [{ id: 2, score: 50 }, { id: 2, score: 50 }] },
        'string source ID': { items: [{ id: '2', score: 10 }] },
        'nonpositive source ID': { items: [{ id: 0, score: 10 }] },
        'fractional source ID': { items: [{ id: 2.5, score: 10 }] },
        'unsafe source ID': { items: [{ id: Number.MAX_SAFE_INTEGER + 1, score: 10 }] },
        'string score': { items: [{ id: 2, score: '10' }] },
        'zero score': { items: [{ id: 2, score: 0 }] },
        'oversized score': { items: [{ id: 2, score: 101 }] },
        'fractional score': { items: [{ id: 2, score: 1.5 }] },
        'excess total score': { items: Array.from({ length: 11 }, (_, index) => ({ id: index + 1, score: 100 })) },
        'null item': { items: [null] },
    })) {
        it(`rejects ${name}`, () => assert.throws(() => parseObjectivePaper(JSON.stringify({
            version: 1, items: [{ id: 1, score: 100 }], ...changes,
        })), { name: 'ValidationError' }));
    }

    it('rejects malformed paper data', () => {
        for (const value of ['{', 'null', '[]', 'x'.repeat(20001)]) {
            assert.throws(() => parseObjectivePaper(value), { name: 'ValidationError' });
        }
    });

    it('numbers controls uniquely and does not publish private titles, keys or analysis', async () => {
        const built = buildObjectivePaper(paper, '完成下面三道题。');
        assert.ok(built.content.startsWith('完成下面三道题。'));
        assert.match(built.content, /第 1 题 · 单选题（20 分）/);
        assert.match(built.content, /\{\{ select\(1\) \}\}/);
        assert.match(built.content, /\{\{ multiselect\(2\) \}\}/);
        assert.match(built.content, /\{\{ select\(3\) \}\}/);
        assert.equal(built.content.includes(single.analysis), false);
        assert.equal(built.content.includes('source title'), false);
        assert.equal(built.content.includes('answers'), false);
        assert.deepEqual(load(built.config), { type: 'objective', answers: { 1: ['A', 20], 2: [['A', 'C'], 50], 3: ['B', 30] } });
        const publicConfig = await parseConfig(built.config, ['config.yaml']);
        assert.equal(publicConfig.count, 3);
        assert.equal('answers' in publicConfig, false);
    });

    it('grades all question kinds with teacher-configured weights and existing partial credit', async () => {
        const built = buildObjectivePaper(paper);
        let result: any;
        const grade = async (submission: string) => {
            await judge({
                config: load(built.config), code: { content: Buffer.from(submission) },
                next: () => {}, end: (value) => { result = value; },
            } as any);
            return result.score;
        };
        assert.equal(await grade('1: A\n2: [C, A]\n3: B'), 100);
        assert.equal(await grade('1: A\n2: [A]\n3: B'), 75);
        assert.equal(await grade('1: B\n2: [A, B]\n3: A'), 0);
    });

    it('prevents answer controls in the optional introduction', () => {
        assert.throws(() => buildObjectivePaper(paper, 'Extra {{ select(42) }}'), { name: 'ValidationError' });
        assert.throws(() => buildObjectivePaper(paper, 'x'.repeat(20001)), { name: 'ValidationError' });
    });

    it('rewrites statement asset names without publishing analysis assets or changing the source', () => {
        const original = parse({
            stem: '![图](file://%E5%BE%AA%E7%8E%AF.png?width=200)',
            options: ['![同图](file://%E5%BE%AA%E7%8E%AF.png)', '![另一图](file://second.png)'],
            analysis: '![解答](file://private-answer.png)',
        });
        const filenames: string[] = [];
        const rewritten = rewriteObjectiveFiles(original, (filename) => {
            filenames.push(filename);
            return `q1-${filename}`;
        });
        assert.deepEqual(filenames, ['循环.png', '循环.png', 'second.png']);
        assert.equal(rewritten.stem, '![图](file://q1-%E5%BE%AA%E7%8E%AF.png?width=200)');
        assert.equal(rewritten.analysis, original.analysis);
        assert.ok(original.stem.startsWith('![图](file://%E5%BE%AA'));
        assert.equal(objectiveContent(rewritten).includes('private-answer'), false);
    });

    it('rejects invalid or traversing statement attachment references', () => {
        for (const name of ['%zz.png', '../private.png', '..%2fprivate.png', '..%5cprivate.png', '%00.png', '?x=1']) {
            assert.throws(() => rewriteObjectiveFiles(parse({ stem: `![图](file://${name})` }), (value) => value), { name: 'ValidationError' });
        }
    });
});
