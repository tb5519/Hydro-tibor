const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const mod = { exports: {} };
vm.runInNewContext(transformSync(fs.readFileSync(path.resolve(__dirname, '../packages/hydrooj/src/lib/scratch_review.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code, { module: mod, exports: mod.exports });
const { submissionReviewStatus: status, submissionFullyCorrect: fullyCorrect } = mod.exports;
const reviewed = (extra = {}) => ({ reviewedAt: new Date(100), grade: null, ...extra });

describe('Scratch submission review result compatibility', () => {
    it('keeps unreviewed submissions pending even when stray grades or result fields exist', () => {
        for (const submission of [undefined, null, {}, { grade: '未完成' },
            { reviewedAt: null, reviewStatus: 'changes_requested' }, { reviewedAt: null, grade: '优秀', reviewStatus: 'accepted' }]) {
            assert.equal(status(submission), null);
        }
    });

    it('restores legacy unfinished review results without altering stored submissions', () => {
        for (const grade of ['未完成', '需修改', '需要修改', '待修改', '不合格', '不通过']) {
            const submission = reviewed({ grade });
            const before = { ...submission };
            assert.equal(status(submission), 'changes_requested', grade);
            assert.deepEqual(submission, before);
        }
    });

    it('recognizes exact legacy labels surrounded by ordinary or fullwidth spaces', () => {
        for (const grade of [' 未完成 ', '\t需要修改\n', '　不通过　']) {
            assert.equal(status(reviewed({ grade })), 'changes_requested', JSON.stringify(grade));
        }
    });

    it('keeps ordinary positive, numeric and empty legacy evaluations completed without granting AC', () => {
        for (const grade of ['优秀', '完成', '已完成', '通过', '继续加油', '95 分', '0', '', null, undefined]) {
            assert.equal(status(reviewed({ grade })), 'completed', String(grade));
        }
    });

    it('uses the explicit review result ahead of the freeform grade', () => {
        assert.equal(status(reviewed({ reviewStatus: 'accepted', grade: '未完成' })), 'accepted');
        assert.equal(status(reviewed({ reviewStatus: 'changes_requested', grade: '优秀' })), 'changes_requested');
        assert.equal(status(reviewed({ reviewStatus: 'changes_requested', grade: null })), 'changes_requested');
        assert.equal(status(reviewed({ reviewStatus: 'completed', grade: '100分' })), 'completed');
        assert.equal(status(reviewed({ reviewStatus: 'completed', grade: '未完成' })), 'completed');
    });

    it('does not treat fragments of grade prose as a request for changes', () => {
        for (const grade of ['上次未完成，本次已完成', '不通过关卡也能运行', '优秀，仍需要修改配色']) {
            assert.equal(status(reviewed({ grade })), 'completed', grade);
        }
    });

    it('does not infer a completion decision from the feedback text', () => {
        assert.equal(status(reviewed({ grade: '优秀', feedback: '上次未完成的部分，这次已经补齐。' })), 'completed');
        assert.equal(status(reviewed({ grade: '需修改', feedback: '主体完成得不错，继续完善。' })), 'changes_requested');
    });
});

describe('Scratch fully correct result compatibility', () => {
    it('never grants AC to an unreviewed submission', () => {
        for (const submission of [null, {}, { grade: 'AC' }, { grade: '100', reviewStatus: 'accepted', reviewedAt: null }]) {
            assert.equal(fullyCorrect(submission), false);
        }
    });

    it('uses an explicit accepted result as the complete-correct decision', () => {
        for (const grade of [null, '优秀', '100', '未完成']) {
            assert.equal(fullyCorrect(reviewed({ reviewStatus: 'accepted', grade })), true);
        }
    });

    it('recognizes only explicit full-correct labels from historical reviews', () => {
        for (const grade of ['AC', 'ac', 'Accepted', 'accepted', 'ＡＣ', '完全正确', '全部正确', '满分', '100', '100分', '100 / 100']) {
            assert.equal(fullyCorrect(reviewed({ grade })), true, grade);
        }
    });

    it('does not mistake a generic completed or positive evaluation for full correctness', () => {
        for (const grade of [null, '', '优秀', '完成', '已完成', '通过', '95', '99分', '1000', '这次完全正确，继续加油', '之前100分']) {
            assert.equal(fullyCorrect(reviewed({ grade })), false, String(grade));
        }
        assert.equal(fullyCorrect(reviewed({ grade: '优秀', feedback: '完全正确，100分' })), false);
    });

    it('keeps a changes-requested result from gaining AC even with a full-mark grade', () => {
        for (const grade of ['AC', '完全正确', '100分', null]) {
            assert.equal(fullyCorrect(reviewed({ reviewStatus: 'changes_requested', grade })), false);
        }
        assert.equal(fullyCorrect(reviewed({ reviewStatus: 'completed', grade: '100分' })), false);
    });
});
