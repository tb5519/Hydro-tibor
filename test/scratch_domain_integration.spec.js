const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '../packages/hydrooj/src');
function load(filename, dependencies = {}, globals = {}) {
    const source = fs.readFileSync(path.join(root, filename), 'utf8');
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(source, {
        loader: 'ts', format: 'cjs', tsconfigRaw: { compilerOptions: { experimentalDecorators: true } },
    }).code, {
        module: mod, exports: mod.exports,
        require: (name) => dependencies[name] || require(name), ...globals,
    });
    return mod.exports;
}
const domainType = load('lib/domain_type.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

describe('Scratch domain boundaries', () => {
    it('preserves legacy domains and isolates the domain rather than the student account', () => {
        for (const domain of [undefined, null, {}, { domainType: 'oj' }]) {
            assert.equal(domainType.getDomainType(domain), 'oj');
            assert.equal(domainType.isScratchDomain(domain), false);
        }
        assert.equal(domainType.isScratchDomain({ domainType: 'scratch' }), true);
        assert.deepEqual(plain(domainType.getOjDomainQuery()), { domainType: { $ne: 'scratch' } });
        const ranking = load('lib/domain_ranking.ts', { './domain_type': domainType });
        assert.equal(ranking.getDomainRankingMode({ rankingMode: 'all' }), 'all');
        assert.equal(ranking.getDomainRankingMode({ rankingMode: 'all', domainType: 'scratch' }), 'single');
    });

    it('blocks OJ HTTP, API and websocket surfaces while keeping account and domain management', () => {
        for (const route of ['/p', '/p/1000/submit', '/problem/create', '/P/1000', '/mistakes', '/ide',
            '/contest', '/homework/x/file', '/training/x', '/record/x', '/ranking', '/badge-honor-wall', '/discuss', '/judge/conn',
            '/record-conn', '/record-detail-conn', '/contest-submit-feedback', '/contest-submit-feedback-conn',
            '/objective-submit-feedback', '/domain/ranking-setting', '/domain/navigation', '/domain/home-poster',
            '/api/problem', '/api/problems', '/api/problemFilterStudents', '/api/rpc']) {
            assert.equal(domainType.isOjDomainPath(route), true, route);
        }
        for (const route of ['/', '/scratch', '/scratch/works', '/scratch/assignments', '/scratch/materials',
            '/login', '/logout', '/register', '/user/2', '/home/security', '/home/domain', '/home/settings/account',
            '/domain/dashboard', '/domain/avatar', '/domain/permission', '/domain/join', '/api/domain',
            '/api/domain.group', '/api/groups', '/workspace/tang', '/manage/dashboard']) {
            assert.equal(domainType.isOjDomainPath(route), false, route);
        }
    });

    it('returns from a Scratch homepage before querying OJ content', async () => {
        const source = fs.readFileSync(path.join(root, 'handler/home.ts'), 'utf8');
        const start = source.indexOf('    async get({ domainId }) {', source.indexOf('export class HomeHandler'));
        const end = source.indexOf('        const homepageConfig', start);
        const handlerSource = `class Home { ${source.slice(start, end)} } }\nHome;`;
        const Home = vm.runInNewContext(handlerSource, { isScratchDomain: domainType.isScratchDomain });
        const handler = new Home();
        handler.domain = { _id: 'art', domainType: 'scratch' };
        handler.response = {};
        handler.url = (name) => `/d/art/${name}`;
        await handler.get({ domainId: 'art' });
        assert.equal(handler.response.redirect, '/d/art/scratch_main');
    });

    it('allows anonymous asset reads from the editor sandbox without opening private APIs', async () => {
        const source = fs.readFileSync(path.join(root, 'service/server.ts'), 'utf8');
        const start = source.indexOf("server.addServerLayer('scratch-editor-cors'");
        const end = source.indexOf('        for (const addon', start);
        let middleware;
        vm.runInNewContext(source.slice(start, end), {
            server: { addServerLayer: (_, callback) => { middleware = callback; } },
        });
        for (const [route, method, status, expected, expectedCache] of [
            ['/scratch-editor/chunk.js', 'GET', 200, '*'],
            ['/scratch-editor/asset.svg', 'HEAD', 304, '*'],
            ['/scratch-editor/editor.html', 'GET', 200, '*', 'no-cache'],
            ['/scratch-editor/build-manifest.json', 'HEAD', 304, '*', 'no-cache'],
            ['/scratch-editor/js/pentapod/editor.cc8d268fc7bbd65113e8.js', 'GET', 200, '*', 'public, max-age=31536000, immutable'],
            ['/scratch-editor/js/editor.js', 'GET', 200, '*'],
            ['/scratch-editor/static/extensions/example-extension.js', 'GET', 200, '*'],
            ['/scratch-editor/missing.js', 'GET', 404, undefined],
            ['/scratch-editor/editor.html', 'GET', 404, undefined],
            ['/scratch-editor/chunk.js', 'POST', 200, undefined],
            ['/d/art/scratch/api/works', 'GET', 200, undefined],
            ['/api/domain', 'GET', 200, undefined],
        ]) {
            const headers = {};
            const context = { request: { path: route, method }, status, set: (key, value) => { headers[key] = value; } };
            await middleware(context, async () => {});
            assert.equal(headers['Access-Control-Allow-Origin'], expected, `${method} ${route}`);
            assert.equal(headers['Access-Control-Allow-Credentials'], undefined);
            assert.equal(headers['Cache-Control'], expectedCache, `${method} ${route}`);
        }
    });
});

function matches(doc, query) {
    return Object.entries(query).every(([key, value]) => {
        if (!value || typeof value !== 'object') return doc[key] === value;
        return Object.entries(value).every(([op, expected]) => {
            if (op === '$in') return expected.includes(doc[key]);
            if (op === '$ne') return doc[key] !== expected;
            if (op === '$gt') return doc[key] > expected;
            throw new Error(`Unhandled query operator ${op}`);
        });
    });
}
function cursor(docs) {
    return { project() { return this; }, sort() { return this; }, toArray: async () => docs };
}

describe('Scratch exclusion in shared RP calculation and reads', () => {
    it('recomputes OJ contributions for mixed-membership users and removes Scratch-only participants', async () => {
        const domains = [
            { _id: 'legacy', rankingMode: 'all' },
            { _id: 'modern', domainType: 'oj', workspaceId: 'another-teacher' },
            { _id: 'art', domainType: 'scratch', rankingMode: 'all' },
        ];
        const memberships = [
            { domainId: 'legacy', uid: 2, join: true, sharedRp: 999, nAccept: 3, nSubmit: 5 },
            { domainId: 'modern', uid: 4, join: true, sharedRp: 999, nAccept: 2, nSubmit: 4 },
            { domainId: 'art', uid: 2, join: true, sharedRp: 999, nAccept: 900, nSubmit: 999 },
            { domainId: 'art', uid: 3, join: true, sharedRp: 888, nAccept: 100, nSubmit: 200 },
        ];
        const mutations = [];
        const applySet = (query, update) => {
            mutations.push(plain(query));
            for (const item of memberships.filter((doc) => matches(doc, query))) {
                for (const [key, value] of Object.entries(update.$set)) {
                    const parts = key.split('.');
                    if (parts.length === 1) item[key] = plain(value);
                    else item[parts[0]][parts[1]] = value;
                }
            }
        };
        const coll = {
            find: (query) => cursor(memberships.filter((doc) => matches(doc, query))),
            updateMany: async (query, update) => applySet(query, update),
            initializeUnorderedBulkOp() {
                const operations = [];
                return {
                    batches: operations,
                    find: (query) => ({ update: (update) => operations.push(() => applySet(query, update)) }),
                    execute: async () => operations.forEach((operation) => operation()),
                };
            },
        };
        const domainQueries = [];
        const domain = {
            collUser: coll,
            get: async (id) => domains.find((doc) => doc._id === id),
            getMulti: (query = {}) => {
                domainQueries.push(plain(query));
                return cursor(domains.filter((doc) => matches(doc, query)));
            },
        };
        let invalidated = 0;
        const rating = load('script/rating.ts', {
            '../lib/domain_type': domainType,
            '../lib/difficulty': () => 5,
            '../lib/shared_ranking': { invalidateSharedRankingSnapshot: () => { invalidated++; } },
            '../model/builtin': { PRIV: { PRIV_USER_PROFILE: 1 }, STATUS: { STATUS_ACCEPTED: 1 } },
            '../model/domain': domain,
            '../model/problem': {},
            '../model/user': { getById: async () => ({ hasPriv: () => true }) },
            '../service/db': { collection: () => coll },
            '@hydrooj/utils': { Counter: () => new Proxy({}, { get: (obj, key) => obj[key] || 0 }) },
        }, { global: { Hydro: { model: {} } } });
        delete rating.RpTypes.problem;
        delete rating.RpTypes.delta;
        const sourceCalls = [];
        rating.RpTypes.fixture = {
            base: 0, hidden: false,
            async run(ids, result) {
                sourceCalls.push(plain(ids));
                for (const id of ids) {
                    if (id === 'legacy') result[2] += 10;
                    if (id === 'modern') result[4] += 20;
                    if (id === 'art') { result[2] += 1000; result[3] += 2000; }
                }
            },
        };
        // A direct request to recalculate Scratch must still skip local OJ RP.
        await rating.run({ domainId: 'art' }, () => {});
        assert.deepEqual(sourceCalls, [['legacy', 'modern']]);
        assert.deepEqual(domainQueries, [{ domainType: { $ne: 'scratch' } }]);
        assert.equal(invalidated, 1);
        assert.equal(memberships[0].sharedRp, 10);
        assert.equal(memberships[1].sharedRp, 20);
        assert.equal(memberships[2].sharedRp, 999);
        assert(mutations.every((query) => !query.domainId.$in.includes('art')));

        const ranking = load('lib/shared_ranking.ts', {
            './domain_type': domainType,
            '../model/domain': domain,
            '../model/builtin': { LEVELS: [100, 50, 10] },
        });
        const rows = plain(await ranking.getSharedRankingSnapshot());
        assert.deepEqual(rows.map((row) => row.uid), [4, 2]);
        assert.equal(rows[1].totalRp, 10);
        assert.equal(rows[1].totalAccept, 3);
        assert.equal(rows[1].totalSubmit, 5);
        assert.deepEqual(domainQueries[1], { domainType: { $ne: 'scratch' } });
    });
});

function editorHarness(readOnly = false, editorVersion = 'a'.repeat(64), withPresets = false) {
    const listeners = {};
    const outgoing = [];
    const requests = [];
    const timers = new Map();
    const presetMessages = [];
    let presetOptions;
    let nextId = 0;
    const element = () => ({
        dataset: {}, disabled: false,
        addEventListener(name, listener) { this[name] = listener; },
    });
    const frame = element();
    frame.contentWindow = { postMessage: (message) => outgoing.push(message) };
    const status = element();
    const save = element();
    const submit = element();
    const elements = { '[data-scratch-frame]': frame, '[data-scratch-status]': status,
        '[data-scratch-save]': save, '[data-scratch-submit]': submit, '[data-scratch-back]': element() };
    const page = load('../../ui-default/pages/scratch_editor.page.ts', {
        'vj/misc/Page': { NamedPage: class { constructor(_, callback) { this.run = callback; } } },
        '../utils/scratch-preset-picker': { createScratchPresetPicker: (options) => {
            assert(withPresets, 'No preset library configured in this save-bridge fixture');
            presetOptions = options;
            return { receive: (message) => {
                if (!['openPresetLibrary', 'presetImported', 'presetImportError'].includes(message.type)) return false;
                presetMessages.push(message);
                return true;
            } };
        } },
    }, {
        UiContext: { scratchEditor: { editorVersion, workId: 'work-1', title: '作品', projectUrl: null,
            saveUrl: '/d/art/scratch/work/work-1/save', revision: 0, maxFileSize: 1024, canSubmit: true, readOnly,
            ...(withPresets ? { libraryUrl: '/d/art/scratch/library' } : {}) } },
        document: { querySelector: (selector) => elements[selector] },
        window: { addEventListener: (name, listener) => { listeners[name] = listener; }, confirm: () => false },
        crypto: { randomUUID: () => `id-${++nextId}` },
        location: { href: 'https://onebyone.test/d/art/scratch/editor', origin: 'https://onebyone.test' },
        URL, ArrayBuffer, Blob, FormData, AbortController,
        setTimeout: (callback) => { const id = ++nextId; timers.set(id, callback); return id; },
        clearTimeout: (id) => timers.delete(id),
        fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
    }).default;
    page.run();
    const channel = new URL(frame.src, 'https://onebyone.test').hash.slice('#channel='.length);
    const message = (type, payload = {}, override = {}) => listeners.message({
        source: frame.contentWindow, origin: 'null', data: { channel, type, ...payload }, ...override,
    });
    const leavesWithWarning = () => {
        let prevented = false;
        listeners.beforeunload({ preventDefault: () => { prevented = true; } });
        return prevented;
    };
    return { message, frame, status, save, submit, outgoing, requests, timers, leavesWithWarning, presetMessages, presetOptions };
}

describe('isolated Scratch editor save bridge', () => {
    it('keeps native teacher-library requests and acknowledgments connected without a host toolbar button', async () => {
        const editor = editorHarness(false, 'a'.repeat(64), true);
        await editor.message('ready');
        await editor.message('loaded');
        await editor.message('openPresetLibrary', { kind: 'costume', targetId: 'sprite-1' }, { source: {} });
        assert.equal(editor.presetMessages.length, 0);
        await editor.message('openPresetLibrary', { kind: 'costume', targetId: 'sprite-1' });
        assert.equal(editor.presetMessages[0].targetId, 'sprite-1');
        assert.equal(editor.presetMessages[0].kind, 'costume');
        editor.presetOptions.onBusy(true);
        editor.save.click();
        editor.submit.click();
        assert.equal(editor.outgoing.filter((item) => item.type === 'export').length, 0);
        assert(editor.save.disabled && editor.submit.disabled);
        await editor.message('presetImported', { id: 'asset-1' });
        assert.equal(editor.presetMessages.at(-1).type, 'presetImported');
        editor.presetOptions.onBusy(false);
        editor.save.click();
        assert.equal(editor.outgoing.filter((item) => item.type === 'export').length, 1);
        await editor.message('openPresetLibrary', { kind: 'sound', targetId: 'sprite-1' });
        assert.equal(editor.presetMessages.length, 2);
        assert.match(editor.status.textContent, /正在保存作品，完成后再添加/);
        const player = editorHarness(true, 'a'.repeat(64), true);
        assert.equal(player.presetOptions, undefined);
    });

    it('versions editor and read-only entries before language so old service workers bypass them', () => {
        for (const readOnly of [false, true]) {
            const first = editorHarness(readOnly, 'a'.repeat(64));
            const next = editorHarness(readOnly, 'b'.repeat(64));
            assert(first.frame.src.startsWith(`/scratch-editor/editor.html?v=${'a'.repeat(64)}&lang=zh-cn#`));
            assert(next.frame.src.startsWith(`/scratch-editor/editor.html?v=${'b'.repeat(64)}&lang=zh-cn#`));
            const forged = editorHarness(readOnly, '#channel=forged&x=https://other.test');
            const url = new URL(forged.frame.src, 'https://onebyone.test');
            assert.equal(url.origin, 'https://onebyone.test');
            assert.equal(url.searchParams.get('v'), '#channel=forged&x=https://other.test');
            assert.notEqual(url.hash, '#channel=forged');
        }
    });

    it('rejects foreign windows/origins and never gives a read-only preview a save action', async () => {
        const editor = editorHarness(true);
        await editor.message('ready', {}, { source: {} });
        await editor.message('ready', {}, { origin: 'https://onebyone.test' });
        await editor.message('ready', {}, { data: { type: 'ready', channel: 'wrong' } });
        assert.equal(editor.outgoing.length, 0);
        await editor.message('ready');
        assert.equal(editor.outgoing[0].type, 'init');
        assert.equal(editor.outgoing[0].readOnly, true);
        assert.equal(editor.outgoing[0].mode, 'player');
        await editor.message('loaded');
        editor.save.click();
        editor.submit.click();
        await editor.message('exported', { id: 'unsolicited', file: new ArrayBuffer(10) });
        assert.equal(editor.requests.length, 0);
        assert.equal(editor.outgoing.filter((item) => item.type === 'export').length, 0);
    });

    it('uploads each requested export once and retains changes made while an earlier snapshot is saving', async () => {
        const editor = editorHarness();
        await editor.message('ready');
        await editor.message('loaded');
        await editor.message('dirty');
        editor.save.click();
        const firstId = editor.outgoing.find((item) => item.type === 'export').id;
        const firstUpload = editor.message('exported', { id: firstId, file: new ArrayBuffer(10) });
        assert.equal(editor.requests.length, 1);
        assert.equal(editor.timers.size, 0, 'the export timer must not unlock an in-flight upload');
        await editor.message('exported', { id: firstId, file: new ArrayBuffer(10) });
        editor.save.click();
        assert.equal(editor.requests.length, 1, 'duplicate exports and double clicks must not upload again');
        await editor.message('dirty');
        editor.requests[0].resolve({ ok: true, json: async () => ({ ok: true, revision: 1 }) });
        await firstUpload;
        assert.equal(editor.leavesWithWarning(), true, 'the new edits were not in the saved snapshot');
        assert.match(editor.status.textContent, /还有新修改未保存/);

        editor.save.click();
        const exports = editor.outgoing.filter((item) => item.type === 'export');
        const secondUpload = editor.message('exported', { id: exports[1].id, file: new ArrayBuffer(10) });
        assert.equal(editor.requests[1].options.body.get('revision'), '1');
        editor.requests[1].resolve({ ok: true, json: async () => ({ ok: true, revision: 2 }) });
        await secondUpload;
        assert.equal(editor.leavesWithWarning(), false);
        assert.match(editor.status.textContent, /作品已保存/);
    });

    it('saves native title edits with their matching snapshot and preserves later title changes', async () => {
        const editor = editorHarness();
        await editor.message('ready');
        assert.equal(editor.outgoing[0].mode, 'editor');
        await editor.message('loaded');
        await editor.message('titleChanged', { title: '我的故事' });
        assert.equal(editor.leavesWithWarning(), true);
        editor.save.click();
        await editor.message('titleChanged', { title: '另一个新名字' });
        const requestId = editor.outgoing.find((item) => item.type === 'export').id;
        const upload = editor.message('exported', { id: requestId, file: new ArrayBuffer(10) });
        assert.equal(editor.requests[0].options.body.get('title'), '我的故事');
        editor.requests[0].resolve({ ok: true, json: async () => ({ ok: true, revision: 1 }) });
        await upload;
        assert.equal(editor.leavesWithWarning(), true);
        await editor.message('titleChanged', { title: ' '.repeat(3) });
        editor.save.click();
        assert.match(editor.status.textContent, /名字/);
        assert.equal(editor.outgoing.filter((item) => item.type === 'export').length, 1);
        const player = editorHarness(true);
        await player.message('loaded');
        await player.message('titleChanged', { title: 'forged' });
        assert.equal(player.leavesWithWarning(), false);
    });
});

const permission = load('../../common/permission.ts');
function templateHarness(domainTypeValue, teacher = false, profile = true) {
    const { PERM, PRIV } = permission;
    const granted = PERM.PERM_DEFAULT | (teacher ? PERM.PERM_EDIT_DOMAIN : 0n);
    const privileges = profile ? PRIV.PRIV_DEFAULT | (teacher ? PRIV.PRIV_CREATE_DOMAIN : 0) : 0;
    const domain = { _id: 'class-a', name: '测试课堂', domainType: domainTypeValue };
    const member = { _id: profile ? 20 : 0, uname: 'student', domains: [domain], pinnedDomains: [],
        hasPerm: (value) => (granted & value) === value,
        hasPriv: (value) => (privileges & value) === value };
    const urls = [];
    const env = new nunjucks.Environment(new nunjucks.FileSystemLoader(path.resolve(root, '../../ui-default/templates')), { autoescape: true });
    env.addGlobal('typeof', (value) => typeof value);
    env.addFilter('assign', (value, args) => Object.assign(value, args));
    const state = {
        _: (value) => value, perm: PERM, PRIV,
        page_name: domainTypeValue === 'scratch' ? 'scratch_main' : 'homepage',
        handler: { user: member, domain, request: { query: {} } }, UiContext: { domain },
        avatarUrl: () => '/avatar.png',
        url: (name) => { urls.push(name); return `/${name}`; },
        model: {
            system: { get: (key) => key === 'server.name' ? 'OneByOne' : key === 'ui-default.domainNavigation' },
            setting: { SETTINGS_BY_KEY: { viewLang: { range: { zh: '简体中文' } } } },
            builtin: { PRIV, PERM },
        },
        ui: { getNodes: (name) => name === 'Nav' ? [
            { name: 'homepage', args: { prefix: 'homepage' }, checker: () => true },
            { name: 'problem_main', args: { prefix: 'problem' }, checker: () => true },
            { name: 'ranking', args: { prefix: 'ranking' }, checker: () => true },
        ] : [] },
    };
    // Match TemplateService: only `perm` contains bigint permission masks;
    // `PRIV` contains number masks. Deliberately do not inject uppercase PERM.
    const render = (filename, overrides = {}) => new JSDOM(env.render(filename, { ...state, ...overrides }));
    return { render, env, state, urls };
}

describe('Scratch domain navigation, footer and creation templates', () => {
    it('renders actual Scratch navigation for students and teachers using the real bigint permission context', () => {
        for (const teacher of [false, true]) {
            const view = templateHarness('scratch', teacher);
            const dom = view.render('partials/nav.html');
            const doc = dom.window.document;
            for (const name of ['scratch_works', 'scratch_assignments', 'scratch_materials']) {
                assert(doc.querySelector(`a[href="/${name}"]`), name);
            }
            assert.equal(!!doc.querySelector('a[href="/domain_dashboard"]'), teacher);
            assert.equal(doc.querySelector('a[href="/problem_main"]'), null);
            assert.equal(doc.querySelector('a[href="/ranking"]'), null);
            assert(doc.querySelector('a[href="/home_security"]'), 'account management remains accessible');
            dom.window.close();
        }
        const guest = templateHarness('scratch', false, false).render('partials/nav.html');
        assert(guest.window.document.querySelector('a[name="nav_login"]'), 'numeric PRIV masks remain valid');
        guest.window.close();
    });

    it('omits the Scratch honor wall and its API URL but preserves ordinary and legacy OJ footers', () => {
        for (const value of ['scratch', 'oj', undefined]) {
            const view = templateHarness(value, true);
            const footer = view.render('partials/footer.html');
            const hasHonorWall = !!footer.window.document.querySelector('[data-honor-wall]');
            assert.equal(hasHonorWall, value !== 'scratch');
            assert.equal(view.urls.includes('badge_honor_wall'), value !== 'scratch');
            assert(footer.window.document.querySelector('#menu-footer-lang'), 'language selection remains available');
            footer.window.close();
            if (value !== 'scratch') {
                const nav = view.render('partials/nav.html');
                assert(nav.window.document.querySelector('a[href="/problem_main"]'));
                assert(nav.window.document.querySelector('a[href="/ranking"]'));
                nav.window.close();
            }
        }
    });

    it('renders both creation forms with OJ selected by default and an explicit Scratch option', () => {
        const view = templateHarness(undefined, true);
        for (const filename of ['domain_create.html', 'workspace_dashboard.html']) {
            // Render the real form and form macros while replacing the unrelated
            // surrounding application layout with a minimal document frame.
            const source = fs.readFileSync(path.resolve(root, '../../ui-default/templates', filename), 'utf8')
                .replace(/\{% extends "[^"]+" %\}/, '{% import "components/form.html" as form with context %}');
            const html = view.env.renderString(source, { ...view.state,
                workspace: { code: 'teacher-a', name: '老师工作区' }, stats: { domainCount: 0, studentCount: 0, teacherCount: 1 },
                domains: [], canCreateDomain: true, showWorkspaceTools: false,
            });
            const dom = new JSDOM(html);
            const select = dom.window.document.querySelector('select[name="domainType"]');
            assert(select, filename);
            assert.equal(select.value, 'oj', filename);
            assert.deepEqual([...select.options].map((option) => option.value), ['oj', 'scratch']);
            select.value = 'scratch';
            assert.equal(new dom.window.FormData(select.form).get('domainType'), 'scratch');
            dom.window.close();
        }
    });

    it('keeps the existing five-argument domain model API compatible and persists explicit Scratch domains', async () => {
        const created = [];
        const memberships = [];
        const Domain = load('model/domain.ts', {
            '../lib/domain_type': domainType,
            '../service/bus': { parallel: async () => {}, broadcast: () => {} },
            '../service/db': { collection: (name) => name === 'domain' ? {
                insertOne: async (doc) => created.push(plain(doc)),
            } : {
                findOneAndUpdate: async (query, update) => { memberships.push({ query: plain(query), update: plain(update) }); return {}; },
            } },
            '../utils': { ArgMethod: (_, __, descriptor) => descriptor },
            './builtin': { BUILTIN_ROLES: {}, PRIV: permission.PRIV },
            './user': { getById: async () => ({ _id: 20 }), deleteUserCache: () => {} },
        }, { global: { Hydro: { model: {} } } }).default;
        await Domain.add('legacy', 20, '旧方式创建', '');
        await Domain.add('workspace-oj', 20, '工作区域', '', 'teacher-a');
        await Domain.add('workspace-scratch', 20, 'Scratch 课堂', '', 'teacher-a', 'scratch');
        assert.deepEqual(created.map((domain) => domain.domainType), ['oj', 'oj', 'scratch']);
        assert.equal(created[0].workspaceId, undefined);
        assert.equal(created[1].workspaceId, 'teacher-a');
        assert.equal(created[2].workspaceId, 'teacher-a');
        assert(memberships.every((member) => member.update.$set.join === true && member.update.$set.role === 'root'));
    });
});
