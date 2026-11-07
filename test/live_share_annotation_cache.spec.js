const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const code = transformSync(fs.readFileSync(path.join(__dirname, '../packages/ui-default/components/live_share/annotation_cache.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code;
function fixture() {
    let now = Date.now(); let quota = false;
    const values = {};
    const storage = new Proxy({}, { ownKeys: () => Object.keys(values), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }),
        get: (_, key) => key === 'getItem' ? (name) => values[name] || null
            : key === 'setItem' ? (name, value) => { if (quota) throw new Error('quota'); values[name] = value; }
                : key === 'removeItem' ? (name) => { delete values[name]; } : undefined });
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, localStorage: storage, location: { href: 'https://onebyone.test/p/1' }, URL, Date: { now: () => now } });
    return { api: module.exports, values, tick: value => { now += value; }, quota: value => { quota = value; } };
}
it('annotation cache keeps the freshest draft even when storage quota is exhausted, and clears both stores', () => {
    const f = fixture(); const scope = { sessionId: 'lesson-123', url: '/p/1' };
    f.api.writeAnnotationCache(scope, 'text', [{ id: 'note-123', text: '旧内容' }]);
    f.quota(true);
    f.api.writeAnnotationCache(scope, 'text', [{ id: 'note-123', text: '新内容' }]);
    assert.equal(f.api.readAnnotationCache(scope, 'text')[0].text, '新内容');
    const second = { ...scope, url: '/p/2' };
    f.api.writeAnnotationCache(second, 'text', [{ id: 'note-456', text: '内存草稿' }]);
    assert.equal(f.api.readAnnotationCache(second, 'text')[0].text, '内存草稿');
    f.quota(false); f.api.writeAnnotationCache(scope, 'text', [{ id: 'note-123', text: '已落盘' }]);
    assert.equal(f.api.readAnnotationCache(scope, 'text')[0].text, '已落盘');
    f.api.clearSessionAnnotations(scope.sessionId);
    assert.equal(f.api.readAnnotationCache(scope, 'text').length, 0); assert.equal(f.api.readAnnotationCache(second, 'text').length, 0);
});
it('annotation cache expires old lessons and bounds total storage while preserving newest pages', () => {
    const f = fixture();
    for (let index = 0; index < 10; index++) {
        f.tick(1000); f.api.writeAnnotationCache({ sessionId: 'lesson-limit', url: `/p/${index}` }, 'text',
            Array.from({ length: 50 }, (_, note) => ({ id: `note-${note}`, text: '字'.repeat(1800) })));
    }
    assert(Object.values(f.values).reduce((sum, value) => sum + value.length * 2, 0) <= 1024 * 1024);
    assert(f.api.readAnnotationCache({ sessionId: 'lesson-limit', url: '/p/9' }, 'text').length > 0);
    assert.equal(f.api.readAnnotationCache({ sessionId: 'different-lesson', url: '/p/9' }, 'text').length, 0);
    f.tick(12 * 60 * 60 * 1000 + 1);
    assert.equal(f.api.readAnnotationCache({ sessionId: 'lesson-limit', url: '/p/9' }, 'text').length, 0);
    assert.equal(Object.keys(f.values).length, 0);
});
