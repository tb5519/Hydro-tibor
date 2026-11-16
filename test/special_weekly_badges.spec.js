const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { it } = require('node:test');
const { transformSync } = require('esbuild');
const moment = require('moment-timezone');

const repo = path.resolve(__dirname, '..');
function compile(relative, requireModule, globals = {}) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(fs.readFileSync(path.join(repo, relative), 'utf8'), {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, { module, exports: module.exports, require: requireModule, ...globals });
    return module.exports;
}
const { calendarWeek } = compile('packages/hydrooj/src/lib/calendar_week.ts', require);

function fixture(champions = [10, 11]) {
    const awards = []; const snapshots = []; const expiryInputs = []; const badgeChanges = []; const migrations = []; const badgeReads = [];
    const expiresAt = new Date('2026-09-20T14:00:00Z');
    const ctx = { db: { collection(name) {
        if (name === 'badge') return {
            async findOne(query) {
                badgeReads.push(query);
                if (query.content) return query.title === '暗影骑士'
                    ? { _id: 2, content: '每周日 22:00 自动分配给最近一周 AC 数最多的同学。', users: [77] } : null;
                return { _id: query.title === '最强王者' ? 1 : 2, users: [77] };
            },
            async updateOne(query, update) { badgeChanges.push({ query, update }); },
            async distinct() { return []; },
        };
        if (name === 'user') return { find() { return { project() { return this; }, async toArray() { return [{ _id: 99, priv: 1 }]; } }; } };
        throw new Error('Unexpected collection ' + name);
    } }, async inject(_, callback) { await callback({ worker: { addHandler() {} } }); },
    Route() {}, injectUI() {}, i18n: { load() {} } };
    const addon = compile('addons/badge-for-hydrooj/index.ts', (name) => {
        if (name === 'hydrooj') return { Handler: class {}, param: () => () => {}, Types: {},
            PRIV: { PRIV_USER_PROFILE: 1, PRIV_EDIT_SYSTEM: 2 }, PERM: {} };
        if (name === 'hydrooj/src/lib/calendar_week') return { calendarWeek };
        if (name === 'hydrooj/src/lib/personal_ac_growth') return { async getWeeklyAcChampionUids(actualCtx, domain, at) {
            assert.equal(actualCtx, ctx); snapshots.push({ domain, at }); return champions;
        } };
        if (name === 'hydrooj/src/lib/shared_ranking') return { async getSharedRankingSnapshot() { return [{ uid: 99 }]; } };
        if (name === 'hydrooj/src/model/workspace') return { async getExcludedLegacyUids() { return new Set(); } };
        if (name === 'hydrooj/src/model/domain') return { async get() { return null; } };
        if (name === 'hydrooj/src/lib/automatic_badge') return {
            nextWeeklyAutomaticBadgeExpiry(now) { expiryInputs.push(now); return expiresAt; },
            async migrateWeeklyAutomaticBadge(actualCtx, badgeId, source) { migrations.push({ badgeId, source }); },
            async awardWeeklyAutomaticBadge(actualCtx, badgeId, uid, source, expiry) {
                assert.equal(actualCtx, ctx); awards.push({ badgeId, uid, source, expiry });
            },
        };
        if (name.startsWith('hydrooj/src/') || name.startsWith('./')) return {};
        return require(name);
    }, { global: { Hydro: { model: { userBadge: {}, badge: {}, user: {} } } }, process: { env: { NODE_APP_INSTANCE: '1' } } });
    return { ctx, addon, awards, snapshots, expiryInputs, expiresAt, badgeChanges, migrations, badgeReads };
}

it('calendar weeks start Monday regardless of locale, freeze AC on Sunday 22:00, and retain the full training week', () => {
    const week = calendarWeek(new Date('2026-09-13T15:00:00Z'));
    assert.equal(week.start.toISOString(), '2026-09-06T16:00:00.000Z');
    assert.equal(week.acCutoff.toISOString(), '2026-09-13T14:00:00.000Z');
    assert.equal(week.nextStart.toISOString(), '2026-09-13T16:00:00.000Z');
    const monday = calendarWeek(new Date('2026-09-13T16:00:00Z'));
    assert.equal(monday.start.toISOString(), '2026-09-13T16:00:00.000Z');
});

it('calendar-week endpoints use local dates across a daylight-saving transition', () => {
    const week = calendarWeek(new Date('2026-03-08T18:00:00Z'), 'America/New_York');
    assert.equal(week.start.toISOString(), '2026-03-02T05:00:00.000Z');
    assert.equal(week.acCutoff.toISOString(), '2026-03-09T02:00:00.000Z');
    assert.equal(week.nextStart.toISOString(), '2026-03-09T04:00:00.000Z');
});

for (const [time, closedAt] of [
    ['2026-09-13T14:00:00Z', '2026-09-13T14:00:00.000Z'],
    ['2026-09-13T15:59:59Z', '2026-09-13T14:00:00.000Z'],
    ['2026-09-13T16:00:00Z', '2026-09-13T14:00:00.000Z'],
    ['2026-09-14T04:00:00Z', '2026-09-13T14:00:00.000Z'],
]) it(`settles the just-closed week at ${time} and awards all tied positive students`, async () => {
    const f = fixture(); const now = new Date(time);
    await f.addon.assignSpecialBadges(f.ctx, now);
    assert.equal(f.snapshots.length, 1); assert.equal(f.snapshots[0].domain._id, 'system');
    assert.equal(f.snapshots[0].at.toISOString(), closedAt);
    assert.deepEqual(f.awards.filter((a) => a.source === 'weekly_ac').map((a) => a.uid), [10, 11]);
    assert.deepEqual(f.awards.filter((a) => a.source === 'weekly_rp').map((a) => a.uid), [99]);
    assert.ok(f.awards.every((a) => a.expiry === f.expiresAt));
    assert.equal(f.expiryInputs[0], now, 'expiry uses the existing weekly-award policy at execution time');
    assert.ok(f.badgeChanges.every((c) => !Object.hasOwn(c.update.$set, 'users')), 'manual owners are never replaced');
    assert.match(f.badgeChanges.find((c) => c.query._id === 2).update.$set.content, /本自然周.*首次正式 AC.*并列第一/);
});

it('an empty AC leaderboard gives no shadow badge while preserving the RP winner', async () => {
    const f = fixture([]);
    await f.addon.assignSpecialBadges(f.ctx, new Date('2026-09-13T14:00:00Z'));
    assert.equal(f.awards.filter((a) => a.source === 'weekly_ac').length, 0);
    assert.equal(f.awards.filter((a) => a.source === 'weekly_rp').length, 1);
});

it('startup updates only the known old scheduler description without replacing manual badge settings', async () => {
    const f = fixture();
    await f.addon.apply(f.ctx);
    assert.equal(f.badgeChanges.length, 1);
    const change = f.badgeChanges[0];
    assert.equal(change.query._id, 2);
    assert.equal(change.query.content, '每周日 22:00 自动分配给最近一周 AC 数最多的同学。');
    assert.equal(change.query.manualAssignmentVersion.$ne, 1);
    assert.deepEqual(Object.keys(change.update.$set), ['content']);
    assert.match(change.update.$set.content, /本自然周.*首次正式 AC.*并列第一/);
    assert.deepEqual(f.migrations.map((m) => m.source), ['weekly_ac']);
});
