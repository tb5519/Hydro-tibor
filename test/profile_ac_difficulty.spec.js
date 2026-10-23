const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/lib/profile_ac_difficulty.ts'), 'utf8');
const mod = { exports: {} };
vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module: mod, exports: mod.exports,
});
const getProfileAcDifficulty = (problems) => JSON.parse(JSON.stringify(mod.exports.getProfileAcDifficulty(problems)));
const problem = (docId, difficulty, domainId = 'python') => ({ domainId, docId, difficulty });

describe('profile accepted problem difficulty distribution', () => {
    it('includes every level with zero-safe values on an empty profile', () => {
        assert.deepEqual(getProfileAcDifficulty([]), {
            total: 0, rated: 0, unrated: 0, maxCount: 0, highestLevel: null,
            levels: Array.from({ length: 10 }, (_, index) => ({
                level: index + 1, count: 0, percent: 0, width: 0,
            })),
        });
    });

    it('groups all ten explicit integer difficulty levels', () => {
        const result = getProfileAcDifficulty(Array.from({ length: 10 }, (_, i) => problem(i + 1, i + 1)));
        assert.equal(result.total, 10);
        assert.equal(result.rated, 10);
        assert.equal(result.unrated, 0);
        assert.equal(result.maxCount, 1);
        assert.equal(result.highestLevel, 10);
        assert.deepEqual(result.levels, Array.from({ length: 10 }, (_, index) => ({
            level: index + 1, count: 1, percent: 10, width: 100,
        })));
    });

    it('counts a repeated accepted question once and keeps matching IDs in different domains separate', () => {
        const result = getProfileAcDifficulty([
            problem(1, 2), problem(1, 2), problem(1, 2, 'cpp'), problem(2, 3),
        ]);
        assert.equal(result.total, 3);
        assert.equal(result.levels[1].count, 2);
        assert.equal(result.levels[2].count, 1);
        assert.equal(result.highestLevel, 3);
    });

    it('keeps unmarked and malformed difficulty in a separate unrated count', () => {
        const values = [undefined, null, 0, -1, 11, 1.5, '3', '', NaN, Infinity, -Infinity, true, {}, []];
        const result = getProfileAcDifficulty(values.map((difficulty, index) => problem(index + 1, difficulty)));
        assert.equal(result.total, values.length);
        assert.equal(result.rated, 0);
        assert.equal(result.unrated, values.length);
        assert.equal(result.maxCount, 0);
        assert.equal(result.highestLevel, null);
        assert.ok(result.levels.every((level) => level.count === 0 && level.percent === 0 && level.width === 0));
    });

    it('uses every visible AC as the percentage denominator and the largest level count as the bar denominator', () => {
        const result = getProfileAcDifficulty([
            problem(1, 1), problem(2, 1), problem(3, 5), problem(4, 0),
        ]);
        assert.equal(result.total, 4);
        assert.equal(result.rated, 3);
        assert.equal(result.unrated, 1);
        assert.equal(result.maxCount, 2);
        assert.equal(result.highestLevel, 5);
        assert.deepEqual(result.levels[0], { level: 1, count: 2, percent: 50, width: 100 });
        assert.deepEqual(result.levels[4], { level: 5, count: 1, percent: 25, width: 50 });
    });

    it('rounds displayed percentages to one decimal without changing the source counts', () => {
        const result = getProfileAcDifficulty([problem(1, 2), problem(2, 2), problem(3, 8)]);
        assert.deepEqual(result.levels[1], { level: 2, count: 2, percent: 66.7, width: 100 });
        assert.deepEqual(result.levels[7], { level: 8, count: 1, percent: 33.3, width: 50 });
    });

    it('uses explicit current problem difficulty without reading acceptance counts, tags, or RP', () => {
        const docs = [
            { ...problem(1, 9), nAccept: 10000, tag: ['1'], rp: 999 },
            { ...problem(2, undefined), nAccept: 1, tag: ['10'], rp: 0 },
        ];
        const before = JSON.stringify(docs);
        const result = getProfileAcDifficulty(docs);
        assert.equal(result.levels[8].count, 1);
        assert.equal(result.unrated, 1);
        assert.equal(JSON.stringify(docs), before);
    });
});
