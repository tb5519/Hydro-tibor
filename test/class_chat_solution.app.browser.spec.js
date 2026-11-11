/* Real Hydro handlers, account permissions and bundled Monaco UI against a
 * temporary database. No application endpoint or editor is mocked. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fixtureMode = process.env.CLASS_CHAT_SOLUTION_FIXTURE === '1';

function startFixture() {
    const Module = require('node:module');
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
    const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'hydro-chat-solution-app-'));
    os.homedir = () => testHome;
    fs.mkdirSync(path.join(testHome, '.hydro'));
    fs.writeFileSync(path.join(testHome, '.hydro/addon.json'), JSON.stringify([path.join(root, 'packages/ui-default')]));
    process.argv.push('--port', process.env.CLASS_CHAT_SOLUTION_PORT || '18919', '--host', '127.0.0.1');
    const timeout = setTimeout(() => { console.error('Solution fixture timed out'); process.exit(2); }, 150000);
    let started = false;
    const sendToParent = process.send?.bind(process);
    process.send = (message) => {
        if (message === 'ready' && !started) {
            started = true;
            void (async () => {
                const { UserModel: users, DomainModel: domains, ProblemModel: problems, RecordModel: records, httpServer } = require('hydrooj');
                const { langs } = require('../packages/hydrooj/src/model/setting');
                Object.assign(langs, {
                    'py.py3': { display: 'Python 3', monaco: 'python', highlight: 'python' },
                    'cc.cc14': { display: 'C++14', monaco: 'cpp', highlight: 'cpp' },
                });
                const password = 'LocalSolution123!';
                const teacherUid = await users.create('solution-teacher@example.test', 'solution_teacher', password);
                await users.setSuperAdmin(teacherUid);
                const domainId = 'solution-class';
                await domains.add(domainId, teacherUid, '讲解实测课堂', 'Isolated browser fixture');
                const studentUid = await users.createInDomain(domainId, 'solution-student@example.test', 'solution_student', password);
                const otherUid = await users.createInDomain(domainId, 'solution-other@example.test', 'solution_other', password);
                for (const uid of [studentUid, otherUid]) {
                    await domains.setUserInDomain(domainId, uid, { join: true, role: 'default' });
                    await users.setById(uid, { defaultDomain: domainId, codeLang: 'cc.cc14', cppEditorMode: 'beginner' });
                }
                await users.setById(teacherUid, { defaultDomain: domainId, codeLang: 'cc.cc14', cppEditorMode: 'proficient' });
                const pid = await problems.add(domainId, 'EXPLAIN1', '逐步分析加法',
                    '## 题目描述\n\n输入一个整数，输出它加一的结果。\n\n## 输入格式\n\n一个整数。\n\n## 输出格式\n\n一个整数。', teacherUid,
                    ['顺序结构'], { config: { type: 'default', langs: ['py.py3', 'cc.cc14'] } });
                process.on('message', async (request) => {
                    if (request?.type !== 'inspect-solution-records') return;
                    try {
                        const teacher = await users.coll.findOne({ _id: teacherUid }, { projection: { cppEditorMode: 1 } });
                        const created = await records.coll.find({ domainId, pid, uid: teacherUid })
                            .project({ _id: 1, code: 1, lang: 1, contest: 1 }).toArray();
                        sendToParent?.({ type: 'solution-records', requestId: request.requestId,
                            mode: teacher.cppEditorMode, records: created.map((record) => ({ ...record,
                                id: record._id.toHexString(), contest: record.contest?.toHexString() || null })) });
                    } catch (error) { sendToParent?.({ type: 'solution-records', requestId: request.requestId, error: error.message }); }
                });
                const origin = `http://127.0.0.1:${httpServer.address().port}`;
                const supertest = require('supertest');
                const agent = supertest.agent(httpServer);
                assert.equal((await agent.post('/login').send({ uname: 'solution_teacher', password })).status, 302);
                const response = await agent.get(`/d/${domainId}/p/${pid}`);
                assert.equal(response.status, 200, response.text.slice(0, 600));
                clearTimeout(timeout);
                console.log(`SOLUTION_APP_READY ${JSON.stringify({ origin, domainId, pid, teacherUid, studentUid, otherUid,
                    teacher: 'solution_teacher', student: 'solution_student', other: 'solution_other', password, testHome })}`);
            })().catch((error) => { console.error(error.stack); process.exit(1); });
        }
        return true;
    };
    require('hydrooj/bin/hydrooj');
}

if (fixtureMode) startFixture();
else {
    const { spawn } = require('node:child_process');
    const { before, after, it } = require('node:test');
    let playwright;
    for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
        try { playwright = require(location); break; } catch { /* Use the installed browser runtime. */ }
    }
    const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
        path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
        .find((entry) => entry && fs.existsSync(entry));
    let browser; let server; let fixture; let logs = ''; let exited = false; let stage = 'fixture'; let failed = false; let compilerSandbox;
    const participants = [];

    before(async () => {
        assert(executablePath, 'Chromium is required for the real solution workspace test');
        server = spawn(process.execPath, ['-r', '@hydrooj/register', __filename], {
            cwd: root, env: { ...process.env, CLASS_CHAT_SOLUTION_FIXTURE: '1' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        });
        fixture = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error(`Hydro fixture did not become ready:\n${logs.slice(-12000)}`)), 155000);
            const inspect = (chunk) => {
                logs += chunk.toString(); if (logs.length > 160000) logs = logs.slice(-120000);
                const match = logs.match(/SOLUTION_APP_READY (\{[^\n]+\})/);
                if (match) { clearTimeout(timeout); resolve(JSON.parse(match[1])); }
            };
            server.stdout.on('data', inspect); server.stderr.on('data', inspect);
            server.once('error', reject);
            server.once('exit', (code) => { exited = true; clearTimeout(timeout); reject(new Error(`Fixture exited ${code}:\n${logs.slice(-12000)}`)); });
        });
        browser = await playwright.chromium.launch({ executablePath, headless: true });
        const sandbox = process.env.CLASS_CHAT_SOLUTION_SANDBOX_URL || process.env.IDE_SANDBOX_TEST_URL || 'http://127.0.0.1:15051';
        try {
            const response = await fetch(`${sandbox}/version`, { signal: AbortSignal.timeout(1500) });
            if (response.ok && (await response.json()).buildVersion) compilerSandbox = sandbox;
        } catch { /* Compiling the emitted source is optional when no local Linux sandbox is available. */ }
        if (!compilerSandbox) console.log('SKIP emitted C++ compile/run: no dedicated local Linux compiler sandbox');
    }, { timeout: 170000 });

    after(async () => {
        if (failed) {
            for (const { page, name, errors } of participants) {
                if (page.isClosed()) continue;
                await page.screenshot({ path: path.join(os.tmpdir(), `onebyone-solution-${name}-failure.png`) }).catch(() => {});
                console.error(JSON.stringify({ stage, participant: name, url: page.url(), errors }));
            }
            console.error(logs.slice(-14000));
        }
        await browser?.close();
        if (server && !exited) {
            server.kill('SIGTERM');
            await Promise.race([new Promise((resolve) => server.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 5000))]);
            if (!exited) server.kill('SIGKILL');
        }
        if (fixture?.testHome) fs.rmSync(fixture.testHome, { recursive: true, force: true });
    });

    async function participant(name) {
        const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
        const login = await context.request.post(`${fixture.origin}/login`, {
            form: { uname: fixture[name], password: fixture.password }, maxRedirects: 0,
        });
        assert.equal(login.status(), 302, (await login.text()).slice(0, 600));
        const page = await context.newPage(); page.setDefaultTimeout(20000);
        const errors = []; page.on('pageerror', (error) => errors.push(error.message));
        participants.push({ page, context, name, errors });
        return { page, context };
    }
    async function activeFrame(page, selector) {
        await page.waitForFunction((selector) => {
            const current = window.__onebyonePlatformShell?.contentWindow() || window;
            return !!current.document.querySelector(selector);
        }, selector);
        for (const frame of page.frames()) if (await frame.locator(selector).count()) return frame;
        throw new Error(`Missing current application frame for ${selector}`);
    }
    async function editorValue(frame) {
        return frame.evaluate(() => (window.__onebyoneSolutionWorkspace?.editor || window.editor)?.getValue());
    }
    async function typeCode(page, frame, code) {
        const input = frame.locator('.monaco-editor textarea.inputarea').first();
        await input.waitFor({ state: 'attached' }); await input.focus();
        await page.keyboard.press('ControlOrMeta+A'); await page.keyboard.insertText(code);
        await frame.waitForFunction((code) => (window.__onebyoneSolutionWorkspace?.editor || window.editor)?.getValue() === code, code);
    }
    async function annotateStatement(page, frame, text) {
        const selected = await frame.locator('[data-solution-annotation-text="statement"]').evaluate((statement) => {
            const walker = document.createTreeWalker(statement, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                const start = node.textContent.indexOf('输入一个整数');
                if (start < 0) continue;
                const range = document.createRange(); range.setStart(node, start); range.setEnd(node, start + 6);
                const rect = range.getBoundingClientRect();
                return { x: rect.left, y: rect.top + rect.height / 2, width: rect.width };
            }
            throw new Error('Expected statement sentence is absent');
        });
        const frameBox = frame.parentFrame() ? await (await frame.frameElement()).boundingBox() : { x: 0, y: 0 };
        const x = frameBox.x + selected.x; const y = frameBox.y + selected.y;
        await page.mouse.move(x, y); await page.mouse.down();
        await page.mouse.move(x + selected.width, y, { steps: 8 }); await page.mouse.up();
        await page.keyboard.press('Shift+Enter');
        const note = frame.locator('textarea[data-share-annotation-input]').last();
        await note.waitFor({ state: 'visible' }); await note.fill(text);
        await frame.waitForFunction((text) => window.__onebyoneSolutionWorkspace.serialize().annotations.text.some((item) => item.text === text), text);
    }
    async function annotateCode(page, frame, text) {
        await frame.evaluate(() => {
            const editor = window.__onebyoneSolutionWorkspace.editor;
            editor.focus(); editor.setSelection({ startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 7 });
        });
        await page.keyboard.press('Shift+Enter');
        const note = frame.locator('textarea[data-share-annotation-input]').last();
        await note.waitFor({ state: 'visible' }); await note.fill(text);
        await frame.waitForFunction((text) => window.__onebyoneSolutionWorkspace.serialize().annotations.code.some((item) => item.text === text), text);
    }
    const problemPath = () => `/d/${fixture.domainId}/p/${fixture.pid}`;
    const chatPath = () => `/d/${fixture.domainId}/class-chat`;
    function inspectRecords() {
        const requestId = Math.random().toString(36).slice(2);
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => { server.off('message', receive); reject(new Error('Fixture record read timed out')); }, 5000);
            const receive = (message) => {
                if (message?.type !== 'solution-records' || message.requestId !== requestId) return;
                clearTimeout(timeout); server.off('message', receive);
                if (message.error) reject(new Error(message.error)); else resolve(message);
            };
            server.on('message', receive); server.send({ type: 'inspect-solution-records', requestId });
        });
    }
    async function executeRecordedCpp(source, label) {
        if (!compilerSandbox) return;
        const request = async (body) => {
            const response = await fetch(`${compilerSandbox}/run`, { method: 'POST',
                headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cmd: [body] }), signal: AbortSignal.timeout(45000) });
            assert.equal(response.status, 200);
            return (await response.json())[0];
        };
        const limits = { env: ['PATH=/usr/bin:/bin', 'HOME=/w', 'LANG=C.UTF-8'],
            cpuLimit: 20e9, clockLimit: 40e9, memoryLimit: 256 * 1024 * 1024, procLimit: 16,
            files: [{ content: '' }, { name: 'stdout', max: 65536 }, { name: 'stderr', max: 65536 }] };
        const compiled = await request({ ...limits, args: ['/usr/bin/g++', '-std=c++14', '-O0', '-o', '/w/main', '/w/main.cpp'],
            copyIn: { 'main.cpp': { content: source } }, copyOutCached: ['main'], copyOutMax: 4 * 1024 * 1024 });
        assert.equal(compiled.status, 'Accepted', `${label} source must compile: ${JSON.stringify(compiled)}`);
        const binary = compiled.fileIds.main;
        try {
            const result = await request({ ...limits, args: ['/w/main'], cpuLimit: 1e9, clockLimit: 3e9,
                files: [{ content: '41\n' }, { name: 'stdout', max: 1024 }, { name: 'stderr', max: 1024 }],
                copyIn: { main: { fileId: binary } } });
            assert.equal(result.status, 'Accepted', JSON.stringify(result));
            assert.equal(result.files.stdout.trim(), '42', `${label} must execute the actual recorded beginner source`);
            console.log(`PASS actual recorded ${label} C++ compiles and prints 42 in local Linux sandbox`);
        } finally {
            await fetch(`${compilerSandbox}/file/${encodeURIComponent(binary)}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) });
        }
    }
    async function queueRun(teacher, frame, pretest, expectedCode) {
        const request = teacher.page.waitForResponse((response) => new URL(response.url()).pathname.endsWith('/submit')
            && response.request().method() === 'POST' && response.request().postDataJSON()?.pretest === pretest);
        await frame.locator(pretest ? 'button[data-solution-run]' : 'button[data-solution-submit]').click();
        const response = await request;
        assert.equal(response.status(), 200, (await response.text()).slice(0, 900));
        const body = response.request().postDataJSON();
        assert.equal(body.source, 'teaching-solution');
        assert.equal(body.lang, 'cc.cc14');
        assert.equal(body.code, expectedCode, 'the teaching editor sends its raw header-free source');
        assert.equal(body.solutionSource, await frame.evaluate(() => UiContext.classChatSolution.sourceMessageId));
        if (pretest) assert(Array.isArray(body.input));
        const result = await response.json();
        const state = await inspectRecords();
        const record = state.records.find((item) => item.id === result.rid);
        assert(record, 'the real submission handler must create a teacher-owned record');
        assert.equal(state.mode, 'proficient', 'temporary learner mode must not overwrite teacher settings');
        assert.match(record.code, /#include\s*</);
        assert.match(record.code, /\bmain\s*\(/);
        assert(record.code.includes(expectedCode), 'beginner wrapping must retain raw source');
        assert.equal(record.contest === '000000000000000000000000', pretest);
        assert.equal(await editorValue(frame), expectedCode, 'wrapping must not leak back into the teaching editor');
        await executeRecordedCpp(record.code, pretest ? 'self-test' : 'submission');
    }
    it('teaches a frozen snapshot privately, saves a standard, sends an immutable read-only solution and preserves the learner latest draft',
        { timeout: 150000 }, async () => {
            try {
                const teacher = await participant('teacher'); const student = await participant('student'); const other = await participant('other');
                stage = 'student live editor and chat snapshot';
                await student.page.goto(`${fixture.origin}${problemPath()}?scratchpad=1`, { waitUntil: 'domcontentloaded' });
                const studentFrame = await activeFrame(student.page, '#scratchpad .monaco-editor');
                const sentCode = 'int number;\ncin >> number;\ncout << number;';
                await typeCode(student.page, studentFrame, sentCode);
                await student.page.locator('.class-chat__launcher').click();
                const sent = student.page.waitForResponse((response) => response.url().includes('/class-chat')
                    && response.request().method() === 'POST' && response.request().postDataJSON()?.operation === 'send');
                await student.page.locator('[data-snapshot]').click();
                const sentReply = await (await sent).json();
                const sourceId = sentReply.message.id;
                assert.equal(sentReply.message.kind, 'snapshot');
                await student.page.locator('.class-chat__panel [data-close]').click();
                const latestDraft = `${sentCode}\ncout << "my newest work stays here";`;
                await typeCode(student.page, studentFrame, latestDraft);

                stage = 'teacher solution editor';
                await teacher.page.goto(`${fixture.origin}/d/${fixture.domainId}/`, { waitUntil: 'domcontentloaded' });
                await teacher.page.locator('.class-chat__launcher').click();
                await teacher.page.locator(`[data-peer-uid="${fixture.studentUid}"]`).click();
                await teacher.page.locator(`[data-message-id="${sourceId}"] a.class-chat__code-card`).click();
                let teacherFrame = await activeFrame(teacher.page, '[data-solution-workspace] .monaco-editor');
                assert.equal(await teacher.page.locator('.class-chat__panel').isVisible(), false, 'opening a snapshot should uncover the workspace');
                assert.equal(await teacherFrame.locator('[data-solution-annotation-text="statement"]').count(), 1);
                assert.equal(await editorValue(teacherFrame), sentCode);
                assert.equal(await teacherFrame.evaluate(() => UiContext.classChatSolution.cppEditorMode), 'beginner');
                const standardCode = 'int number;\ncin >> number;\ncout << number + 1;';
                await typeCode(teacher.page, teacherFrame, standardCode);
                const explanation = '读入以后再加一';
                await annotateStatement(teacher.page, teacherFrame, explanation);
                const codeExplanation = '变量保存输入的整数';
                await annotateCode(teacher.page, teacherFrame, codeExplanation);

                stage = 'save and load teacher standard';
                const saving = teacher.page.waitForResponse((response) => response.url().includes('/class-chat')
                    && response.request().method() === 'POST' && response.request().postDataJSON()?.operation === 'solutionStandardSave');
                await teacherFrame.locator('[data-solution-action="save-standard"]').click();
                const standardReply = await (await saving).json();
                assert(standardReply.standard.annotations.text.some((note) => note.text === explanation));
                assert(standardReply.standard.annotations.code.some((note) => note.text === codeExplanation));
                stage = 'fast teacher navigation preserves unsaved local edits';
                const quickEdit = 'cout << "temporary teacher edit before navigation";';
                await typeCode(teacher.page, teacherFrame, quickEdit);
                await teacher.page.goto(`${fixture.origin}/d/${fixture.domainId}/`, { waitUntil: 'domcontentloaded' });
                await teacher.page.goto(`${fixture.origin}${chatPath()}/solution/${sourceId}`, { waitUntil: 'domcontentloaded' });
                teacherFrame = await activeFrame(teacher.page, '[data-solution-workspace] .monaco-editor');
                await teacherFrame.waitForFunction((code) => window.__onebyoneSolutionWorkspace?.editor?.getValue() === code, quickEdit);
                await teacherFrame.locator('[data-solution-action="load-standard"]').click();
                await teacherFrame.waitForFunction((code) => window.__onebyoneSolutionWorkspace?.editor?.getValue() === code, standardCode);

                stage = 'real beginner self-test and submission records';
                await queueRun(teacher, teacherFrame, true, standardCode);
                await teacher.page.goto(`${fixture.origin}${chatPath()}/solution/${sourceId}`, { waitUntil: 'domcontentloaded' });
                teacherFrame = await activeFrame(teacher.page, '[data-solution-workspace] .monaco-editor');
                await queueRun(teacher, teacherFrame, false, standardCode);
                await teacher.page.goto(`${fixture.origin}${chatPath()}/solution/${sourceId}`, { waitUntil: 'domcontentloaded' });
                teacherFrame = await activeFrame(teacher.page, '[data-solution-workspace] .monaco-editor');
                assert.equal(await teacherFrame.locator('.scratchpad__records,.record-list,.scratchpad__records-scroll').count(), 0);
                await teacher.page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-solution-teacher-workspace.png') });

                stage = 'immutable solution message';
                const sending = teacher.page.waitForResponse((response) => response.url().includes('/class-chat')
                    && response.request().method() === 'POST' && response.request().postDataJSON()?.operation === 'solutionSend');
                await teacherFrame.locator('[data-solution-action="send"]').click();
                const reply = await (await sending).json();
                assert.equal(reply.message.kind, 'solution');
                assert.equal(reply.message.solution.sourceMessageId, sourceId);
                assert(reply.message.solution.annotationCount >= 2);
                const immutableUrl = reply.message.solution.url;
                await typeCode(teacher.page, teacherFrame, 'cout << "edited after delivery";');
                const solutionCard = student.page.locator(`[data-message-id="${reply.message.id}"] a.class-chat__code-card`);
                await solutionCard.waitFor({ state: 'visible' });
                await solutionCard.click();
                const learnerFrame = await activeFrame(student.page, '[data-solution-workspace] .monaco-editor');
                assert.equal(await student.page.locator('.class-chat__panel').isVisible(), false, 'opening a delivered solution should close the message panel');
                assert.equal(await editorValue(learnerFrame), standardCode);
                await learnerFrame.locator('[data-share-annotation-text]').filter({ hasText: explanation }).waitFor({ state: 'visible' });
                await learnerFrame.locator('[data-share-annotation-text]').filter({ hasText: codeExplanation }).waitFor({ state: 'visible' });
                assert.equal(await learnerFrame.locator('textarea[data-share-annotation-input]').count(), 0, 'learner notes are display text only');
                await student.page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-solution-learner-readonly.png') });
                await learnerFrame.locator('.monaco-editor textarea.inputarea').first().focus();
                await student.page.keyboard.insertText('learner must not edit this');
                assert.equal(await editorValue(learnerFrame), standardCode);
                assert.equal(await learnerFrame.locator('[data-solution-action="send"]').count(), 0);
                const unauthorizedWrite = await student.context.request.post(`${fixture.origin}${chatPath()}`, {
                    data: { operation: 'solutionSave', snapshotId: sourceId, revision: 0,
                        content: { code: 'forbidden', lang: 'cc.cc14', annotations: { version: 1, text: [], code: [], ink: [] } } },
                });
                assert.equal(unauthorizedWrite.status(), 403, 'learner write permission must be denied on server');
                const stranger = await other.context.request.get(new URL(immutableUrl, fixture.origin).href);
                assert(stranger.status() >= 400 && stranger.status() < 500, 'another learner must not read the solution');

                stage = 'return to newest learner draft';
                const back = learnerFrame.locator('[data-solution-return]');
                const target = new URL(await back.getAttribute('href'), fixture.origin);
                assert.equal(target.pathname, problemPath());
                await back.click();
                const restoredFrame = await activeFrame(student.page, '#scratchpad .monaco-editor');
                await restoredFrame.waitForFunction((code) => window.editor?.getValue() === code, latestDraft);
                // uid is explicitly the learner, never a teacher or snapshot storage key.
                assert.equal(await restoredFrame.evaluate(({ uid, domainId, pid }) => localStorage.getItem(`${uid}/${domainId}/${pid}`),
                    { uid: fixture.studentUid, domainId: fixture.domainId, pid: fixture.pid }), latestDraft);
                assert.equal(await editorValue(restoredFrame), latestDraft);

                stage = 'standard survives teacher navigation';
                await teacher.page.goto(`${fixture.origin}${chatPath()}/solution/${sourceId}`, { waitUntil: 'domcontentloaded' });
                teacherFrame = await activeFrame(teacher.page, '[data-solution-workspace] .monaco-editor');
                await teacherFrame.locator('[data-solution-action="load-standard"]').click();
                await teacherFrame.waitForFunction((code) => window.__onebyoneSolutionWorkspace?.editor?.getValue() === code, standardCode);
                console.log('PASS real snapshot teaching, standard persistence, immutable learner view, isolation and latest draft restoration');
            } catch (error) { failed = true; throw error; }
        });
}
