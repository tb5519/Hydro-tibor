/* eslint-disable no-await-in-loop -- Ordered mutations exercise persisted quiz snapshots and stale teacher/student requests. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const supertest = require('supertest');

// Isolated ephemeral MongoDB and local storage; never load production credentials.
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(os.homedir(), '.cache/mongodb-binaries');
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-daily-replacement-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.resolve(__dirname, '../packages/ui-default')]));
const port = process.env.DAILY_REPLACEMENT_PORT || '18897';
process.argv.push('--port', port, '--host', '127.0.0.1');
const timeout = setTimeout(() => { console.error('Daily quiz replacement integration timed out'); process.exit(2); }, 150000);
const results = [];
async function check(name, fn) {
    try { await fn(); results.push(true); console.log(`PASS ${name}`); }
    catch (error) { results.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
function status(response, expected) {
    assert.equal(response.status, expected, `${response.status}: ${response.text?.slice(0, 800)}`);
}
function denied(response) {
    assert(response.status >= 400 && response.status < 500, `${response.status}: ${response.text?.slice(0, 800)}`);
}
function redirectedTo(response, target) {
    assert(response.status === 302 || response.body.url?.includes(target), `${response.status}: ${response.text?.slice(0, 800)}`);
    assert((response.headers.location || response.body.url || '').includes(target));
}

async function run() {
    const { UserModel: users, DomainModel: domains, ProblemModel: problems, httpServer } = require('hydrooj');
    const daily = require('../packages/hydrooj/src/model/daily_quiz');
    const { beijingDay } = require('../packages/hydrooj/src/lib/daily_quiz');
    const storage = require('../packages/hydrooj/src/model/storage').default;
    const document = require('../packages/hydrooj/src/model/document');
    const workspace = require('../packages/hydrooj/src/model/workspace').default;
    const { objectiveContent, objectiveConfig } = require('../packages/hydrooj/src/lib/objective');
    const password = 'LocalReplace123!';
    const teacherName = 'replacement_teacher';
    const teacherId = await users.create('replacement-teacher@example.test', teacherName, password);
    await users.setSuperAdmin(teacherId);
    const python = 'replacement-python';
    const cpp = 'replacement-cpp';
    const scratch = 'replacement-scratch';
    const tight = 'replacement-tight';
    const guarded = 'replacement-guarded';
    for (const [did, name, kind] of [
        [python, 'Python 思维进阶', 'oj'], [cpp, 'C++ 算法启航', 'oj'],
        [scratch, 'Scratch 创作探索', 'scratch'], [tight, '只有两道题', 'oj'], [guarded, '复习规则校验', 'oj'],
    ]) await domains.add(did, teacherId, name, 'Isolated random replacement fixture', undefined, kind);
    const foreignWorkspace = await workspace.create('replacement-foreign', '其他老师工作区', teacherId);
    const foreignDomain = 'replacement-foreign';
    await domains.add(foreignDomain, teacherId, '其他工作区的课堂', '', foreignWorkspace._id);
    const today = beijingDay();
    const offsetDay = (offset) => new Date(Date.parse(`${today}T00:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
    const nowFor = (day) => new Date(`${day}T01:00:00Z`);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XkAAAAASUVORK5CYII=', 'base64');
    const sources = {};
    const definitions = [
        ['变量与输出', 'single', '变量'], ['循环的作用', 'judge', '循环'], ['认识自增运算', 'multiple', '运算'],
        ['比较大小', 'single', '条件'], ['布尔值的含义', 'judge', '条件'], ['组合条件', 'multiple', '条件'],
        ['计数器练习', 'single', '循环'], ['重复执行', 'judge', '循环'],
    ];
    async function addSource(domainId, index, tags = ['日常训练'], options = {}) {
        const [title, kind] = definitions[index % definitions.length];
        const objective = {
            version: 1, kind, stem: `${title}：当 $N=2$ 时，正确的说法是？\n\n![题目配图](file://trace.png)`,
            options: kind === 'judge' ? ['正确', '错误'] : ['$N+3=5$', '$N+3=23$', '`N += 1`', '没有输出'],
            answers: kind === 'multiple' ? ['A', 'C'] : ['A'],
            analysis: '观察变量和执行顺序即可得到结果。\n\n![解析配图](file://trace.png)',
            ...options.objective,
        };
        const id = await problems.add(domainId, `REPLACE${index + 1}`, title, objectiveContent(objective), teacherId,
            tags, { hidden: true, objectiveKind: objective.kind, objective, config: objectiveConfig(objective) });
        const file = `problem/${domainId}/${id}/additional_file/trace.png`;
        if (!options.broken) await storage.put(file, png, teacherId);
        const source = { domainId, sourceId: id, title, tags, objective, files: { 'trace.png': file }, statementFiles: ['trace.png'] };
        (sources[domainId] ||= []).push(source);
        return source;
    }
    for (const domainId of [python, cpp, scratch]) {
        for (const [index, definition] of definitions.entries()) await addSource(domainId, index,
            ['日常训练', definition[2], `题型:${definition[1]}`]);
        await addSource(domainId, 10, ['不应抽取']);
    }
    for (const index of [0, 1]) await addSource(tight, index, ['日常训练']);
    for (const index of [0, 1, 2]) await addSource(guarded, index, ['范围内']);
    const mastered = await addSource(guarded, 3, ['范围内']);
    const cooled = await addSource(guarded, 4, ['范围内']);
    const offTag = await addSource(guarded, 5, ['其他标签']);
    const broken = await addSource(guarded, 6, ['范围内'], { broken: true });
    const roster = {};
    let counter = 0;
    async function student(key, rules, enabled = true) {
        const uname = `replacement_student_${++counter}`;
        const uid = await users.createInDomain(rules[0].domainId, `${uname}@example.test`, uname, password);
        for (const rule of rules) await domains.setUserInDomain(rule.domainId, uid, {
            join: true, role: 'default', displayName: key,
        });
        await users.setById(uid, { defaultDomain: rules[0].domainId, lotteryPoints: 21, lotteryTotalPoints: 35 });
        const policy = { version: 1, enabled, cooldownRounds: 3, domains: rules.map((rule) => ({
            enabled: true, tags: ['日常训练'], points: Array(rule.count).fill(3), ...rule,
        })) };
        await daily.savePolicy(uid, policy, teacherId);
        return roster[key] = { uid, uname, name: key, policy };
    }
    const mixedRules = [{ domainId: python, count: 2, points: [2, 5] }, { domainId: cpp, count: 1, points: [8] }];
    const projected = await student('周沐辰', mixedRules);
    const active = await student('陈星宇', mixedRules);
    const completed = await student('林小禾', [{ domainId: python, count: 2, points: [4, 7] }]);
    const disabled = await student('未开启每日问答', [{ domainId: python, count: 1 }], false);
    const foreign = await student('其他工作区学员', [{ domainId: python, count: 1 }]);
    await workspace.addStudent(foreignWorkspace._id, foreign.uid, teacherId);
    const noAlternative = await student('没有其他候选题', [{ domainId: tight, count: 2 }]);
    const guardedStudent = await student('选题规则校验', [{ domainId: guarded, count: 2, tags: ['范围内'], points: [6, 9] }]);
    for (const [source, correct] of [[mastered, true], [cooled, false]]) await daily.progressColl.insertOne({
        _id: `${guardedStudent.uid}:${guarded}:${source.sourceId}`, uid: guardedStudent.uid,
        domainId: guarded, sourceId: source.sourceId, mastered: correct, lastRound: 0, lastDay: offsetDay(-1),
    });
    const teacher = supertest.agent(httpServer);
    const withoutSudo = supertest.agent(httpServer);
    const learner = supertest.agent(httpServer);
    for (const [agent, uname] of [[teacher, teacherName], [withoutSudo, teacherName], [learner, disabled.uname]]) {
        status(await agent.post('/login').send({ uname, password }), 302);
    }
    const endpoint = (uid) => `/manage/daily-quiz/student/${uid}`;
    const get = (url, agent = teacher) => agent.get(url).set('Accept', 'application/json');
    const readUpcoming = async (uid, classroom = '') => {
        const response = await get(`${endpoint(uid)}?upcoming=1${classroom ? `&classroom=${classroom}` : ''}`);
        status(response, 200);
        assert.equal(response.headers['cache-control'], 'private, no-store');
        return response.body.upcoming;
    };
    const replaceBody = (preview, item, classroom = '') => ({
        operation: 'replace_upcoming', day: preview.day, questionId: item.id,
        sourceDomain: item.domainId, sourceId: item.sourceId, ...(classroom ? { classroom } : {}),
    });
    const post = (uid, body, agent = teacher) => agent.post(endpoint(uid)).set('Accept', 'application/json').send(body);
    const replace = async (uid, preview, item, classroom = '') => {
        const response = await post(uid, replaceBody(preview, item, classroom));
        status(response, 200);
        assert.equal(response.headers['cache-control'], 'private, no-store');
        assert(response.body.upcoming);
        return response.body.upcoming;
    };
    const coreState = async () => ({
        sessions: await daily.sessionColl.find().sort({ _id: 1 }).toArray(),
        progress: await daily.progressColl.find().sort({ _id: 1 }).toArray(),
        config: await daily.configColl.find().sort({ _id: 1 }).toArray(),
        storage: await storage.coll.find().sort({ _id: 1 }).toArray(),
        accounts: await users.coll.find().project({ lotteryPoints: 1, lotteryTotalPoints: 1, dailyQuizPointAwards: 1 }).sort({ _id: 1 }).toArray(),
    });
    const selection = (preview) => preview.items.map((item) => [item.id, item.domainId, item.sourceId, item.points]);
    const uniqueness = (items) => assert.equal(new Set(items.map((item) => `${item.domainId}:${item.sourceId}`)).size, items.length);
    const sourceFilter = (item) => ({ domainId: item.domainId, docType: document.TYPE_PROBLEM, docId: item.sourceId });

    await check('Random replacement requires a logged-in super administrator and recent sudo', async () => {
        const body = {
            operation: 'replace_upcoming', day: today, questionId: 1, sourceDomain: python, sourceId: sources[python][0].sourceId,
        };
        const before = await coreState();
        redirectedTo(await post(projected.uid, body, supertest.agent(httpServer)), '/login');
        denied(await post(projected.uid, body, learner));
        redirectedTo(await post(projected.uid, body, withoutSudo), '/user/sudo');
        assert.deepEqual(await coreState(), before);
    });
    redirectedTo(await get(`${endpoint(projected.uid)}?upcoming=1`), '/user/sudo');
    status(await teacher.post('/user/sudo').send({ password }), 302);

    await check('Invalid identities, dates, foreign workspace or classroom, and disabled learner cannot mutate a quiz', async () => {
        const preview = await readUpcoming(projected.uid);
        const item = preview.items[0];
        const body = replaceBody(preview, item);
        const before = await coreState();
        const selectedPlans = await daily.planColl.find({ items: { $exists: true } }).sort({ _id: 1 }).toArray();
        for (const uid of ['abc', -1, teacherId, foreign.uid, 999999]) denied(await post(uid, body));
        for (const patch of [
            { day: '2026-99-99' }, { day: offsetDay(-1) }, { day: offsetDay(2) },
            { questionId: -1 }, { questionId: '1.2' }, { sourceId: 999999 }, { sourceDomain: foreignDomain },
            { classroom: foreignDomain }, { classroom: cpp }, { operation: 'unknown' },
        ]) denied(await post(projected.uid, { ...body, ...patch }));
        denied(await post(disabled.uid, body));
        assert.deepEqual(await coreState(), before);
        assert.deepEqual(await daily.planColl.find({ items: { $exists: true } }).sort({ _id: 1 }).toArray(), selectedPlans,
            'Invalid requests cannot change any previously reserved question selection');
    });

    await check('Projected replacement persists one slot only; read/replace never creates rounds, awards points, or copies assets', async () => {
        const preview = await readUpcoming(projected.uid);
        assert.equal(preview.projected, true);
        const old = preview.items[0];
        const before = await coreState();
        const next = await replace(projected.uid, preview, old);
        assert.deepEqual(await coreState(), before);
        const reserved = await daily.planColl.findOne({ _id: `pending:${projected.uid}`, uid: projected.uid });
        assert(reserved, 'A teacher replacement must persist in the cross-day pending selection');
        assert.equal(reserved.expiresAt, undefined, 'A teacher-selected unanswered question cannot expire');
        assert.deepEqual(selection(reserved), selection(next));
        assert.equal(await daily.sessionColl.countDocuments({ uid: projected.uid }), 0);
        assert.equal(next.projected, true);
        assert.equal(next.total, preview.total);
        assert.equal(next.requested, preview.requested);
        assert.equal(next.remaining, preview.remaining);
        const changed = next.items[0];
        assert.equal(changed.domainId, old.domainId);
        assert.equal(changed.points, old.points);
        assert.equal(changed.index, old.index);
        assert.notEqual(changed.sourceId, old.sourceId);
        assert.notEqual(changed.id, old.id, 'A replacement gets a fresh question identity so an old answer can never grade a new source');
        assert.deepEqual(selection({ items: next.items.slice(1) }), selection({ items: preview.items.slice(1) }));
        uniqueness(next.items);
        assert.deepEqual(selection(await readUpcoming(projected.uid)), selection(next));
        const repeatedState = await coreState();
        await readUpcoming(projected.uid);
        assert.deepEqual(await coreState(), repeatedState);
        const actual = await daily.getSession(projected.uid, nowFor(today));
        assert.deepEqual(actual.session.items.map((item) => [item.id, item.domainId, item.sourceId, item.points]), selection(next));
        assert.equal(daily.presentSession(actual.policy, actual.session).current.id, next.items[0].id);
    });

    await check('Classroom-scoped replacement preserves the full multi-domain order and student point slots', async () => {
        const target = await student('单课堂换题', mixedRules);
        const full = await readUpcoming(target.uid);
        const scoped = await readUpcoming(target.uid, cpp);
        assert.equal(scoped.items.length, 1);
        assert.equal(scoped.items[0].index, 3);
        const changed = await replace(target.uid, scoped, scoped.items[0], cpp);
        assert.equal(changed.items.length, 1);
        assert.equal(changed.items[0].points, 8);
        const refreshed = await readUpcoming(target.uid);
        assert.deepEqual(selection({ items: refreshed.items.slice(0, 2) }), selection({ items: full.items.slice(0, 2) }));
        assert.deepEqual(selection({ items: refreshed.items.slice(2) }), selection(changed));
        const actual = await daily.getSession(target.uid);
        assert.deepEqual(actual.session.items.map((item) => [item.id, item.domainId, item.sourceId, item.points]), selection(refreshed));
    });

    await check('Replacement obeys tags, mastery, review cooldown, valid attachments and current-batch deduplication', async () => {
        const preview = await readUpcoming(guardedStudent.uid);
        assert.equal(preview.items.length, 2);
        const eligible = sources[guarded].slice(0, 3).map((item) => item.sourceId);
        assert(preview.items.every((item) => eligible.includes(item.sourceId)));
        const remainingId = eligible.find((id) => !preview.items.some((item) => item.sourceId === id));
        const next = await replace(guardedStudent.uid, preview, preview.items[0]);
        assert.equal(next.items[0].sourceId, remainingId, 'Exactly one eligible alternative remains after all exclusions');
        assert.deepEqual(next.items.map((item) => item.points), [6, 9]);
        assert.deepEqual(selection({ items: next.items.slice(1) }), selection({ items: preview.items.slice(1) }));
        assert(next.items.every((item) => ![mastered, cooled, offTag, broken].some((source) => source.sourceId === item.sourceId)));
        uniqueness(next.items);
    });

    await check('No eligible alternative is a clear non-mutating error, retaining the selected source and persisted plan', async () => {
        const preview = await readUpcoming(noAlternative.uid);
        const before = await coreState();
        const plans = await daily.planColl.find({ items: { $exists: true } }).sort({ _id: 1 }).toArray();
        const response = await post(noAlternative.uid, replaceBody(preview, preview.items[0]));
        denied(response);
        assert(response.text.includes('当前范围没有其他可替换的题目'));
        assert.deepEqual(await coreState(), before);
        assert.deepEqual(await daily.planColl.find({ items: { $exists: true } }).sort({ _id: 1 }).toArray(), plans);
        assert.deepEqual(selection(await readUpcoming(noAlternative.uid)), selection(preview));
    });

    await check('Repeated and simultaneous stale teacher swaps cannot overwrite another replacement or duplicate a source', async () => {
        const target = await student('并发换题', mixedRules);
        const preview = await readUpcoming(target.uid);
        const body = replaceBody(preview, preview.items[0]);
        const responses = await Promise.all([post(target.uid, body), post(target.uid, body)]);
        assert.equal(responses.filter((response) => response.status === 200).length, 1);
        denied(responses.find((response) => response.status !== 200));
        const refreshed = await readUpcoming(target.uid);
        uniqueness(refreshed.items);
        const plans = await daily.planColl.find({ uid: target.uid }).toArray();
        denied(await post(target.uid, body));
        assert.deepEqual(await daily.planColl.find({ uid: target.uid }).toArray(), plans);
        assert.deepEqual(selection(await readUpcoming(target.uid)), selection(refreshed));
        const next = await replace(target.uid, refreshed, refreshed.items[0]);
        assert.notEqual(next.items[0].sourceId, refreshed.items[0].sourceId);
        uniqueness(next.items);
        const actual = await daily.getSession(target.uid);
        assert.deepEqual(actual.session.items.map((item) => [item.id, item.domainId, item.sourceId, item.points]), selection(next));
    });

    await check('Existing unanswered snapshots replace atomically, copy safe assets and revoke stale teacher/student URLs and answers', async () => {
        const initial = await daily.getSession(active.uid);
        const old = initial.session.items[0];
        const oldTeacher = (await readUpcoming(active.uid)).items[0];
        const oldTeacherUrl = oldTeacher.stem.match(/!\[[^\]]*\]\(([^)]+)\)/)[1];
        const preview = await readUpcoming(active.uid);
        const before = await daily.sessionColl.findOne({ _id: initial.session._id });
        const progress = await daily.progressColl.find({ uid: active.uid }).toArray();
        const next = await replace(active.uid, preview, preview.items[0]);
        const after = await daily.sessionColl.findOne({ _id: initial.session._id });
        const replacement = after.items[0];
        assert.equal(after.cursor, before.cursor);
        assert.equal(after.requested, before.requested);
        assert.equal(after.round, before.round);
        assert.equal(after.settledAnswers, before.settledAnswers);
        assert.deepEqual(after.items.slice(1), before.items.slice(1));
        assert.equal(replacement.points, old.points);
        assert.notEqual(replacement.id, old.id);
        assert.notEqual(replacement.sourceId, old.sourceId);
        assert.deepEqual(await daily.progressColl.find({ uid: active.uid }).toArray(), progress);
        assert(Object.values(replacement.files).every((file) => file.startsWith('daily-quiz/')));
        const newTeacherUrl = next.items[0].stem.match(/!\[[^\]]*\]\(([^)]+)\)/)[1];
        const image = await teacher.get(newTeacherUrl);
        status(image, 200);
        assert.deepEqual(image.body, png);
        denied(await get(oldTeacherUrl));
        denied(await get(newTeacherUrl, learner));
        await assert.rejects(daily.getSessionFile(active.uid, before._id, old.id, 'trace.png'));
        const studentImage = await storage.get(await daily.getSessionFile(active.uid, after._id, replacement.id, 'trace.png'));
        const imageChunks = [];
        for await (const chunk of studentImage) imageChunks.push(chunk);
        assert.deepEqual(Buffer.concat(imageChunks), png);
        await assert.rejects(daily.answerQuestion(active.uid, after._id, old.id, ['B']),
            (error) => error.name === 'ValidationError' && error.params[0] === 'questionId' && /更换|刷新/.test(error.params[2]));
        assert(!((await daily.sessionColl.findOne({ _id: after._id })).items[0].answer));
        const answered = await daily.answerQuestion(active.uid, after._id, replacement.id, replacement.objective.answers);
        assert.equal(answered.session.items[0].answer.correct, true);
        assert.equal(answered.session.items[0].answer.earnedPoints, old.points);
    });

    await check('Answered current feedback cannot be swapped; completed-day replacement targets tomorrow without settling today', async () => {
        const initial = await daily.getSession(completed.uid);
        const first = initial.session.items[0];
        await daily.answerQuestion(completed.uid, initial.session._id, first.id, ['B']);
        let preview = await readUpcoming(completed.uid);
        assert.equal(preview.items[0].awaitingAcknowledgement, true);
        const beforeAnswered = await coreState();
        denied(await post(completed.uid, replaceBody(preview, preview.items[0])));
        assert.deepEqual(await coreState(), beforeAnswered);
        await daily.nextQuestion(completed.uid, initial.session._id, first.id);
        const second = (await daily.getSession(completed.uid)).session.items[1];
        await daily.answerQuestion(completed.uid, initial.session._id, second.id, second.objective.answers);
        // Make teacher-triggered reconciliation observable; a teacher must never settle this record.
        await daily.sessionColl.updateOne({ _id: initial.session._id }, { $set: { settledAnswers: 0 } });
        preview = await readUpcoming(completed.uid);
        assert.equal(preview.status, 'completed');
        assert.equal(preview.next.day, offsetDay(1));
        const beforeTomorrow = await coreState();
        const changed = await replace(completed.uid, preview.next, preview.next.items[0]);
        assert.equal(changed.status, 'completed');
        assert.deepEqual(await coreState(), beforeTomorrow);
        assert.notEqual(changed.next.items[0].sourceId, preview.next.items[0].sourceId);
        assert(changed.next.items.every((item) => !initial.session.items.some((old) => old.sourceId === item.sourceId)));
        const actual = await daily.getSession(completed.uid, nowFor(offsetDay(1)));
        assert.deepEqual(actual.session.items.map((item) => [item.id, item.domainId, item.sourceId, item.points]), selection(changed.next));
    });

    await check('Policy and membership edits invalidate stale swaps; deleted planned material falls back to eligible live sources', async () => {
        const target = await student('配置更新后重新选题', [{ domainId: python, count: 2 }]);
        const preview = await readUpcoming(target.uid);
        const changed = await replace(target.uid, preview, preview.items[0]);
        await daily.savePolicy(target.uid, { ...target.policy, domains: [{ ...target.policy.domains[0], tags: ['不应抽取'], count: 1, points: [3] }] }, teacherId);
        const before = await coreState();
        denied(await post(target.uid, replaceBody(changed, changed.items[0])));
        assert.deepEqual(await coreState(), before);
        await daily.savePolicy(target.uid, target.policy, teacherId);
        const restored = await readUpcoming(target.uid);
        await domains.setUserInDomain(python, target.uid, { join: false, role: 'guest' });
        try { denied(await post(target.uid, replaceBody(restored, restored.items[0]))); }
        finally { await domains.setUserInDomain(python, target.uid, { join: true, role: 'default' }); }
        const current = await readUpcoming(target.uid);
        const updated = await replace(target.uid, current, current.items[0]);
        const chosen = updated.items[0];
        const source = await document.coll.findOne(sourceFilter(chosen));
        await document.coll.deleteOne(sourceFilter(chosen));
        try {
            const fallback = await readUpcoming(target.uid);
            assert.equal(fallback.total, 2);
            assert(fallback.items.every((item) => item.sourceId !== chosen.sourceId));
            uniqueness(fallback.items);
            const actual = await daily.getSession(target.uid);
            assert.deepEqual(actual.session.items.map((item) => [item.id, item.domainId, item.sourceId, item.points]), selection(fallback));
        } finally { await document.coll.insertOne(source); }
    });

    await check('A student answer read before replacement cannot attach the old-source result to the new question', async () => {
        const target = await student('答案与换题竞争', [{ domainId: python, count: 2 }]);
        const actual = await daily.getSession(target.uid);
        const old = actual.session.items[0];
        const preview = await readUpcoming(target.uid);
        const originalUpdate = daily.sessionColl.updateOne;
        let release;
        let reached;
        const paused = new Promise((resolve) => { reached = resolve; });
        const unblock = new Promise((resolve) => { release = resolve; });
        daily.sessionColl.updateOne = async function instrument(filter, update, ...args) {
            if (filter._id === actual.session._id && update.$set?.['items.0.answer']) {
                reached();
                await unblock;
            }
            return originalUpdate.call(this, filter, update, ...args);
        };
        const pendingAnswer = daily.answerQuestion(target.uid, actual.session._id, old.id, old.objective.answers);
        // Install a rejection handler before another asynchronous operation can complete.
        const settledAnswer = pendingAnswer.then((value) => ({ value }), (error) => ({ error }));
        try {
            await Promise.race([paused, new Promise((_, reject) => setTimeout(() => reject(new Error('Answer race hook did not pause')), 5000))]);
            const changed = await replace(target.uid, preview, preview.items[0]);
            assert.notEqual(changed.items[0].id, old.id);
            release();
            const outcome = await settledAnswer;
            const fresh = await daily.sessionColl.findOne({ _id: actual.session._id });
            assert(!fresh.items[0].answer, 'Old-source answers must never be written onto the new-source snapshot');
            if (!outcome.error) assert(!outcome.value.session.items[0].answer);
            assert.equal(await daily.progressColl.countDocuments({ uid: target.uid }), 0);
            assert.equal((await users.coll.findOne({ _id: target.uid })).lotteryPoints, 21);
        } finally {
            release();
            daily.sessionColl.updateOne = originalUpdate;
            await settledAnswer;
        }
    });

    await check('Simultaneous first login requests allocate one identical round and preserve a concurrent teacher selection lock', async () => {
        const target = await student('并发首次登录', mixedRules);
        const sessions = await Promise.all(Array.from({ length: 8 }, () => daily.getSession(target.uid)));
        assert.equal(await daily.sessionColl.countDocuments({ uid: target.uid }), 1);
        const expected = sessions[0].session.items.map((item) => [item.id, item.domainId, item.sourceId, item.points]);
        for (const result of sessions) {
            assert.equal(result.session._id, sessions[0].session._id);
            assert.deepEqual(result.session.items.map((item) => [item.id, item.domainId, item.sourceId, item.points]), expected);
        }
        const preview = await readUpcoming(target.uid);
        const responses = await Promise.all(preview.items.slice(0, 2).map((item) => post(target.uid, replaceBody(preview, item))));
        responses.forEach((response) => status(response, 200));
        const refreshed = await readUpcoming(target.uid);
        assert(refreshed.items[0].sourceId !== preview.items[0].sourceId);
        assert(refreshed.items[1].sourceId !== preview.items[1].sourceId);
        assert.deepEqual(selection({ items: refreshed.items.slice(2) }), selection({ items: preview.items.slice(2) }));
        assert.equal(new Set(refreshed.items.map((item) => item.id)).size, refreshed.items.length);
        uniqueness(refreshed.items);
    });

    await check('An expired attachment copier cannot overwrite a newer teacher lease or duplicate the sole alternative', async () => {
        const did = 'replacement-fenced';
        await domains.add(did, teacherId, '换题并发保护', 'Isolated lease race');
        for (const index of [0, 1, 2]) await addSource(did, index, ['日常训练']);
        const target = await student('过期租约竞争校验', [{ domainId: did, count: 2, points: [5, 9] }]);
        const actual = await daily.getSession(target.uid);
        const preview = await readUpcoming(target.uid);
        const before = await daily.sessionColl.findOne({ _id: actual.session._id });
        const originalCopy = storage.copy;
        let release;
        let reached;
        let copiedTarget;
        const paused = new Promise((resolve) => { reached = resolve; });
        const unblock = new Promise((resolve) => { release = resolve; });
        storage.copy = async function delayedCopy(sourcePath, targetPath, ...args) {
            if (!copiedTarget && sourcePath.startsWith(`problem/${did}/`)) {
                copiedTarget = targetPath;
                reached();
                await unblock;
            }
            return originalCopy.call(this, sourcePath, targetPath, ...args);
        };
        const first = post(target.uid, replaceBody(preview, preview.items[0])).then((response) => response);
        try {
            await Promise.race([paused, new Promise((_, reject) => setTimeout(() => reject(new Error('Copy race hook did not pause')), 5000))]);
            await daily.planColl.updateOne({ _id: actual.session._id }, { $set: { lockUntil: new Date(0) } });
            await daily.planColl.updateOne({ _id: `pending:${target.uid}` }, { $set: { lockUntil: new Date(0) } });
            await daily.sessionColl.updateOne({ _id: actual.session._id }, { $set: { selectionLockUntil: new Date(0) } });
            const second = await replace(target.uid, preview, preview.items[1]);
            assert.equal(second.items[0].sourceId, preview.items[0].sourceId);
            assert.notEqual(second.items[1].sourceId, preview.items[1].sourceId);
            release();
            denied(await first);
            const after = await daily.sessionColl.findOne({ _id: actual.session._id });
            assert.deepEqual(after.items[0], before.items[0]);
            assert.equal(after.items[1].sourceId, second.items[1].sourceId);
            assert.equal(after.items[1].id, second.items[1].id);
            assert.equal(new Set(after.items.map((item) => item.id)).size, 2);
            uniqueness(after.items);
            assert.equal(await storage.exists(copiedTarget), false, 'A fenced copier retires its uncommitted snapshot attachment');
            assert.equal(after.selectionLockToken, undefined);
        } finally {
            release();
            storage.copy = originalCopy;
            await first;
        }
    });

    await check('Even without another teacher, an expired snapshot lease rejects the write and retires its new attachment', async () => {
        const target = await student('过期租约校验', [{ domainId: python, count: 2 }]);
        const actual = await daily.getSession(target.uid);
        const preview = await readUpcoming(target.uid);
        const before = await daily.sessionColl.findOne({ _id: actual.session._id });
        const originalCopy = storage.copy;
        let copiedTarget;
        storage.copy = async function expireCopy(sourcePath, targetPath, ...args) {
            if (!copiedTarget && sourcePath.startsWith(`problem/${python}/`)) {
                copiedTarget = targetPath;
                await daily.planColl.updateOne({ _id: actual.session._id }, { $set: { lockUntil: new Date(0) } });
                await daily.planColl.updateOne({ _id: `pending:${target.uid}` }, { $set: { lockUntil: new Date(0) } });
                await daily.sessionColl.updateOne({ _id: actual.session._id }, { $set: { selectionLockUntil: new Date(0) } });
            }
            return originalCopy.call(this, sourcePath, targetPath, ...args);
        };
        try {
            denied(await post(target.uid, replaceBody(preview, preview.items[0])));
            assert.deepEqual(await daily.sessionColl.findOne({ _id: actual.session._id }), before);
            assert.equal(await storage.exists(copiedTarget), false);
        } finally { storage.copy = originalCopy; }
    });

    await check('Scratch judgment and multiple-choice materials can be replaced and consumed with unchanged point quota', async () => {
        const target = await student('Scratch 每日练习', [{ domainId: scratch, count: 2, points: [0, 11] }]);
        const preview = await readUpcoming(target.uid);
        const changed = await replace(target.uid, preview, preview.items[0]);
        assert(changed.items.every((item) => item.domainId === scratch));
        assert.deepEqual(changed.items.map((item) => item.points), [0, 11]);
        uniqueness(changed.items);
        const actual = await daily.getSession(target.uid);
        assert.deepEqual(actual.session.items.map((item) => [item.id, item.domainId, item.sourceId, item.points]), selection(changed));
        assert(['single', 'multiple', 'judge'].includes(actual.session.items[0].objective.kind));
        for (const kind of ['judge', 'multiple']) {
            const typed = await student(`Scratch ${kind} 类型`, [{ domainId: scratch, count: 1, tags: [`题型:${kind}`], points: [7] }]);
            const typedPreview = await readUpcoming(typed.uid);
            assert.equal(typedPreview.items[0].kind, kind);
            const typedChanged = await replace(typed.uid, typedPreview, typedPreview.items[0]);
            assert.equal(typedChanged.items[0].kind, kind);
            const typedActual = await daily.getSession(typed.uid);
            assert.equal(typedActual.session.items[0].objective.kind, kind);
            assert.equal(typedActual.session.items[0].points, 7);
            assert.equal(typedActual.session.items[0].sourceId, typedChanged.items[0].sourceId);
        }
    });

    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} random replacement checks passed`);
    clearTimeout(timeout);
    if (process.env.DAILY_REPLACEMENT_SERVE === '1' && results.every(Boolean)) {
        const demo = await student('周沐辰 · 即将练习', mixedRules);
        const ongoing = await student('陈星宇 · 继续练习', mixedRules);
        await daily.getSession(ongoing.uid);
        console.log(`SMOKE ${JSON.stringify({ origin: `http://localhost:${port}`, username: teacherName, password,
            dashboardUrl: `http://localhost:${port}/manage/daily-quiz`,
            studentManagementUrl: `http://localhost:${port}/manage/users?uid=${demo.uid}`,
            students: { projected: demo, ongoing }, today, python, cpp, scratch })}`);
        return;
    }
    process.exit(results.every(Boolean) ? 0 : 1);
}
let started = false;
process.send = (message) => {
    if (message === 'ready' && !started) {
        started = true;
        run().catch((error) => { console.error(error.stack); process.exit(1); });
    }
    return true;
};
require('hydrooj/bin/hydrooj');
