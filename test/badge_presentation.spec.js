const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const { it } = require('node:test');

let presentation;
const originalLoad = Module._load;
try {
    Module._load = function patchedLoad(request, parent, isMain) {
        if (parent?.filename?.endsWith('/lib/badge_presentation.ts') && request === '../model/workspace') {
            return { LEGACY_WORKSPACE_ID: 'tang', resolveDomainWorkspaceId: (domain) => domain.workspaceId || 'tang' };
        }
        return originalLoad.call(this, request, parent, isMain);
    };
    presentation = require('../packages/hydrooj/src/lib/badge_presentation');
} finally { Module._load = originalLoad; }

function context(fixtures) {
    const calls = [];
    return { calls, db: { collection(name) {
        assert.equal(name, 'badge');
        return { find(query) {
            calls.push(query);
            return { project(fields) {
                assert.equal(fields.iconImagePath, 1);
                assert.equal(fields.acImagePath, undefined, 'AC effect bytes and paths are never used for small badge labels');
                return { async toArray() {
                    return fixtures.filter((badge) => query._id.$in.includes(badge._id)
                        && (typeof query.domainId === 'string' ? badge.domainId === query.domainId : badge.domainId === undefined));
                } };
            } };
        } };
    } } };
}

it('keeps text-only badges and exact existing colors when no small artwork exists', () => {
    assert.deepEqual(presentation.badgePresentation('Python', { _id: 7, title: 'Title', short: 'Name', backgroundColor: '123456', fontColor: '#abc' }), {
        id: 7, displayName: 'Name', tooltip: 'Title', backgroundColor: '#123456', fontColor: '#abc',
        href: '/d/Python/badge/7', iconUrl: '',
    });
    assert.equal(presentation.badgePresentation('Python', { _id: 7, backgroundColor: 'url(x)' }).backgroundColor, '#e5edf5');
});

it('hydrates selected badge icons for arbitrary user labels in one batched, scoped lookup', async () => {
    const ctx = context([{ _id: 7, short: 'New name', iconImagePath: 'icon.png', iconImageUpdatedAt: 'v2' }]);
    const users = [{ _id: 2, badge: '7#old name#ffffff#000000#Old tooltip' },
        { _id: 3, badge: '7#old name#ffffff#000000#Old tooltip' }, { _id: 4 }];
    const original = users[0].badge;
    await presentation.attachSelectedBadgePresentations(ctx, users, { _id: 'C++', workspaceId: 'tang' });
    assert.equal(ctx.calls.length, 1);
    assert.deepEqual(ctx.calls[0], { _id: { $in: [7] }, domainId: { $exists: false } });
    assert.equal(users[0].selectedBadgePresentation.iconUrl, '/d/C%2B%2B/badge/7/icon-image?v=v2');
    assert.equal(users[1].selectedBadgePresentation.displayName, 'New name');
    assert.equal(users[0].badge, original, 'no legacy payload migration or user-controlled image URL');
    assert.equal(users[2].selectedBadgePresentation, null);
});

it('never resolves a selected badge icon from another domain or workspace', async () => {
    const ctx = context([{ _id: 7, iconImagePath: 'global.png' }, { _id: 8, domainId: 'A', iconImagePath: 'A.png' },
        { _id: 9, domainId: 'B', iconImagePath: 'B.png' }]);
    const users = [7, 8, 9].map((id) => ({ badge: `${id}#Name#ffffff#000000#Title` }));
    await presentation.attachSelectedBadgePresentations(ctx, users, { _id: 'A', workspaceId: 'teacher-workspace' });
    assert.equal(users[0].selectedBadgePresentation, null);
    assert.equal(users[1].selectedBadgePresentation.iconUrl, '/d/A/badge/8/icon-image?v=');
    assert.equal(users[2].selectedBadgePresentation, null);
});

it('does not query for unselected users or old free-text badges and drops stale presentation values', async () => {
    const ctx = context([]);
    const users = [{ badge: '' }, { badge: 'Old free text#ffffff#000000', selectedBadgePresentation: { iconUrl: '/old' } }, {}];
    await presentation.attachSelectedBadgePresentations(ctx, users, { _id: 'Python' });
    assert.equal(ctx.calls.length, 0);
    assert(users.every((user) => user.selectedBadgePresentation === null));
});

it('covers cached user models, render dictionaries and every existing owned-badge attachment', () => {
    const userModel = fs.readFileSync(path.resolve(__dirname, '../packages/hydrooj/src/model/user.ts'), 'utf8');
    assert.match(userModel, /attachSelectedBadgePresentations\(\{ db \}, \[this\], currentDomain\)/);
    assert.match(userModel, /this\._publicFields\.push\('selectedBadgePresentation'\)/);
    assert.match(userModel, /attachSelectedBadgePresentations\(\{ db \}, Object\.values\(udict\), currentDomain\)/);
    for (const handler of ['user', 'home', 'domain', 'contest']) {
        const source = fs.readFileSync(path.resolve(__dirname, `../packages/hydrooj/src/handler/${handler}.ts`), 'utf8');
        assert.match(source, /iconUrl: getBadgeIconUrl\(currentDomainId, badge\)/, handler);
    }
});
