/* Real Hydro HTTP + authenticated websocket tests; only a temporary MongoDB is used. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const supertest = require('supertest');
const WebSocket = require('ws');

const root = path.resolve(__dirname, '..');
// This checkout may share node_modules with another worktree. Always boot this
// checkout's workspace packages; never silently test the other worktree's code.
const packagePaths = new Map();
for (const folder of ['packages', 'framework']) {
    for (const name of fs.readdirSync(path.join(root, folder))) {
        const directory = path.join(root, folder, name);
        const manifest = path.join(directory, 'package.json');
        if (fs.existsSync(manifest)) packagePaths.set(JSON.parse(fs.readFileSync(manifest, 'utf8')).name, directory);
    }
}
const resolve = Module._resolveFilename;
Module._resolveFilename = function resolveWorkspace(request, ...args) {
    for (const [name, directory] of packagePaths) {
        if (request === name || request.startsWith(`${name}/`)) {
            return resolve.call(this, path.join(directory, request.slice(name.length)), ...args);
        }
    }
    return resolve.call(this, request, ...args);
};
process.env.CI = 'true';
process.env.NODE_APP_INSTANCE = '0';
process.env.MONGOMS_DOWNLOAD_DIR ||= path.join(os.homedir(), '.cache/mongodb-binaries');
const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-voice-integration-'));
os.homedir = () => testHome;
fs.mkdirSync(path.join(testHome, '.hydro'));
fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.join(root, 'packages/ui-default')]));
process.argv.push('--port', process.env.VOICE_CALL_PORT || '18897', '--host', '127.0.0.1');
const timer = setTimeout(() => { console.error('Voice integration timed out'); process.exit(2); }, 150000);
const results = [];
async function check(name, fn) {
    try { await fn(); results.push(true); console.log(`PASS ${name}`); }
    catch (error) { results.push(false); console.error(`FAIL ${name}\n${error.stack}`); }
}
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const frame = Buffer.alloc(640, 127).toString('base64');
const sockets = [];
async function run() {
    const { UserModel: users, DomainModel: domains, httpServer } = require('hydrooj');
    const teacherUid = await users.create('voice-teacher@example.test', 'voice_teacher', 'LocalTest123!');
    await users.setSuperAdmin(teacherUid);
    const domainId = 'voice-class';
    await domains.add(domainId, teacherUid, '语音测试课堂', 'Temporary test fixture');
    const studentUid = await users.createInDomain(domainId, 'voice-student@example.test', 'voice_student', 'LocalTest123!');
    const otherUid = await users.createInDomain(domainId, 'voice-other@example.test', 'voice_other', 'LocalTest123!');
    for (const uid of [studentUid, otherUid]) {
        await domains.setUserInDomain(domainId, uid, { join: true, role: 'default' });
        await users.setById(uid, { defaultDomain: domainId });
    }
    const origin = `http://127.0.0.1:${httpServer.address().port}`;
    const login = async (uname) => {
        const agent = supertest.agent(httpServer);
        const response = await agent.post('/login').send({ uname, password: 'LocalTest123!' });
        assert.equal(response.status, 302, response.text.slice(0, 500));
        return { agent, cookie: response.headers['set-cookie'].map((item) => item.split(';')[0]).join('; ') };
    };
    const teacher = await login('voice_teacher'); const student = await login('voice_student'); const other = await login('voice_other');
    const connect = async (account, tabId) => {
        const messages = [];
        const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/d/${domainId}/voice-call/conn`, {
            headers: { Cookie: account.cookie, Origin: origin },
        });
        sockets.push(ws);
        ws.on('message', (raw) => {
            const text = String(raw);
            if (text === 'ping') { ws.send('pong'); return; }
            try { messages.push(JSON.parse(text)); } catch { /* Transport heartbeat. */ }
        });
        await new Promise((resolveOpen, reject) => { ws.once('open', resolveOpen); ws.once('error', reject); });
        const send = (message) => ws.send(JSON.stringify(message));
        const wait = async (predicate, after = 0) => {
            for (let index = 0; index < 200; index++) {
                const message = messages.slice(after).find(predicate);
                if (message) return message;
                if (ws.readyState === WebSocket.CLOSED) throw new Error(`Voice socket closed: ${JSON.stringify(messages)}`);
                await delay(25);
            }
            throw new Error(`No expected voice event: ${JSON.stringify(messages)}`);
        };
        send({ type: 'hello', tabId, deviceId: `device-${tabId}`, mediaOwner: true, visible: true });
        await wait((message) => message.type === 'ready');
        return { ws, messages, send, wait };
    };
    let teacherSocket; let studentSocket; let observer; let outsider; let callId;
    await check('HTTP injects voice context for classroom and personal-domain pages', async () => {
        for (const account of [teacher, student]) {
            for (const target of [`/d/${domainId}/`, '/home/domain']) {
                const response = await account.agent.get(target);
                assert.equal(response.status, 200, response.text.slice(0, 500));
                assert.match(response.text, /voiceCall/);
                assert.match(response.text, /voice-call\/conn/);
            }
        }
    });
    await check('Real routes authenticate sockets and discover students', async () => {
        teacherSocket = await connect(teacher, 'teacher-tab-testing');
        studentSocket = await connect(student, 'student-tab-testing');
        observer = await connect(student, 'observer-tab-testing');
        outsider = await connect(other, 'outsider-tab-testing');
        teacherSocket.send({ type: 'list' });
        const roster = await teacherSocket.wait((message) => message.type === 'students');
        assert.equal(roster.students.find((item) => item.uid === studentUid).online, true);
    });
    await check('Ringing is silent until the student explicitly accepts', async () => {
        teacherSocket.send({ type: 'dial', studentUid });
        const ringing = await studentSocket.wait((message) => message.type === 'snapshot' && message.status === 'ringing');
        callId = ringing.callId;
        assert.equal(ringing.isOwner, false);
        teacherSocket.send({ type: 'audio', callId, seq: 0, data: frame }); await delay(100);
        assert.equal(studentSocket.messages.filter((message) => message.type === 'audio').length, 0);
        studentSocket.send({ type: 'accept', callId });
        await studentSocket.wait((message) => message.type === 'snapshot' && message.status === 'active' && message.isOwner);
        await teacherSocket.wait((message) => message.type === 'snapshot' && message.status === 'active');
    });
    await check('Audio crosses real websocket routes only between accepted owners', async () => {
        teacherSocket.send({ type: 'audio', callId, seq: 1, data: frame });
        const received = await studentSocket.wait((message) => message.type === 'audio');
        assert.equal(received.data, frame); assert.ok(received.streamId);
        studentSocket.send({ type: 'audio', callId, seq: 1, data: frame });
        assert.equal((await teacherSocket.wait((message) => message.type === 'audio')).data, frame);
        assert.equal(observer.messages.filter((message) => message.type === 'audio').length, 0);
        assert.equal(outsider.messages.filter((message) => message.type === 'audio').length, 0);
        outsider.send({ type: 'hangup', callId });
        await outsider.wait((message) => message.type === 'error' && message.code === 'NOT_FOUND');
    });
    await check('Student hang-up immediately ends both sides without touching screen sharing', async () => {
        studentSocket.send({ type: 'hangup', callId });
        await teacherSocket.wait((message) => message.type === 'ended' && message.callId === callId);
        await studentSocket.wait((message) => message.type === 'ended' && message.callId === callId);
        const beforeCount = studentSocket.messages.filter((message) => message.type === 'audio').length;
        teacherSocket.send({ type: 'audio', callId, seq: 2, data: frame }); await delay(100);
        assert.equal(studentSocket.messages.filter((message) => message.type === 'audio').length, beforeCount);
        const db = require('../packages/hydrooj/src/service/db').default;
        assert.equal(await db.collection('live.share.session').countDocuments({}), 0);
        const records = await db.collection('voice.call.session').find({}).toArray();
        assert.equal(records.length, 1); assert.equal(records[0].active, false);
        assert.equal(JSON.stringify(records).includes(frame), false);
    });
    for (const socket of sockets) socket.close();
    console.log(`RESULT ${results.filter(Boolean).length}/${results.length} voice integration checks passed`);
    clearTimeout(timer);
    if (process.env.VOICE_CALL_SERVE === '1' && results.every(Boolean)) {
        console.log(`VOICE_SMOKE ${JSON.stringify({ origin, domainId, teacher: 'voice_teacher', student: 'voice_student',
            other: 'voice_other', teacherUid, studentUid, otherUid, password: 'LocalTest123!' })}`);
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
