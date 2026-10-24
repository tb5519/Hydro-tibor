const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const source = fs.readFileSync(path.join(__dirname, '../packages/hydrooj/src/handler/domain.ts'), 'utf8');
class PermissionError extends Error {}
class NotFoundError extends Error {}
class CsrfTokenError extends Error {}
class ValidationError extends Error {}
const PERM = { PERM_EDIT_DOMAIN: 128n };
const isScratchDomain = (domain) => domain?.domainType === 'scratch';

function loadSettings({ domainType = 'scratch', initial, permitted = true } = {}) {
    const doc = { _id: 'classroom', domainType, scratchCommunityEnabled: initial, bulletin: 'unchanged' };
    const calls = [];
    const readCalls = [];
    const domain = {
        get: async (id) => { readCalls.push(id); assert.equal(id, doc._id); return { ...doc }; },
        edit: async (id, values) => { calls.push({ id, values }); Object.assign(doc, values); },
    };
    const base = source.slice(source.indexOf('class ManageHandler'), source.indexOf('const DOMAIN_RANKING_MODES'));
    const implementation = source.slice(source.indexOf('export class DomainScratchCommunitySettingHandler'), source.indexOf('class DomainEditHandler'));
    const mod = { exports: {} };
    vm.runInNewContext(transformSync(`${base}\n${implementation}`, { loader: 'ts', format: 'cjs' }).code, {
        module: mod, exports: mod.exports, Handler: class {}, domain, PERM, URL, isScratchDomain,
        PermissionError, NotFoundError, CsrfTokenError, ValidationError,
    });
    function handler(method = 'get', origin = 'https://onebyone.test') {
        const h = new mod.exports.DomainScratchCommunitySettingHandler();
        h.domain = { ...doc };
        h.request = { method, headers: { origin }, host: 'onebyone.test', query: {} };
        h.response = { addHeader() {} };
        h.checkPerm = (permission) => { assert.equal(permission, PERM.PERM_EDIT_DOMAIN); if (!permitted) throw new PermissionError(); };
        h.url = (name, params) => { assert.equal(name, 'domain_scratch_community'); return `/domain/scratch-community?saved=${params.query.saved}`; };
        return h;
    }
    return { handler, doc, calls, readCalls };
}

describe('Scratch domain community settings', () => {
    it('defaults to open, persists only the selected domain setting, and reopens without modifying other data', async () => {
        const { handler, doc, calls } = loadSettings();
        const h = handler();
        await h.prepare({ domainId: doc._id });
        await h.get();
        assert.equal(h.response.template, 'domain_scratch_community.html');
        assert.equal(h.response.body.enabled, true);
        h.request.method = 'post';
        await h.prepare({ domainId: doc._id });
        await h.post({ domainId: 'forged-domain' });
        assert.equal(doc.scratchCommunityEnabled, false);
        assert.equal(calls[0].id, 'classroom');
        assert.deepEqual(Object.keys(calls[0].values), ['scratchCommunityEnabled']);
        assert.equal(h.response.redirect, '/domain/scratch-community?saved=1');
        const closed = handler();
        closed.request.query.saved = '1';
        await closed.prepare({ domainId: doc._id });
        await closed.get();
        assert.equal(closed.response.body.enabled, false);
        assert.equal(closed.response.body.saved, true);
        await closed.post({ enabled: 'on' });
        assert.equal(doc.scratchCommunityEnabled, true);
        assert.equal(doc.bulletin, 'unchanged');
    });

    it('requires domain administration, a Scratch domain, and same-origin mutation requests', async () => {
        for (const [options, Expected] of [[{ permitted: false }, PermissionError], [{ domainType: 'oj' }, NotFoundError]]) {
            const { handler, doc, calls } = loadSettings(options);
            await assert.rejects(handler('post').prepare({ domainId: doc._id }), Expected);
            assert.equal(calls.length, 0);
        }
        for (const origin of [undefined, '', 'https://evil.test', 'null', ['https://onebyone.test']]) {
            const { handler, doc, calls } = loadSettings();
            const h = handler('post');
            h.request.headers.origin = origin;
            await assert.rejects(h.prepare({ domainId: doc._id }), CsrfTokenError);
            assert.equal(calls.length, 0);
        }
        const { handler, doc } = loadSettings();
        const h = handler('post');
        h.request.headers = { referer: 'https://onebyone.test/d/classroom/domain/scratch-community' };
        await h.prepare({ domainId: doc._id });
    });

    it('rejects query/body domain overrides before reloading metadata or editing the routed domain', async () => {
        for (const method of ['get', 'post']) {
            const { handler, doc, calls, readCalls } = loadSettings({ initial: false });
            const h = handler(method);
            let permissionChecks = 0;
            // Model a user whose permissions were loaded for the forged domain.
            h.checkPerm = () => { permissionChecks += 1; };
            h.request[method === 'get' ? 'query' : 'body'] = { domainId: 'other-classroom', enabled: 'on' };
            await assert.rejects(h.prepare({ domainId: 'other-classroom', enabled: 'on' }), ValidationError);
            assert.equal(permissionChecks, 0);
            assert.equal(readCalls.length, 0);
            assert.equal(calls.length, 0);
            assert.equal(h.domain._id, doc._id);
            assert.equal(doc.scratchCommunityEnabled, false);
        }
    });

    it('rejects malformed toggle values without changing the saved preference', async () => {
        for (const enabled of [null, [], ['on'], {}, 'yes', 2]) {
            const { handler, doc, calls } = loadSettings({ initial: false });
            const h = handler('post');
            await h.prepare({ domainId: doc._id });
            await assert.rejects(h.post({ enabled }), ValidationError);
            assert.equal(calls.length, 0);
            assert.equal(doc.scratchCommunityEnabled, false);
        }
    });

    it('registers the settings page and exposes its menu only to Scratch domain administrators', () => {
        const routes = [];
        const menus = [];
        const ctx = { Route: (...args) => routes.push(args), injectUI: (...args) => menus.push(args) };
        // Execute the route registrations from the production apply function.
        const start = source.indexOf("    ctx.Route('domain_scratch_community'");
        const end = source.indexOf("    ctx.Route('domain_user'", start);
        const registration = source.slice(start, end);
        class DomainScratchCommunitySettingHandler {}
        vm.runInNewContext(registration, { ctx, PERM, isScratchDomain, DomainScratchCommunitySettingHandler });
        assert.equal(routes[0][0], 'domain_scratch_community');
        assert.equal(routes[0][1], '/domain/scratch-community');
        assert.equal(routes[0][2], DomainScratchCommunitySettingHandler);
        const [, , options, check] = menus.find((entry) => entry[1] === 'domain_scratch_community');
        assert.equal(options.before, 'domain_edit');
        for (const [domainType, permitted, expected] of [['scratch', true, true], ['scratch', false, false], ['oj', true, false]]) {
            assert.equal(check({ domain: { domainType }, user: { hasPerm: () => permitted } }), expected);
        }
    });
});
