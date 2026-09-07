const assert = require('node:assert/strict');
const Module = require('node:module');
const { after, describe, it } = require('node:test');
const { ObjectId } = require('mongodb');

const PERM = {
    PERM_VIEW: 1n,
    PERM_VIEW_CONTEST: 2n,
    PERM_VIEW_CONTEST_SCOREBOARD: 4n,
    PERM_VIEW_RECORD: 8n,
    PERM_EDIT_CONTEST: 16n,
};
const PRIV = { PRIV_USER_PROFILE: 1, PRIV_VIEW_ALL_DOMAIN: 2 };
const sourceGrantMask = PERM.PERM_VIEW_CONTEST | PERM.PERM_VIEW_CONTEST_SCOREBOARD | PERM.PERM_VIEW_RECORD;
const participantMask = PERM.PERM_VIEW | sourceGrantMask;

const ids = Object.fromEntries(Object.entries({
    shared: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    modernShared: 'abababababababababababab',
    normal: 'bbbbbbbbbbbbbbbbbbbbbbbb',
    record: 'cccccccccccccccccccccccc',
    normalRecord: 'dddddddddddddddddddddddd',
    plainRecord: 'eeeeeeeeeeeeeeeeeeeeeeee',
    pretestRecord: 'ffffffffffffffffffffffff',
    foreignRecord: '111111111111111111111111',
    pretest: '000000000000000000000001',
    generate: '000000000000000000000002',
}).map(([key, value]) => [key, new ObjectId(value)]));

const domains = new Map([
    ['system', { _id: 'system', name: 'Python' }],
    ['C0001', { _id: 'C0001', name: 'C++' }],
    ['Scratch', { _id: 'Scratch', name: 'Scratch' }],
    ['TEACHERDEMO', { _id: 'TEACHERDEMO', name: 'Teacher Demo', workspaceId: 'teacher-demo' }],
    ['OTHER', { _id: 'OTHER', name: 'Other', workspaceId: 'other-workspace' }],
]);
const contests = new Map([
    [ids.shared.toHexString(), {
        docId: ids.shared, domainId: 'system', allDomains: true, rule: 'ioi', pids: [69],
    }],
    [ids.modernShared.toHexString(), {
        docId: ids.modernShared, domainId: 'TEACHERDEMO', workspaceId: 'teacher-demo',
        allDomains: true, rule: 'ioi', pids: [70],
    }],
    [ids.normal.toHexString(), {
        docId: ids.normal, domainId: 'system', allDomains: false, rule: 'ioi', pids: [69],
    }],
]);
const records = new Map([
    [ids.record.toHexString(), {
        _id: ids.record, contest: ids.shared, domainId: 'system', uid: 24, pid: 69,
    }],
    [ids.normalRecord.toHexString(), {
        _id: ids.normalRecord, contest: ids.normal, domainId: 'system', uid: 24, pid: 69,
    }],
    [ids.plainRecord.toHexString(), {
        _id: ids.plainRecord, domainId: 'C0001', uid: 24, pid: 42,
    }],
    [ids.pretestRecord.toHexString(), {
        _id: ids.pretestRecord, contest: ids.pretest, domainId: 'system', uid: 24, pid: 69,
    }],
    [ids.foreignRecord.toHexString(), {
        _id: ids.foreignRecord, contest: ids.shared, domainId: 'OTHER', uid: 24, pid: 69,
    }],
]);
const memberships = new Set([
    '24:system', '24:C0001', '24:Scratch',
    '39:C0001',
    // Modern workspace accounts retain a compatibility membership in system.
    '38:system', '38:TEACHERDEMO',
]);
const permissionMasks = new Map([
    ['24:system', PERM.PERM_VIEW],
    ['24:C0001', participantMask],
    ['24:Scratch', participantMask],
    ['38:system', PERM.PERM_VIEW],
    ['38:TEACHERDEMO', participantMask | PERM.PERM_EDIT_CONTEST],
    // uid 39 only joined the entry domain; getById still returns a guest user in source.
    ['39:C0001', participantMask],
    ['39:system', 0n],
]);
const knownUsers = new Set([24, 38, 39]);

const workspaceId = (ddoc) => ddoc.workspaceId || 'tang';
const calls = [];
let forceVisible = null;

