const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const patchLocale = require('../build/scratch/patch-locale.cjs');

const original = fs.readFileSync(path.join(__dirname, 'fixtures/scratch_detect_locale_upstream.txt'), 'utf8');
const patched = patchLocale(original);
const script = transformSync(patched, { format: 'cjs' }).code;

function detect(search, stored, browser = 'en-US') {
    const mod = { exports: {} };
    vm.runInNewContext(script, {
        module: mod, exports: mod.exports,
        require: (name) => {
            assert.equal(name, 'query-string');
            return { parse: (query) => Object.fromEntries(new URLSearchParams(query)) };
        },
        window: { navigator: { language: browser } },
        location: { search },
        localStorage: { getItem: () => stored },
    });
    return mod.exports.detectLocale(['en', 'fr', 'ja-Hira', 'zh-cn']);
}

describe('pinned Scratch locale detector', () => {
    it('uses the account preference before iframe storage and returns canonical locale keys', () => {
        assert.equal(detect('?lang=en', 'fr'), 'en');
        assert.equal(detect('?lang=ja-Hira', 'fr'), 'ja-Hira');
        assert.equal(detect('?lang=ja-hira', 'fr'), 'ja-Hira');
        assert.equal(detect('?lang=zh-cn', 'en'), 'zh-cn');
    });

    it('falls back to stored or browser language for an unsupported URL value', () => {
        assert.equal(detect('?lang=invalid', 'fr'), 'fr');
        assert.equal(detect('?lang=invalid', null, 'zh-CN'), 'zh-cn');
        assert.equal(detect('', null, 'en-US'), 'en');
    });

    it('fails loudly if the pinned upstream detector changes', () => {
        assert.throws(() => patchLocale('const detectLocale = supportedLocales => {};'),
            /Pinned Scratch locale detector/);
        assert.match(patched, /const supported = supportedLocales\.find/);
        assert(!patched.includes('const urlLocale = potentialLocales[0].toLowerCase()'));
    });
});
