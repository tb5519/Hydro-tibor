const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');

const source = fs.readFileSync('packages/hydrooj/src/handler/daily_quiz.ts', 'utf8');
const declarations = ['isDailyQuizMediaRead', 'isDailyQuizAchievementRequest'].map((name) => (
    source.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n}`))[0]
)).join('\n');
const loaded = { exports: {} };
vm.runInNewContext(transformSync(declarations, { loader: 'ts', format: 'cjs' }).code, { module: loaded, exports: loaded.exports });
const { isDailyQuizMediaRead, isDailyQuizAchievementRequest } = loaded.exports;

it('daily quiz allows reading earned notifications and acknowledging only their own route', () => {
    assert.equal(isDailyQuizAchievementRequest('/achievement/pending', 'GET'), true);
    assert.equal(isDailyQuizAchievementRequest('/achievement/pending', 'HEAD'), true);
    assert.equal(isDailyQuizAchievementRequest('/achievement/ack', 'POST'), true);
    for (const method of ['GET', 'HEAD', 'PUT', 'DELETE']) assert.equal(isDailyQuizAchievementRequest('/achievement/ack', method), false);
    for (const method of ['POST', 'PUT', 'DELETE']) assert.equal(isDailyQuizAchievementRequest('/achievement/pending', method), false);
    for (const path of ['/manage/achievement', '/domain/achievement', '/achievement/ack/extra', '/achievement/pending/extra']) {
        assert.equal(isDailyQuizAchievementRequest(path, 'POST'), false);
        assert.equal(isDailyQuizAchievementRequest(path, 'GET'), false);
    }
});

it('image exemption permits only artwork reads while all upload and management operations remain gated', () => {
    for (const method of ['GET', 'HEAD']) assert.equal(isDailyQuizMediaRead('/achievement/difficulty-1/image', method), true);
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(isDailyQuizMediaRead('/achievement/difficulty-1/image', method), false);
    for (const path of ['/achievement/difficulty-1/image/upload', '/achievement/../image', '/manage/achievement', '/domain/achievement']) {
        assert.equal(isDailyQuizMediaRead(path, 'GET'), false);
    }
});