const contestStub = {
    async getMultiVisibleInDomain(domainId, query) {
        calls.push(['visible', domainId, query.docId.toHexString()]);
        return {
            async next() {
                if (forceVisible) return forceVisible;
                const tdoc = contests.get(query.docId.toHexString());
                if (!tdoc || !tdoc.allDomains || tdoc.rule === 'homework') return null;
                if (tdoc.domainId === domainId) return tdoc;
                return workspaceId(domains.get(tdoc.domainId)) === workspaceId(domains.get(domainId)) ? tdoc : null;
            },
        };
    },
};
const domainStub = {
    async get(domainId) {
        calls.push(['domain', domainId]);
        return domains.get(domainId) || null;
    },
};
const makeUser = (
    domainId,
    uid,
    perm = permissionMasks.get(`${uid}:${domainId}`) ?? 0n,
    privs = [PRIV.PRIV_USER_PROFILE],
) => ({
    _id: uid,
    domainId,
    perm,
    hasPerm(...wanted) { return wanted.every((item) => (this.perm & item) === item); },
    hasPriv: (...wanted) => wanted.every((item) => privs.includes(item)),
    async private() { return makeUser(domainId, uid, this.perm, [...privs]); },
});
const cachedUsers = new Map();
function getCachedUser(domainId, uid) {
    const key = `${uid}:${domainId}`;
    if (!cachedUsers.has(key)) cachedUsers.set(key, makeUser(domainId, uid));
    return cachedUsers.get(key);
}
const userStub = {
    async getById(domainId, uid) {
        calls.push(['user', domainId, uid]);
        if (!knownUsers.has(uid)) return null;
        return getCachedUser(domainId, uid);
    },
};
const recordStub = {
    RECORD_PRETEST: ids.pretest,
    RECORD_GENERATE: ids.generate,
    async get(rid) {
        calls.push(['record', rid.toHexString()]);
        return records.get(rid.toHexString()) || null;
    },
};
class NotFoundError extends Error {}
const workspaceStub = { resolveDomainWorkspaceId: workspaceId };

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
    if (parent?.filename?.endsWith('/packages/hydrooj/src/lib/contest_entry.ts')) {
        if (request === '../error') return { NotFoundError };
        if (request === '../model/builtin') return { PERM, PRIV };
        if (request === '../model/contest') return contestStub;
        if (request === '../model/domain') return domainStub;
        if (request === '../model/record') return recordStub;
        if (request === '../model/user') return userStub;
        if (request === '../model/workspace') return workspaceStub;
    }
    return originalLoad.call(this, request, parent, isMain);
};

const { applyContestEntryUrl, resolveContestEntry } = require('../packages/hydrooj/src/lib/contest_entry');
Module._load = originalLoad;
after(() => { Module._load = originalLoad; });

