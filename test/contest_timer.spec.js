const assert = require('node:assert/strict');
const Module = require('node:module');
const { describe, it } = require('node:test');
const { formatContestCountdown, getContestTimerWindow } = require('../packages/ui-default/common/contest-timer');

const now = Date.UTC(2026, 8, 8, 12);
const hour = 3600000;
const contest = { rule: 'ioi', beginAt: new Date(now - hour), endAt: new Date(now + hour) };

describe('participant contest deadlines', () => {
  it('shows the fixed contest deadline only after attendance and the contest start', () => {
    assert.deepEqual(getContestTimerWindow(contest, { attend: 1 }, now), { beginAt: now - hour, endAt: now + hour });
    assert.equal(getContestTimerWindow(contest, null, now), null);
    assert.equal(getContestTimerWindow(contest, { attend: 0, startAt: now - 1 }, now), null);
    assert.equal(getContestTimerWindow(contest, { attend: 1 }, now - hour - 1), null);
    assert.equal(getContestTimerWindow({ ...contest, rule: 'homework' }, { attend: 1 }, now), null);
  });

  it('uses the earliest of the personal limit, contest deadline and early hand-in', () => {
    const limited = { ...contest, duration: 0.5 };
    const status = { attend: 1, startAt: new Date(now - 60000) };
    assert.equal(getContestTimerWindow(limited, status, now).endAt, now + 29 * 60000);
    assert.equal(getContestTimerWindow({ ...limited, duration: 3 }, status, now).endAt, contest.endAt.getTime());
    assert.equal(getContestTimerWindow(limited, { ...status, endAt: now + 60000 }, now).endAt, now + 60000);
    assert.equal(getContestTimerWindow(limited, { attend: 1 }, now), null, 'registration must not start a personal clock');
    assert.equal(getContestTimerWindow(limited, { ...status, endAt: now }, now), null);
    assert.equal(getContestTimerWindow(limited, { ...status, startAt: now - hour }, now), null);
    assert.equal(getContestTimerWindow(contest, { attend: 1 }, now + hour), null);
  });

  it('ignores invalid dates and never displays a negative or day-wrapped countdown', () => {
    assert.equal(getContestTimerWindow({ ...contest, endAt: 'invalid' }, { attend: 1 }, now), null);
    assert.equal(getContestTimerWindow({ ...contest, duration: 1 }, { attend: 1, startAt: 'invalid' }, now), null);
    assert.equal(formatContestCountdown(-100), '00:00:00');
    assert.equal(formatContestCountdown(1), '00:00:01');
    assert.equal(formatContestCountdown(25 * hour + 61000), '25:01:01');
  });
});

const PERM = { PERM_VIEW: 1, PERM_VIEW_CONTEST: 2, PERM_VIEW_HIDDEN_CONTEST: 4 };
const PRIV = { PRIV_USER_PROFILE: 1 };
let records = [];
let statuses = [];
let statusQuery;
let contestQuery;
let scopeQuery;
const userFor = (domainId, uid) => ({
  _id: uid,
  hasPerm: (mask) => domainId !== 'revoked' && (mask & 3) === mask,
  own: () => false,
  hasPriv: () => uid > 0,
});
const asCursor = (data) => ({ project() { return this; }, async toArray() { return data; } });
const backend = {
  ContestModel: { RULES: { ioi: {}, hidden: { hidden: true } } },
  Context: class {},
  DocumentModel: {
    TYPE_CONTEST: 30,
    getMultiStatusWithoutDomain(type, query) {
      assert.equal(type, 30);
      statusQuery = query;
      return asCursor(statuses);
    },
    coll: { find(query) { contestQuery = query; return asCursor(records); } },
  },
  DomainModel: { coll: { find(query) { scopeQuery = query; return asCursor(['bank-a', 'bank-b', 'revoked'].map((_id) => ({ _id }))); } } },
  Handler: class {},
  PERM,
  PRIV,
  UserModel: { getById: async (domainId, uid) => userFor(domainId, uid), listGroup: async () => [{ name: 'class-a' }] },
};
const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (parent?.filename?.endsWith('/packages/ui-default/backendlib/contest-timer.ts')) {
    if (request === 'hydrooj') return backend;
    if (request === 'hydrooj/src/model/workspace') return {
      resolveDomainWorkspaceId: (domain) => domain.workspaceId,
      getDomainQuery: (workspaceId) => ({ workspaceId }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { getActiveContestTimers } = require('../packages/ui-default/backendlib/contest-timer');
Module._load = originalLoad;

const handler = (uid = 24) => ({
  user: userFor('bank-a', uid),
  domain: { _id: 'bank-a', workspaceId: 'teacher-a' },
  session: { scope: 'student' },
  url: (_route, { domainId, tid }) => `/d/${domainId}/contest/${tid}/problems`,
});

describe('global contest timer access', () => {
  it('scopes both status and contest queries to the current workspace and signed-in student', async () => {
    statuses = [];
    const result = await getActiveContestTimers(handler());
    assert.deepEqual(result.contests, []);
    assert.deepEqual(scopeQuery, { workspaceId: 'teacher-a' });
    assert.equal(statusQuery.uid, 24);
    assert.deepEqual(statusQuery.attend, { $gt: 0 });
    assert.deepEqual(statusQuery.domainId, { $in: ['bank-a', 'bank-b', 'revoked'] });
    const guest = await getActiveContestTimers(handler(0));
    assert.deepEqual(guest.contests, []);
  });

  it('keeps shared entry links, permits accessible bank navigation, and excludes revoked or unassigned contests', async () => {
    const current = Date.now();
    const makeContest = (docId, domainId, extra = {}) => ({
      docId, domainId, title: docId, rule: 'ioi', beginAt: new Date(current - hour), endAt: new Date(current + hour), ...extra,
    });
    records = [
      makeContest('shared', 'bank-b', { allDomains: true, endAt: new Date(current + 60000) }),
      makeContest('private', 'bank-b'),
      makeContest('revoked-private', 'revoked'),
      makeContest('unassigned', 'bank-b', { assign: ['class-b'] }),
      makeContest('assigned', 'bank-b', { assign: ['class-a'] }),
      makeContest('spectator', 'bank-b'),
      makeContest('hidden', 'bank-b', { rule: 'hidden' }),
      makeContest('wrong-status-domain', 'bank-b'),
    ];
    statuses = records.filter((record) => record.docId !== 'spectator').map((record) => ({
      domainId: record.docId === 'wrong-status-domain' ? 'bank-a' : record.domainId,
      docId: record.docId, attend: 1,
    }));
    const result = await getActiveContestTimers(handler());
    assert.deepEqual(result.contests.map((timer) => timer.title), ['shared', 'assigned', 'private']);
    assert.equal(result.contests[0].url, '/d/bank-a/contest/shared/problems');
    assert.equal(result.contests[2].url, '/d/bank-b/contest/private/problems');
    assert.equal(contestQuery.docType, 30);
    assert.deepEqual(contestQuery.domainId, statusQuery.domainId);
    assert.ok(result.serverNow >= current);
  });
});
