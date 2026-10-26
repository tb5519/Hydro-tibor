const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { buildSync, transformSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const ts = require('typescript');
const root = path.resolve(__dirname, '../packages/ui-default');
const code = buildSync({ entryPoints: [path.join(root, 'components/contest_practice_result.ts')], bundle: true, write: false, platform: 'node', format: 'cjs' }).outputFiles[0].text;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((yes) => { resolve = yes; }); return { promise, resolve }; };
const record = (id, status = 1, more = {}) => ({ _id: id, uid: 23, status, practiceContest: 'contest-1', ...more });
function fixture() {
    const dom = new JSDOM('<body><button id="submit">提交</button></body>', { url: 'https://oj.test/p/1', pretendToBeVisual: true });
    const win = dom.window; const timers = new Map(); let now = 0; let next = 0;
    win.setTimeout = (fn, delay = 0) => { timers.set(++next, { fn, at: now + delay }); return next; };
    win.clearTimeout = (id) => timers.delete(id);
    win.matchMedia = () => ({ matches: false });
    const mod = { exports: {} }; vm.runInNewContext(code, { module: mod, exports: mod.exports, URL });
    const api = mod.exports; const client = api.createContestPracticeFeedback(23, win);
    return {
        dom, win, api, client, timers, document: win.document,
        create: () => api.createContestPracticeFeedback(23, win),
        modal: () => win.document.querySelector('[data-contest-practice-result]'),
        async tick(ms) {
            const until = now + ms;
            for (;;) {
                const next = [...timers.entries()].filter(([, timer]) => timer.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
                if (!next) break;
                now = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
            }
            now = until; await flush();
        },
        async dismiss() { win.document.querySelector('.contest-practice-result__continue')?.click(); await this.tick(160); },
        close() { client.dispose(); win.close(); },
    };
}

describe('post-contest ordinary practice results', () => {
    it('waits for both AC and achievements, then shows an ordinary result without contest points', async (t) => {
        const h = fixture(); t.after(h.close);
        const ac = deferred(); const achievement = deferred();
        h.document.getElementById('submit').focus();
        const finished = h.client.afterResult(record('r1', 1, { score: 100, scorePointAward: { points: 900 } }), true, ac.promise.then(() => achievement.promise));
        await flush(); assert.equal(h.modal(), null);
        ac.resolve(); await flush(); assert.equal(h.modal(), null);
        achievement.resolve(); await flush();
        assert.match(h.modal().textContent, /比赛已结束，本次结果不计入比赛成绩/);
        assert.match(h.modal().textContent, /本次提交已按普通练习评测/);
        assert.match(h.modal().textContent, /本题 AC/);
        assert.doesNotMatch(h.modal().textContent, /900|累计得分|题已 AC|积分/);
        assert.equal(h.document.activeElement.className, 'contest-practice-result__continue');
        await h.dismiss(); await finished;
        assert.equal(h.modal(), null); assert.equal(h.document.activeElement.id, 'submit');
    });

    it('shows every new failed or accepted result once, with duplicates sharing the same queue', async (t) => {
        const h = fixture(); t.after(h.close);
        const first = h.client.afterResult(record('r1', 2), true);
        assert.equal(h.client.afterResult(record('r1', 2), true), first);
        const second = h.client.afterResult(record('r2', 1), true);
        await flush(); assert.equal(h.modal().dataset.contestPracticeResult, 'r1');
        assert.match(h.modal().textContent, /WA/);
        await h.dismiss(); await first;
        assert.equal(h.modal().dataset.contestPracticeResult, 'r2');
        await h.dismiss(); await second;
        await h.client.afterResult(record('r1', 1), true); assert.equal(h.modal(), null, 'rejudge does not replay an old result');
    });

    it('ignores non-live history, other learners, real contest results, pretests and unfinished judging', async (t) => {
        const h = fixture(); t.after(h.close);
        for (const [value, live] of [
            [record('old'), false], [record('other', 1, { uid: 24 }), true],
            [record('contest', 1, { contest: 'contest-1' }), true], [record('normal', 1, { practiceContest: undefined }), true],
            [record('pretest', 1, { input: '' }), true], [record('pending', 20), true], [record('compile', 21), true],
        ]) await h.client.afterResult(value, live);
        assert.equal(h.modal(), null);
        assert.equal(h.win.sessionStorage.length, 0);
    });

    it('shows terminal judge failures without needing a scorePointAward', async (t) => {
        const h = fixture(); t.after(h.close);
        for (const status of [2, 3, 4, 5, 6, 7, 8, 9, 10, 30, 31]) {
            const finished = h.client.afterResult(record(`r${status}`, status), true);
            await flush(); assert.ok(h.modal(), `status ${status}`);
            await h.dismiss(); await finished;
        }
    });

    it('remembers shown records across refresh or page reinitialization and tolerates blocked storage', async (t) => {
        const h = fixture(); t.after(h.close);
        h.client.afterResult(record('r1'), true); await flush(); await h.dismiss();
        const history = h.win.sessionStorage.getItem('hydro:contest-practice:shown:23');
        const next = fixture(); t.after(next.close);
        next.win.sessionStorage.setItem('hydro:contest-practice:shown:23', history);
        const reopened = next.create(); t.after(() => reopened.dispose());
        await reopened.afterResult(record('r1'), true); assert.equal(next.modal(), null);
        Object.defineProperty(next.win, 'sessionStorage', { get() { throw new Error('blocked'); } });
        const blocked = next.create(); t.after(() => blocked.dispose());
        blocked.afterResult(record('new'), true); await flush(); assert.ok(next.modal()); await next.dismiss();
    });

    it('traps keyboard focus, dismisses by Escape, and cancels unfinished effects on pagehide', async (t) => {
        const h = fixture(); t.after(h.close);
        const effect = deferred(); h.client.afterResult(record('late'), true, effect.promise);
        h.win.dispatchEvent(new h.win.PageTransitionEvent('pagehide', { persisted: true })); effect.resolve(); await flush();
        assert.equal(h.modal(), null);
        h.client.afterResult(record('now'), true); await flush();
        h.document.dispatchEvent(new h.win.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        assert.equal(h.document.activeElement.className, 'contest-practice-result__continue');
        h.document.dispatchEvent(new h.win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await h.tick(160); assert.equal(h.modal(), null);
        assert.equal(h.document.body.style.overflow, '');
    });
});

function extractFunctions(names) {
    const source = fs.readFileSync(path.join(root, 'pages/problem_detail.page.tsx'), 'utf8');
    const tree = ts.createSourceFile('page.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found = new Map();
    const visit = (node) => {
        if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)) found.set(node.name.text, node.getText(tree));
        ts.forEachChild(node, visit);
    };
    visit(tree);
    return names.map((name) => { assert.ok(found.has(name), name); return found.get(name); }).join('\n');
}

describe('problem page practice routing integration', () => {
    it('does not add practice ACs or scores to the contest and waits for effects before the result', async (t) => {
        const h = fixture(); t.after(h.close);
        const ac = deferred(); const awards = deferred(); const received = [];
        const context = {
            UiContext: { isContestProblem: true, tdoc: { scoreToPoints: true, rule: 'oi', pids: [1] } },
            STATUS: { STATUS_ACCEPTED: 1 }, normalStatuses: new Set([1, 2]),
            isContestPracticeRecord: h.api.isContestPracticeRecord,
            isContestPracticeResultReady: h.api.isContestPracticeResultReady,
            getRecordId: (value) => value._id,
            isCurrentFormalSubmitRecord: () => true,
            isContestSubmitFeedbackEnabled: () => true,
            isFinalRecordStatus: (status) => [1, 2].includes(status),
            isFullScoreAccepted: (value) => value.status === 1,
            getContestRecordScore: (value) => value.score,
            reportedFormalSubmitRids: new Set(), formalSubmitEffectPromises: new Map(),
            contestProgressDetails: { 1: { score: 40, status: 2 } },
            badgeAcFirstEligible: true, maybeRevealMistakePrompt() {},
            playBadgeThemeAcEffect: () => ac.promise,
            achievements: { afterResult: (id, previous) => previous.then(() => awards.promise) },
            practiceFeedback: { afterResult: (value) => { received.push(value); return Promise.resolve(); } },
        };
        const names = ['isContestResultReady', 'updateContestProgress', 'showContestSubmitResult', 'receiveFormalSubmitRecord'];
        const compiled = transformSync(`${extractFunctions(names)}\nglobalThis.api={${names.join(',')}}`, { loader: 'tsx', format: 'cjs' }).code;
        vm.runInNewContext(compiled, context);
        const practice = record('practice', 1, { pid: 1, score: 100 });
        assert.equal(context.api.isContestResultReady(practice), true);
        assert.equal(context.api.isContestResultReady({ ...practice, practiceContest: undefined, contest: 'contest-1' }), false,
            'formal point contests still wait for their award');
        context.api.updateContestProgress(practice);
        assert.equal(context.contestProgressDetails[1].score, 40);
        const pending = context.api.receiveFormalSubmitRecord({ dispatch() {} }, practice);
        await flush(); assert.equal(received.length, 0);
        ac.resolve(); await flush(); assert.equal(received.length, 0);
        awards.resolve(); await pending;
        assert.equal(received.length, 1);
        // navigator.locks(ifAvailable) may decline presentation in this tab.
        // That resolves the achievement queue early, but not our AC animation.
        const lockedAc = deferred();
        context.badgeAcFirstEligible = true;
        context.playBadgeThemeAcEffect = () => lockedAc.promise;
        context.achievements.afterResult = () => Promise.resolve();
        const locked = context.api.receiveFormalSubmitRecord({ dispatch() {} }, { ...practice, _id: 'locked' });
        await flush(); assert.equal(received.length, 1);
        lockedAc.resolve(); await locked;
        assert.equal(received.length, 2);
        assert.equal(context.contestProgressDetails[1].score, 40);
        await context.api.receiveFormalSubmitRecord({ dispatch() {} }, practice);
        assert.equal(received.length, 2);
    });
});

async function recordPage(h, context, effects = {}) {
    const jquery = require('jquery')(h.win);
    let initialize;
    const calls = { ac: 0, achievements: 0 };
    const nothing = () => {};
    const dependencies = {
        '@hydrooj/common': { NORMAL_STATUS: [1, 2, 3, 4, 5, 6, 7], STATUS: { STATUS_ACCEPTED: 1 } },
        clipboard: class { on() {} destroy() {} }, jquery,
        react: require('react'), 'vj/components/dialog': { InfoDialog: class {} },
        'vj/components/notification': { success: nothing, error: nothing },
        'vj/misc/Page': { NamedPage: class { constructor(name, init) { initialize = init; } } },
        'vj/utils': { i18n: (text) => text, request: {}, withTransitionCallback: (callback) => callback() },
        '../components/achievement_effect': {
            createAchievementClient: () => ({ afterResult: (id, ac) => {
                calls.achievements++;
                if (effects.achievementLockUnavailable) return Promise.resolve();
                return ac.then(() => effects.achievement?.promise);
            } }),
        },
        '../components/badge_ac_effect': {
            createBadgeAcThemePlayer: () => ({ play: () => { calls.ac++; return effects.ac?.promise || Promise.resolve(); } }),
        },
        '../components/contest_practice_result': {
            ...h.api, createContestPracticeFeedback: (uid) => h.api.createContestPracticeFeedback(uid, h.win),
        },
    };
    const compiled = transformSync(fs.readFileSync(path.join(root, 'pages/record_detail.page.tsx'), 'utf8'), { loader: 'tsx', format: 'cjs' }).code;
    const mod = { exports: {} };
    vm.runInNewContext(compiled, {
        module: mod, exports: mod.exports, window: h.win, document: h.document,
        UiContext: context, UserContext: { _id: 23 },
        require: (name) => { assert.ok(dependencies[name], name); return dependencies[name]; },
    });
    await initialize(); await flush();
    return calls;
}

describe('standalone record page practice result integration', () => {
    it('still waits for its own AC when another tab owns the achievement presentation lock', async (t) => {
        const h = fixture(); t.after(h.close);
        const ac = deferred();
        await recordPage(h, {
            contestPractice: true, contestPracticeLive: true, contestPracticeRecordId: 'locked-record',
            achievementLive: true, achievementRecordId: 'locked-record',
            badgeAcEffect: true, badgeAcFirstEligible: true, recordStatus: 1,
        }, { ac, achievementLockUnavailable: true });
        assert.equal(h.modal(), null);
        ac.resolve(); await flush(); assert.ok(h.modal()); await h.dismiss();
    });
    it('handles an already judged fresh form submission and waits for AC plus achievements', async (t) => {
        const h = fixture(); t.after(h.close);
        const ac = deferred(); const achievement = deferred();
        const context = {
            contestPractice: true, contestPracticeLive: true, contestPracticeRecordId: 'new-form-result',
            achievementLive: true, achievementRecordId: 'new-form-result',
            badgeAcEffect: true, badgeAcFirstEligible: true, recordStatus: 1,
        };
        const calls = await recordPage(h, context, { ac, achievement });
        assert.equal(calls.ac, 1); assert.equal(calls.achievements, 1); assert.equal(h.modal(), null);
        ac.resolve(); await flush(); assert.equal(h.modal(), null);
        achievement.resolve(); await flush(); assert.ok(h.modal());
        await h.dismiss();
        await recordPage(h, context);
        assert.equal(h.modal(), null, 'refresh does not replay a result the learner has seen');
    });

    it('handles compile failures and excludes ordinary/history/teacher-view records', async (t) => {
        const h = fixture(); t.after(h.close);
        const context = { contestPractice: true, contestPracticeLive: true, contestPracticeRecordId: 'ce', recordStatus: 7 };
        const calls = await recordPage(h, context);
        assert.equal(calls.ac, 0); assert.match(h.modal().textContent, /CE/); await h.dismiss();
        for (const overrides of [
            { contestPracticeLive: false, contestPracticeRecordId: 'history' },
            { contestPractice: false, contestPracticeRecordId: 'normal' },
            { recordStatus: 20, contestPracticeRecordId: 'judging' },
        ]) {
            await recordPage(h, { ...context, ...overrides });
            assert.equal(h.modal(), null);
        }
    });
});
