const assert = require('node:assert/strict');
const { describe, it } = require('node:test');
const { getContestPracticeWindow } = require('../packages/hydrooj/src/lib/contest_practice');
const now = Date.UTC(2026, 9, 26, 12);
const hour = 3600_000;
const contest = { docId: 'test', rule: 'ioi', duration: 1, beginAt: new Date(now - 4 * hour), endAt: new Date(now + 4 * hour) };
const participant = { attend: 1, startAt: new Date(now - hour) };
describe('flexible contest ordinary practice eligibility', () => {
    it('changes at the personal deadline and uses the earliest permitted end', () => {
        assert.deepEqual(getContestPracticeWindow(contest, participant, now), { active: true, endAt: now, contestId: 'test' });
        assert.equal(getContestPracticeWindow(contest, participant, now - 1).active, false);
        assert.equal(getContestPracticeWindow(contest, { ...participant, endAt: new Date(now - 10) }, now).endAt, now - 10);
        assert.equal(getContestPracticeWindow({ ...contest, endAt: new Date(now - 20) }, participant, now).endAt, now - 20);
    });
    it('does not turn fixed contests, homework, future contests or unstarted registrations into practice', () => {
        for (const change of [{ duration: undefined }, { duration: 0 }, { duration: -1 }, { duration: NaN },
            { rule: 'homework' }, { beginAt: new Date(now + 1) }, { endAt: 'invalid' }]) {
            assert.equal(getContestPracticeWindow({ ...contest, ...change }, participant, now), null);
        }
        for (const status of [null, {}, { attend: 1 }, { attend: 0, startAt: participant.startAt },
            { attend: 1, startAt: 'invalid' }, { attend: 1, startAt: new Date(now + 1) }, { ...participant, endAt: 'invalid' }]) {
            assert.equal(getContestPracticeWindow(contest, status, now), null);
        }
    });
});
