const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { selectProfileBadgeSound } = require('../packages/hydrooj/src/lib/profile_badge_sound');

const own = (id, extra = {}) => ({ id, displayName: `徽章 ${id}`, themeSound: `/d/Python/badge/${id}/theme-sound?v=s1`, ...extra });
const card = (id, extra = {}) => ({ id, title: `徽章标题 ${id}`, isCurrent: false, detailUrl: `/d/Python/badge/${id}`, ...extra });

describe('profile badge sound selection', () => {
    it('uses the valid displayed profile theme when no username badge is worn', () => {
        assert.deepEqual(selectProfileBadgeSound([own(1), own(2)], [card(1), card(2)], 2), {
            id: 2, name: '徽章 2', themeSound: '/d/Python/badge/2/theme-sound?v=s1',
        });
    });

    it('follows the displayed profile theme instead of the historical username badge', () => {
        const result = selectProfileBadgeSound([own(1), own(2)], [card(1, { isCurrent: true }), card(2)], 2);
        assert.equal(result.id, 2);
        assert.equal(result.themeSound, '/d/Python/badge/2/theme-sound?v=s1');
        for (const noThemeId of [0, null, undefined]) {
            assert.equal(selectProfileBadgeSound([own(1), own(2)], [card(1, { isCurrent: true }), card(2)], noThemeId).id, 1);
        }
    });

    it('keeps a silent or missing displayed theme silent instead of playing the username badge', () => {
        for (const owned of [[own(1, { themeSound: '' }), own(2)], [own(2)]]) {
            assert.equal(selectProfileBadgeSound(owned, [card(1), card(2, { isCurrent: true })], 1), null);
        }
        assert.equal(selectProfileBadgeSound([own(1, { themeSound: '' }), own(2)], [card(1), card(2)], 1), null);
        assert.equal(selectProfileBadgeSound([own(1, { themeSound: '' }), own(2)], [card(1, { isCurrent: true }), card(2)], 0), null);
    });

    it('never plays expired, cross-domain or unknown IDs absent from the valid gallery', () => {
        const owned = [own(1), own(2), own(3)];
        assert.equal(selectProfileBadgeSound(owned, [card(2)], 1), null);
        assert.equal(selectProfileBadgeSound(owned, [], 1), null);
        assert.equal(selectProfileBadgeSound(owned, [card(2)], 99), null);
        assert.equal(selectProfileBadgeSound(owned, [card(2)], null), null);
        assert.equal(selectProfileBadgeSound(owned, [card(2)], '2'), null);
        for (const invalidTheme of [1, 99, '2', NaN, -1]) {
            assert.equal(selectProfileBadgeSound(owned, [card(2, { isCurrent: true })], invalidTheme), null);
        }
    });

    it('does not choose an arbitrary available sound when neither selection is valid', () => {
        assert.equal(selectProfileBadgeSound([own(1), own(2)], [card(1), card(2)], 0), null);
    });

    it('accepts the exact encoded domain route with or without a version query', () => {
        const valid = card(2, { detailUrl: '/d/C%2B%2B/badge/2' });
        for (const themeSound of ['/d/C%2B%2B/badge/2/theme-sound', '/d/C%2B%2B/badge/2/theme-sound?v=s%202%26new']) {
            assert.equal(selectProfileBadgeSound([own(2, { themeSound })], [valid], 2).themeSound, themeSound);
        }
    });

    it('rejects external, executable, protocol-relative, cross-domain and different-badge sound URLs', () => {
        const unsafe = [
            'javascript:alert(1)', 'data:audio/mp3;base64,YQ==', 'https://example.com/sound.mp3',
            'https://onebyone.run/d/Python/badge/1/theme-sound', '//example.com/sound.mp3',
            '/d/Other/badge/1/theme-sound', '/d/Python/badge/2/theme-sound',
            '/d/Python/badge/1/ac-image', '/d/Python/badge/1/theme-sound/extra',
            '/d/Python/badge/1/theme-sound#fragment', '/d/Python/badge/1/theme-sound?x=\nheader',
            '/d/Python/badge/1/theme-sound?x=\\external', '', undefined,
        ];
        for (const themeSound of unsafe) {
            assert.equal(selectProfileBadgeSound([own(1, { themeSound })], [card(1)], 1), null, `${themeSound}`);
        }
    });

    it('requires the gallery to provide the same authorized badge detail route', () => {
        for (const detailUrl of [undefined, '/badge/1', '/d/Python/badge/2', '//host/d/Python/badge/1', '/d/Python/badge/1?redirect=x']) {
            assert.equal(selectProfileBadgeSound([own(1)], [card(1, { detailUrl })], 1), null);
        }
    });

    it('uses the title as a name fallback and leaves HTML-like text for the template to escape', () => {
        assert.equal(selectProfileBadgeSound([own(1, { displayName: '' })], [card(1)], 1).name, '徽章标题 1');
        assert.equal(selectProfileBadgeSound([own(1, { displayName: '<img src=x>' })], [card(1)], 1).name, '<img src=x>');
    });

    it('handles absent data or invalid IDs without mutating any input', () => {
        assert.equal(selectProfileBadgeSound(null, [card(1)], 1), null);
        assert.equal(selectProfileBadgeSound([own(1)], undefined, 1), null);
        assert.equal(selectProfileBadgeSound([own(-1)], [card(-1, { isCurrent: true })], -1), null);
        const owned = [own(1), own(2)];
        const cards = [card(1), card(2, { isCurrent: true })];
        const before = JSON.stringify({ owned, cards });
        selectProfileBadgeSound(owned, cards, 1);
        assert.equal(JSON.stringify({ owned, cards }), before);
    });
});