function createHandler({
    path, domainId = 'C0001', uid = 24, args = {}, perm, privs,
    websocket = false, originalPath,
}) {
    const entryDomain = domains.get(domainId);
    const normalizedPath = path.replace(/^\/d\/[^/]+\//, '/');
    const contestMatch = /^\/contest\/([a-f\d]{24})(?:\/|$)/i.exec(normalizedPath);
    return {
        request: { path, websocket },
        context: { originalPath: originalPath || `/d/${domainId}${normalizedPath}` },
        args: {
            domainId,
            ...(contestMatch ? { tid: new ObjectId(contestMatch[1]) } : {}),
            ...args,
        },
        domain: entryDomain,
        user: makeUser(domainId, uid, perm, privs),
        session: { scope: 'test' },
        ctx: {
            domainId,
            extend(value) { return { ...this, ...value }; },
        },
        UiContext: { domainId, domain: entryDomain },
    };
}

async function assertResolvesToShared(label, config, expectedTid = ids.shared) {
    const handler = createHandler(config);
    await resolveContestEntry(handler);
    const entryDomainId = config.domainId || 'C0001';
    const expectedSource = contests.get(expectedTid.toHexString()).domainId;
    assert.equal(handler.contestEntryContext?.domain._id, entryDomainId, `${label}: entry domain`);
    assert.equal(handler.args.domainId, expectedSource, `${label}: source domain`);
    assert.equal(handler.args.tid?.toString(), expectedTid.toString(), `${label}: contest id`);
    assert.equal(handler.UiContext.domainId, entryDomainId, `${label}: UI domain`);
    assert.equal(handler.ctx.domain._id, expectedSource, `${label}: model context`);
    assert.equal(handler.user.perm & participantMask, participantMask, `${label}: participant permissions`);
    assert.equal(handler.user.perm & PERM.PERM_EDIT_CONTEST, 0n, `${label}: no entry admin escalation`);
}

describe('global contest entry resolver', () => {
    it('leaves ordinary problems, records, and contests in their requested domain', async () => {
        for (const handler of [
            createHandler({ path: '/p/P1000' }),
            createHandler({ path: `/record/${ids.plainRecord}` }),
            createHandler({ path: `/contest/${ids.normal}` }),
            createHandler({ path: `/contest/${ids.normal}`, domainId: 'system' }),
        ]) {
            const requestedDomain = handler.args.domainId;
            await resolveContestEntry(handler);
            assert.equal(handler.args.domainId, requestedDomain);
            assert.equal(handler.contestEntryContext, undefined);
        }
    });

    it('uses one source domain for every HTTP and websocket contest route', async () => {
        const cases = [
            ['contest detail', { path: `/contest/${ids.shared}` }],
            ['contest problems', { path: `/contest/${ids.shared}/problems` }],
            ['problem detail', { path: '/p/69', args: { tid: ids.shared } }],
            ['problem submit', { path: '/p/69/submit', args: { tid: ids.shared } }],
            ['problem file', { path: '/p/69/file/input.txt', args: { tid: ids.shared } }],
            ['record list', { path: '/record', args: { tid: ids.shared } }],
            ['record detail', { path: `/record/${ids.record}` }],
            ['record websocket', {
                path: '/d/C0001/record-conn', websocket: true,
                args: { domainId: 'OTHER', rid: ids.record },
            }],
            ['record detail websocket', {
                path: '/d/C0001/record-detail-conn', websocket: true,
                args: { domainId: 'OTHER', rid: ids.record },
            }],
            ['submit feedback', { path: '/contest-submit-feedback', args: { rid: ids.record } }],
            ['submit feedback websocket', {
                path: '/d/C0001/contest-submit-feedback-conn', websocket: true,
                args: { domainId: 'OTHER', rid: ids.record },
            }],
        ];
        for (const [label, config] of cases) await assertResolvesToShared(label, config);
    });

    it('only associates a pretest record with its owner and rejects mismatched records', async () => {
        await assertResolvesToShared('owned pretest', {
            path: `/record/${ids.pretestRecord}`, args: { tid: ids.shared },
        });

        const otherUsersPretest = createHandler({
            path: `/record/${ids.pretestRecord}`, domainId: 'TEACHERDEMO', uid: 38,
            args: { tid: ids.modernShared },
        });
        await resolveContestEntry(otherUsersPretest);
        assert.equal(otherUsersPretest.contestEntryContext, undefined);

        await assert.rejects(() => resolveContestEntry(createHandler({
            path: `/record/${ids.record}`, args: { tid: ids.modernShared },
        })), NotFoundError);
        await assert.rejects(() => resolveContestEntry(createHandler({
            path: `/record/${ids.foreignRecord}`,
        })), NotFoundError);
    });

    it('does not let query parameters or visibility bugs cross a workspace boundary', async () => {
        const ownWorkspace = createHandler({
            path: `/contest/${ids.modernShared}`, domainId: 'TEACHERDEMO', uid: 38,
            args: { entryDomainId: 'system' },
        });
        await resolveContestEntry(ownWorkspace);
        assert.equal(ownWorkspace.contestEntryContext.domain._id, 'TEACHERDEMO');
        assert.equal(ownWorkspace.UiContext.domainId, 'TEACHERDEMO');
        assert.equal(ownWorkspace.user.perm & PERM.PERM_EDIT_CONTEST, PERM.PERM_EDIT_CONTEST);

        const invisible = createHandler({
            path: `/contest/${ids.shared}`, domainId: 'TEACHERDEMO', uid: 38,
            args: { entryDomainId: 'system' },
        });
        await resolveContestEntry(invisible);
        assert.equal(invisible.contestEntryContext, undefined);
        assert.equal(invisible.args.domainId, 'TEACHERDEMO');

        forceVisible = contests.get(ids.shared.toHexString());
        try {
            await assert.rejects(() => resolveContestEntry(createHandler({
                path: `/contest/${ids.shared}`, domainId: 'TEACHERDEMO', uid: 38,
            })), NotFoundError);
        } finally {
            forceVisible = null;
        }
    });

    it('requires entry-domain view permission and never rewrites guests', async () => {
        const cacheKey = '24:C0001';
        const savedEntryPerm = permissionMasks.get('24:C0001');
        const savedCachedEntryUser = cachedUsers.get(cacheKey);
        permissionMasks.set('24:C0001', 0n);
        cachedUsers.delete(cacheKey);
        try {
            await assert.rejects(() => resolveContestEntry(createHandler({
                path: `/contest/${ids.shared}`, perm: 0n,
            })), NotFoundError);
        } finally {
            permissionMasks.set('24:C0001', savedEntryPerm);
            if (savedCachedEntryUser) cachedUsers.set(cacheKey, savedCachedEntryUser);
            else cachedUsers.delete(cacheKey);
        }

        const guest = createHandler({ path: `/contest/${ids.shared}`, uid: 0, privs: [] });
        await resolveContestEntry(guest);
        assert.equal(guest.contestEntryContext, undefined);
    });

    it('does not mutate a cached guest user while granting entry-domain participant access', async () => {
        assert.equal(memberships.has('39:system'), false);
        const cachedSourceUser = getCachedUser('system', 39);
        assert.equal(cachedSourceUser.perm, 0n);

        const handler = createHandler({ path: `/contest/${ids.shared}`, uid: 39 });
        await resolveContestEntry(handler);

        assert.notEqual(handler.user, cachedSourceUser);
        assert.equal(handler.user.perm, sourceGrantMask);
        assert.equal(handler.user.perm & PERM.PERM_EDIT_CONTEST, 0n);
        assert.equal(cachedSourceUser.perm, 0n, 'source user cache must remain guest-only');
        assert.equal(getCachedUser('system', 39), cachedSourceUser);
    });
});

describe('global contest URL generation', () => {
    const entry = { domain: domains.get('C0001'), contest: contests.get(ids.shared.toHexString()) };

    it('keeps all contest-chain routes in the entry domain with their contest id', () => {
        const cases = [
            ['contest detail', 'contest_detail', { tid: ids.shared.toString() }, {}, false],
            ['contest problems', 'contest_problemlist', { tid: ids.shared.toString() }, {}, false],
            ['problem detail', 'problem_detail', { pid: 'P2001' }, { tid: ids.shared.toString() }, true],
            ['problem submit', 'problem_submit', { pid: 'P2001' }, { tid: ids.shared.toString() }, true],
            ['problem file', 'problem_file_download', { pid: 'P2001' }, { tid: ids.shared.toString() }, true],
            ['record list', 'record_main', {}, { tid: ids.shared.toString() }, true],
            ['record detail', 'record_detail', { rid: ids.record.toString() }, {}, true],
            ['record websocket', 'record_conn', {}, { rid: ids.record.toString() }, true],
            ['record detail websocket', 'record_detail_conn', {}, { rid: ids.record.toString() }, true],
            ['submit feedback', 'contest_submit_feedback', {}, { rid: ids.record.toString() }, true],
            ['submit feedback websocket', 'contest_submit_feedback_conn', {}, { rid: ids.record.toString() }, true],
        ];
        for (const [label, route, args, query, shouldHaveTid] of cases) {
            applyContestEntryUrl(entry, route, args, query);
            assert.equal(args.domainId, 'C0001', `${label}: entry domain`);
            assert.equal(query.entryDomainId, 'C0001', `${label}: entry query`);
            if (shouldHaveTid) assert.equal(query.tid, ids.shared.toString(), `${label}: contest id`);
        }
    });

    it('keeps ordinary problem links in the source bank without forcing a contest id', () => {
        const args = { pid: 'P2001' };
        const query = {};
        applyContestEntryUrl(entry, 'problem_detail', args, query);
        assert.equal(args.domainId, 'system');
        assert.equal(query.tid, undefined);
        assert.equal(query.entryDomainId, undefined);
    });

    it('does not rewrite links for another contest or global contest administration', () => {
        const unrelatedArgs = { pid: 'P2001' };
        const unrelatedQuery = { tid: ids.modernShared.toString() };
        applyContestEntryUrl(entry, 'problem_detail', unrelatedArgs, unrelatedQuery);
        assert.equal(unrelatedArgs.domainId, 'system');
        assert.equal(unrelatedQuery.entryDomainId, undefined);

        for (const route of ['contest_main', 'contest_create']) {
            const args = {};
            const query = {};
            applyContestEntryUrl(entry, route, args, query);
            assert.equal(args.domainId, undefined);
            assert.equal(query.entryDomainId, undefined);
        }
    });
});
