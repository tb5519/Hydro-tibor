/* Real HTTP + judge settlement against an isolated in-memory database. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ObjectId } = require('mongodb');
const supertest = require('supertest');
const WebSocket = require('ws');
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(os.homedir(), '.cache/mongodb-binaries');
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-contest-practice-'));
os.homedir = () => home;
fs.mkdirSync(path.join(home, '.hydro'));
fs.writeFileSync(path.join(home, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
process.argv.push('--port', process.env.CONTEST_PRACTICE_PORT || '18891', '--host', '127.0.0.1');
const timer = setTimeout(() => process.exit(2), 120000);
const results = [];
async function check(name, fn) {
    try { await fn(); results.push(true); console.log(`PASS ${name}`); }
    catch (error) { results.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
const status = (res, expected) => assert.equal(res.status, expected, res.text?.slice(0, 800));
const denied = (res) => assert(res.status >= 400 && res.status < 500, res.text?.slice(0, 800));
async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, ContestModel: contests,
        RecordModel: records, httpServer, PERM, STATUS } = require('hydrooj');
    const { postJudge } = require('../packages/hydrooj/src/handler/judge');
    const db = require('../packages/hydrooj/src/service/db').default;
    const { pointLotteryUserColl } = require('../packages/hydrooj/src/lib/point_lottery');
    const teacherId = await users.create('cp-admin@example.test', 'cp_admin', 'LocalTest123!');
    await users.setSuperAdmin(teacherId);
    const uid = await users.create('cp-student@example.test', 'cp_student', 'LocalTest123!');
    const otherUid = await users.create('cp-other@example.test', 'cp_other', 'LocalTest123!');
    const domainId = 'contest-practice';
    await domains.add(domainId, teacherId, 'Practice integration', 'Memory only');
    await domains.addRole(domainId, 'student', PERM.PERM_VIEW | PERM.PERM_VIEW_PROBLEM | PERM.PERM_SUBMIT_PROBLEM
        | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST | PERM.PERM_VIEW_RECORD);
    await domains.setUserRole(domainId, uid, 'student', true);
    await domains.setUserRole(domainId, otherUid, 'student', true);
    const pids = [];
    for (let index = 0; index < 3; index++) {
        const pid = await problems.add(domainId, `CP${index}`, `Practice ${index}`, 'Print 1', teacherId, [], { hidden: true, difficulty: 2 });
        await problems.edit(domainId, pid, { config: 'type: default\ntime: 1s\nmemory: 256m\n' });
        pids.push(pid);
    }
    const beginAt = new Date(Date.now() - 3 * 3600_000);
    const endAt = new Date(Date.now() + 3 * 3600_000);
    const tid = await contests.add(domainId, 'Flexible hidden contest', '', teacherId, 'ioi', beginAt, endAt, pids, false,
        { duration: 1, scoreToPoints: true, keepScoreboardHidden: true });
    await contests.setStatus(domainId, tid, uid, { attend: 1, startAt: new Date(Date.now() - 60000) });
    const student = supertest.agent(httpServer);
    const other = supertest.agent(httpServer);
    status(await student.post('/login').send({ uname: 'cp_student', password: 'LocalTest123!' }), 302);
    status(await other.post('/login').send({ uname: 'cp_other', password: 'LocalTest123!' }), 302);
    const submit = (agent, pid, contestId = tid, body = {}) => agent.post(`/d/${domainId}/p/${pid}/submit?tid=${contestId}`)
        .set('Accept', 'application/json').send({ lang: 'py.py3', code: 'print(1)', ...body });
    const finish = async (rid) => {
        const record = await records.update(domainId, rid, { status: STATUS.STATUS_ACCEPTED, score: 100, judgeAt: new Date() });
        await postJudge(record);
        return records.get(domainId, rid);
    };
    const socketRecord = async (username, target, rid, list = false) => {
        const agent = supertest.agent(httpServer);
        const login = await agent.post('/login').send({ uname: username, password: 'LocalTest123!' });
        status(login, 302);
        const cookie = login.headers['set-cookie'].map((value) => value.split(';')[0]).join('; ');
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://127.0.0.1:${httpServer.address().port}${target}`, { headers: { Cookie: cookie } });
            const timeout = setTimeout(() => { ws.close(); reject(new Error('No websocket record received')); }, 5000);
            ws.on('open', () => { if (list) ws.send(JSON.stringify({ rids: [String(rid)] })); });
            ws.on('error', (error) => { clearTimeout(timeout); reject(error); });
            ws.on('message', (raw) => {
                const result = JSON.parse(String(raw));
                const item = result.rdoc || result?.find?.((entry) => entry.rdoc)?.rdoc;
                if (item && String(item._id) === String(rid)) { clearTimeout(timeout); ws.close(); resolve(item); }
            });
        });
    };
    let formalRid;
    let practiceRid;
    let journal;
    let balance;
    await check('Before the personal deadline, submissions are formal competition records and earn competition points', async () => {
        const res = await submit(student, pids[0]);
        status(res, 200);
        formalRid = new ObjectId(res.body.rid);
        const record = await finish(formalRid);
        assert(record.contest.equals(tid));
        assert.equal(record.practiceContest, undefined);
        assert.equal((await contests.getStatus(domainId, tid, uid)).score, 100);
        assert.equal((await pointLotteryUserColl.findOne({ _id: uid })).lotteryPoints, 100);
        const event = await db.collection('ranking.awardEvent').findOne({ rid: formalRid });
        assert.equal(event.contestFactor, 2);
        assert.equal(event.deferred, true);
    });
    await check('After personal time expires, hidden contest problems remain runnable as ordinary practice', async () => {
        await contests.setStatus(domainId, tid, uid, { startAt: new Date(Date.now() - 2 * 3600_000) });
        const page = await student.get(`/d/${domainId}/p/${pids[1]}?tid=${tid}`).set('Accept', 'text/html');
        status(page, 200);
        assert(page.text.includes('contestPracticeWindow'));
        journal = (await contests.getStatus(domainId, tid, uid)).journal;
        balance = (await pointLotteryUserColl.findOne({ _id: uid })).lotteryPoints;
        const res = await submit(student, pids[1]);
        status(res, 200);
        assert.equal(res.body.practice, true);
        assert.equal(res.body.practiceContest, String(tid));
        assert(res.body.url.includes('practiceResult=1'));
        practiceRid = new ObjectId(res.body.rid);
        const record = await finish(practiceRid);
        assert.equal(record.contest, undefined);
        assert(record.practiceContest.equals(tid));
        assert.equal(record.practiceEntryDomain, domainId);
        assert.deepEqual((await contests.getStatus(domainId, tid, uid)).journal, journal);
        assert.equal((await pointLotteryUserColl.findOne({ _id: uid })).lotteryPoints, balance);
        assert.equal(record.scorePointAward, undefined);
        assert.equal((await problems.getStatus(domainId, pids[1], uid)).status, STATUS.STATUS_ACCEPTED);
        const event = await db.collection('ranking.awardEvent').findOne({ rid: practiceRid });
        assert.equal(event.contestFactor, 1);
        assert.equal(event.deferred, false);
    });
    await check('Own hidden practice results are readable, marked, and do not expose other learners or unrelated questions', async () => {
        const detail = await student.get(`/d/${domainId}/record/${practiceRid}?practiceResult=1`).set('Accept', 'text/html');
        status(detail, 200);
        assert(detail.text.includes('contestPracticeLive'));
        const feedback = await student.get(`/d/${domainId}/contest-submit-feedback?rid=${practiceRid}`).set('Accept', 'application/json');
        status(feedback, 200);
        assert.equal(feedback.body.rdoc.practiceContest, String(tid));
        assert.equal(feedback.body.rdoc.uid, uid);
        assert.equal(feedback.body.rdoc.status, STATUS.STATUS_ACCEPTED);
        const wsFeedback = await socketRecord('cp_student', `/d/${domainId}/contest-submit-feedback-conn?rid=${practiceRid}`, practiceRid);
        assert.equal(wsFeedback.uid, uid);
        assert.equal(wsFeedback.practiceContest, String(tid));
        const wsDetail = await socketRecord('cp_student', `/d/${domainId}/record-detail-conn?rid=${practiceRid}&noTemplate=1`, practiceRid);
        assert.equal(wsDetail.uid, uid);
        assert.equal(wsDetail.practiceContest, String(tid));
        const ownList = await student.get(`/d/${domainId}/record?tid=${tid}&fullStatus=1`).set('Accept', 'application/json');
        status(ownList, 200);
        assert(ownList.body.rdocs.some((record) => record._id === String(practiceRid) && record.practiceContest === String(tid)));
        denied(await other.get(`/d/${domainId}/contest-submit-feedback?rid=${practiceRid}`).set('Accept', 'application/json'));
        const othersList = await other.get(`/d/${domainId}/record?uidOrName=${uid}&fullStatus=1`).set('Accept', 'application/json');
        status(othersList, 200);
        assert(!othersList.body.rdocs.some((record) => record._id === String(practiceRid)));
        denied(await student.get(`/d/${domainId}/p/${pids[1]}`).set('Accept', 'application/json'));
        denied(await submit(other, pids[1], tid, { practiceContest: String(tid), practice: true }));
        const unrelated = await contests.add(domainId, 'Unrelated readable contest', '', teacherId, 'ioi', beginAt,
            new Date(Date.now() - 1000), [pids[2]], false, { allowViewCode: true });
        await contests.setStatus(domainId, unrelated, otherUid, { attend: 1, startAt: beginAt });
        denied(await other.get(`/d/${domainId}/record/${practiceRid}?tid=${unrelated}`).set('Accept', 'application/json'));
        denied(await student.get(`/d/${domainId}/record/${practiceRid}?tid=${unrelated}`).set('Accept', 'application/json'));
        const readerUid = await users.create('cp-reader@example.test', 'cp_reader', 'LocalTest123!');
        await domains.addRole(domainId, 'reader', PERM.PERM_VIEW | PERM.PERM_VIEW_RECORD | PERM.PERM_VIEW_PROBLEM
            | PERM.PERM_VIEW_PROBLEM_HIDDEN | PERM.PERM_READ_RECORD_CODE);
        await domains.setUserRole(domainId, readerUid, 'reader', true);
        const reader = supertest.agent(httpServer);
        status(await reader.post('/login').send({ uname: 'cp_reader', password: 'LocalTest123!' }), 302);
        const readList = await reader.get(`/d/${domainId}/record?uidOrName=${uid}`).set('Accept', 'application/json');
        status(readList, 200);
        assert(!readList.body.rdocs.some((record) => record._id === String(practiceRid)));
        denied(await reader.get(`/d/${domainId}/record/${practiceRid}`).set('Accept', 'application/json'));
    });
    await check('Extending or rejudging a contest never promotes an existing practice record to competition', async () => {
        await contests.edit(domainId, tid, { duration: 4 });
        await records.reset(domainId, practiceRid, true);
        const record = await finish(practiceRid);
        assert.equal(record.contest, undefined);
        assert(record.practiceContest.equals(tid));
        assert.deepEqual((await contests.getStatus(domainId, tid, uid)).journal, journal);
        assert.equal((await pointLotteryUserColl.findOne({ _id: uid })).lotteryPoints, balance);
        const events = await db.collection('ranking.awardEvent').find({ rid: practiceRid }).toArray();
        assert(events.length > 0 && events.every((event) => event.contestFactor === 1 && !event.deferred));
    });
    await check('Expired fixed contests and homework, future contests, and registrations without a start remain blocked', async () => {
        const ended = new Date(Date.now() - 1000);
        const options = [
            ['ioi', beginAt, ended, {}, { attend: 1, startAt: beginAt }],
            ['homework', beginAt, ended, { duration: 1, penaltySince: ended, penaltyRules: {} }, { attend: 1, startAt: beginAt }],
            ['ioi', new Date(Date.now() + 3600_000), endAt, { duration: 1 }, { attend: 1, startAt: beginAt }],
            ['ioi', beginAt, endAt, { duration: 1 }, { attend: 1 }],
        ];
        for (const [rule, begin, end, fields, participant] of options) {
            const blocked = await contests.add(domainId, 'Blocked fixture', '', teacherId, rule, begin, end, pids, false, fields);
            await contests.setStatus(domainId, blocked, uid, participant);
            denied(await submit(student, pids[2], blocked));
        }
    });
    await check('A submission accepted before its personal deadline stays formal when judging finishes afterward', async () => {
        const short = await contests.add(domainId, 'Short in-flight contest', '', teacherId, 'ioi', beginAt, endAt, [pids[2]], false,
            { duration: 2 / 3600, scoreToPoints: true });
        await contests.setStatus(domainId, short, uid, { attend: 1, startAt: new Date() });
        const response = await submit(student, pids[2], short);
        status(response, 200);
        const rid = new ObjectId(response.body.rid);
        assert((await records.get(domainId, rid)).contest.equals(short));
        await new Promise((resolve) => setTimeout(resolve, 2200));
        const record = await finish(rid);
        assert(record.contest.equals(short));
        assert.equal(record.practiceContest, undefined);
        assert.equal((await contests.getStatus(domainId, short, uid)).score, 100);
        assert.equal(record.scorePointAward.points, 100);
        assert.equal((await db.collection('ranking.awardEvent').findOne({ rid })).contestFactor, 2);
    });
    await check('Shared contests keep ordinary practice in the source domain and authorize only the owner through their entry classroom', async () => {
        const entry = 'contest-practice-entry';
        const sharedUid = await users.create('cp-shared@example.test', 'cp_shared', 'LocalTest123!');
        await domains.add(entry, teacherId, 'Entry classroom', 'Memory only');
        await domains.addRole(entry, 'student', PERM.PERM_VIEW | PERM.PERM_VIEW_CONTEST | PERM.PERM_ATTEND_CONTEST | PERM.PERM_VIEW_RECORD);
        await domains.setUserRole(entry, sharedUid, 'student', true);
        const shared = await contests.add(domainId, 'Shared flexible contest', '', teacherId, 'ioi', beginAt, endAt, [pids[2]], false,
            { duration: 1, allDomains: true, scoreToPoints: true, keepScoreboardHidden: true });
        await contests.setStatus(domainId, shared, sharedUid, { attend: 1, startAt: new Date(Date.now() - 2 * 3600_000), entryDomainId: entry });
        const agent = supertest.agent(httpServer);
        status(await agent.post('/login').send({ uname: 'cp_shared', password: 'LocalTest123!' }), 302);
        const response = await agent.post(`/d/${entry}/p/${pids[2]}/submit?tid=${shared}`).set('Accept', 'application/json')
            .send({ lang: 'py.py3', code: 'print(1)' });
        status(response, 200);
        const rid = new ObjectId(response.body.rid);
        const record = await finish(rid);
        assert.equal(record.domainId, domainId);
        assert.equal(record.contest, undefined);
        assert(record.practiceContest.equals(shared));
        assert.equal(record.practiceEntryDomain, entry);
        status(await agent.get(`/d/${entry}/record/${rid}?practiceResult=1`).set('Accept', 'text/html'), 200);
        const feedback = await agent.get(`/d/${entry}/contest-submit-feedback?rid=${rid}`).set('Accept', 'application/json');
        status(feedback, 200);
        assert.equal(feedback.body.rdoc.practiceContest, String(shared));
        assert.equal(feedback.body.rdoc.status, STATUS.STATUS_ACCEPTED);
        assert.equal((await contests.getStatus(domainId, shared, sharedUid)).journal, undefined);
        assert.equal((await db.collection('ranking.awardEvent').findOne({ rid })).contestFactor, 1);
        denied(await other.get(`/d/${entry}/contest-submit-feedback?rid=${rid}`).set('Accept', 'application/json'));
    });
    clearTimeout(timer);
    console.log(`Contest practice integration: ${results.filter(Boolean).length}/${results.length} passed`);
    process.exit(results.every(Boolean) ? 0 : 1);
}
let started = false;
process.send = (message) => {
    if (message === 'ready' && !started) { started = true; run().catch((error) => { console.error(error.stack); process.exit(1); }); }
    return true;
};
require('hydrooj/bin/hydrooj');
