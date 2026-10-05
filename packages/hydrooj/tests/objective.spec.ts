import assert from 'node:assert/strict';
import { load } from 'js-yaml';
import { describe, it } from 'node:test';
import { STATUS } from '@hydrooj/common';
import { judge } from '../../hydrojudge/src/judge/objective';
import {
    objectiveConfig, objectiveContent, ObjectiveQuestion, parseObjective, parseObjectiveTags,
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
