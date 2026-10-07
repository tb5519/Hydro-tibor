const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');
const jqueryFactory = require('jquery');
const { JSDOM } = require('jsdom');
const nunjucks = require('nunjucks');

const uiRoot = path.resolve(__dirname, '../packages/ui-default');
const pageCode = transformSync(fs.readFileSync(path.join(uiRoot, 'components/navigation/navigation.page.js'), 'utf8'), {
    loader: 'js', format: 'cjs',
}).code;
const dropdownCode = transformSync(fs.readFileSync(path.join(uiRoot, 'components/dropdown/Dropdown.js'), 'utf8'), {
    loader: 'js', format: 'cjs',
}).code;
const attachedObjectCode = transformSync(fs.readFileSync(path.join(uiRoot, 'components/DOMAttachedObject.ts'), 'utf8'), {
    loader: 'ts', format: 'cjs',
}).code;
const dropCode = fs.readFileSync(require.resolve('tether-drop'), 'utf8');
const templateRoot = path.join(uiRoot, 'templates');
const navTemplate = fs.readFileSync(path.join(templateRoot, 'partials/nav.html'), 'utf8');
const mobileWidth = require(path.join(uiRoot, 'breakpoints.json')).mobile;

function renderMenu(domains) {
    const selected = domains[2] || { _id: 'system', name: 'OneByOne' };
    const env = new nunjucks.Environment(null, { autoescape: true });
    return env.renderString(navTemplate, {
        page_name: 'homepage', UiContext: { domain: selected },
        handler: { user: { _id: 20, uname: 'student', domains, hasPriv: () => true, hasPerm: () => false } },
        PRIV: { PRIV_USER_PROFILE: 1 }, perm: { PERM_EDIT_DOMAIN: 1 },
        model: { system: { get: (key) => (key === 'server.name' ? 'OneByOne' : key === 'ui-default.domainNavigation') } },
        ui: { getNodes: () => [] },
        avatarUrl: (avatar, size) => `/avatar-${size}.png`,
        _: (value) => value,
        url: (route, args = {}) => {
            if (args.domainId) return `/d/${args.domainId}/${route === 'scratch_main' ? 'scratch' : ''}`;
            return `/${route}`;
        },
    });
}

const domains = Array.from({ length: 15 }, (_, index) => ({
    _id: `class-${index}`, name: `第 ${index + 1} 个课堂`, owner: 50,
    domainType: index % 2 ? 'scratch' : 'oj',
}));

function harness(width = 1280, { preAttach = false } = {}) {
    const dom = new JSDOM(`${renderMenu(domains.slice(0, 3))}<button id="outside">外部按钮</button>`, { url: 'https://onebyone.example/' });
    const { window } = dom;
    const $ = jqueryFactory(window);
    let viewport = width;
    Object.defineProperty(window.document.documentElement, 'clientWidth', { configurable: true, get: () => viewport });
    const trigger = window.document.querySelector('.domain-switcher');
    const button = trigger.querySelector('button');
    const menu = window.document.getElementById('menu-nav-domain');
    const links = [...menu.querySelectorAll('a[href]')];
    const outside = window.document.getElementById('outside');
    const timers = new Map();
    let timerId = 0;
    const schedule = (callback) => {
        timers.set(++timerId, callback);
        return timerId;
    };
    const cancel = (id) => timers.delete(id);
    const calls = { constructed: 0, detached: 0, open: 0, close: 0 };
    function load(code, dependencies) {
        const mod = { exports: {} };
        vm.runInNewContext(code, {
            module: mod, exports: mod.exports, window, document: window.document, $, console,
            setTimeout: schedule, clearTimeout: cancel, process: { env: { NODE_ENV: 'production' } },
            require: (name) => {
                assert.ok(Object.hasOwn(dependencies, name), `Unexpected UI dependency ${name}`);
                return dependencies[name];
            },
        });
        return mod.exports;
    }
    // Only positioning is stubbed: exercise the real Drop event wiring and our
    // real Dropdown adapter, including global attachment and outside clicks.
    function Evented() { this.handlers = {}; }
    Evented.prototype.on = function on(event, callback) { (this.handlers[event] ||= []).push(callback); };
    Evented.prototype.trigger = function triggerEvent(event) {
        for (const callback of this.handlers[event] || []) callback();
    };
    function Tether() {}
    Tether.prototype.enable = () => {};
    Tether.prototype.disable = () => {};
    Tether.prototype.position = () => {};
    Tether.prototype.destroy = () => {};
    Tether.Utils = {
        extend: Object.assign,
        addClass: (element, classes) => element.classList.add(...classes.split(/\s+/).filter(Boolean)),
        removeClass: (element, classes) => element.classList.remove(...classes.split(/\s+/).filter(Boolean)),
        hasClass: (element, name) => element.classList.contains(name),
        Evented,
    };
    const Drop = load(dropCode, { tether: Tether });
    function RecordedDrop(options) {
        calls.constructed += 1;
        const instance = new Drop(options);
        const open = instance.open.bind(instance);
        const close = instance.close.bind(instance);
        instance.open = (...args) => {
            calls.open += 1;
            return open(...args);
        };
        instance.close = (...args) => {
            calls.close += 1;
            return close(...args);
        };
        return instance;
    }
    const DOMAttachedObject = load(attachedObjectCode, { jquery: $ }).default;
    const dropdown = load(dropdownCode, {
        'tether-drop': RecordedDrop,
        'vj/breakpoints.json': { mobile: mobileWidth },
        'vj/components/DOMAttachedObject': DOMAttachedObject,
        'vj/utils': { mediaQuery: { isBelow: (cutoff) => viewport <= cutoff }, zIndexManager: { getNext: () => 10 } },
    }).default;
    const detach = dropdown.prototype.detach;
    dropdown.prototype.detach = function detachRecorded() {
        calls.detached += 1;
        return detach.call(this);
    };
    const selectUser = () => {};
    const dependencies = {
        jquery: $,
        'vj/breakpoints.json': { mobile: mobileWidth },
        'vj/components/dropdown/Dropdown': dropdown,
        'vj/components/notification': {},
        'vj/components/selectUser': selectUser,
        'vj/misc/Page': { AutoloadPage: class {} },
        'vj/utils': {},
    };
    const bind = load(pageCode, dependencies).bindDomainSwitcher;
    if (preAttach) dropdown.attachAll(trigger);
    const beforeBinding = { constructed: calls.constructed, menuInDocument: menu.isConnected };
    bind();
    return {
        window, $, trigger, button, menu, links, outside, calls, bind, beforeBinding,
        dropdown,
        isOpened: () => !!dropdown.get($(trigger))?.dropInstance?.isOpened(),
        hover: (target = trigger) => {
            target.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true }));
        },
        key: (target, key) => {
            const event = new window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
            target.dispatchEvent(event);
            return event;
        },
        flush: () => {
            while (timers.size) {
                const [id, callback] = timers.entries().next().value;
                timers.delete(id);
                callback();
            }
        },
        resize: (nextWidth) => { viewport = nextWidth; $(window).trigger('resize'); },
        cleanup: () => { dropdown.detachAll(); window.close(); },
    };
}

describe('domain switcher keyboard and pointer behavior', () => {
    it('stays closed when the pointer hovers or keyboard focus lands on the classroom button', () => {
        const app = harness(1280, { preAttach: true });
        try {
            app.hover();
            app.hover(app.button);
            app.button.focus();
            app.flush();
            assert.equal(app.window.document.activeElement, app.button);
            assert.equal(app.isOpened(), false);
            assert.equal(app.calls.open, 0);
            assert.equal(app.button.getAttribute('aria-expanded'), 'false');
        } finally { app.cleanup(); }
    });

    it('binds the initially detached menu for click and keyboard without enabling hover', () => {
        const app = harness(1280, { preAttach: true });
        try {
            assert.equal(app.beforeBinding.constructed, 1);
            assert.equal(app.beforeBinding.menuInDocument, false, 'global attach must remove the menu before navigation binds');
            assert.equal(app.window.document.getElementById('menu-nav-domain'), null, 'binding should not need to open the popover');
            app.button.click();
            assert.equal(app.isOpened(), true, 'click must work before the first hover');
            assert.equal(app.button.getAttribute('aria-expanded'), 'true');
            app.key(app.button, 'ArrowDown');
            assert.equal(app.window.document.activeElement, app.links[0]);
            app.key(app.links[0], 'ArrowUp');
            assert.equal(app.window.document.activeElement, app.links.at(-1));
            const opensBeforeEscape = app.calls.open;
            app.key(app.links.at(-1), 'Escape');
            assert.equal(app.isOpened(), false);
            assert.equal(app.window.document.activeElement, app.button);
            assert.equal(app.button.getAttribute('aria-expanded'), 'false');
            assert.equal(app.calls.open, opensBeforeEscape, 'restoring focus must not reopen the menu');
            app.hover();
            app.flush();
            assert.equal(app.isOpened(), false);
            assert.equal(app.button.getAttribute('aria-expanded'), 'false', 'hover must not reopen the dismissed menu');
            app.bind();
            const opensBeforeClick = app.calls.open;
            app.button.click();
            assert.equal(app.calls.open, opensBeforeClick + 1);
            assert.equal(app.calls.constructed, 1, 'reuse the instance created by global attach');
        } finally { app.cleanup(); }
    });

    it('restores a globally attached unopened menu on mobile and reuses its keyboard handlers after returning to desktop', () => {
        const app = harness(1280, { preAttach: true });
        try {
            assert.equal(app.beforeBinding.menuInDocument, false);
            app.resize(mobileWidth - 1);
            assert.equal(app.calls.detached, 1);
            assert.equal(app.trigger.contains(app.menu), true);
            assert.equal(app.button.getAttribute('aria-expanded'), 'true');
            app.key(app.button, 'ArrowDown');
            assert.equal(app.window.document.activeElement, app.links[0]);
            assert.equal(app.calls.constructed, 1);
            app.resize(1280);
            assert.equal(app.calls.constructed, 2);
            assert.equal(app.menu.isConnected, false, 'replacement popover remains detached until opened');
            app.key(app.button, 'ArrowUp');
            assert.equal(app.window.document.activeElement, app.links.at(-1));
            assert.equal(app.button.getAttribute('aria-expanded'), 'true');
            assert.equal(app.window.document.querySelectorAll('#menu-nav-domain').length, 1);
            app.bind();
            app.resize(1400);
            assert.equal(app.calls.constructed, 2);
        } finally { app.cleanup(); }
    });

    it('opens on click and tracks dropdown open/close state for assistive technology', () => {
        const app = harness();
        try {
            assert.equal(app.isOpened(), false);
            assert.equal(app.button.getAttribute('aria-expanded'), 'false');
            app.button.click();
            assert.equal(app.calls.constructed, 1);
            assert.equal(app.isOpened(), true);
            assert.equal(app.button.getAttribute('aria-expanded'), 'true');
            app.key(app.button, 'Escape');
            assert.equal(app.isOpened(), false);
            assert.equal(app.button.getAttribute('aria-expanded'), 'false');
        } finally { app.cleanup(); }
    });

    it('toggles once per click, ignores pointer departure, and closes when clicking outside without moving focus', () => {
        const app = harness();
        try {
            app.button.focus();
            app.button.click();
            assert.equal(app.isOpened(), true);
            assert.equal(app.calls.open, 1, 'the navigation binding must not duplicate Drop activation');
            app.trigger.dispatchEvent(new app.window.MouseEvent('mouseout', { bubbles: true }));
            app.menu.dispatchEvent(new app.window.MouseEvent('mouseout', { bubbles: true }));
            app.flush();
            assert.equal(app.isOpened(), true, 'a clicked menu stays open while the pointer moves away');
            app.menu.querySelector('.domain-switcher__header').click();
            assert.equal(app.isOpened(), true, 'clicks inside the menu are not outside clicks');
            app.button.click();
            assert.equal(app.isOpened(), false, 'clicking the trigger again dismisses the menu');
            assert.equal(app.button.getAttribute('aria-expanded'), 'false');
            app.button.click();
            assert.equal(app.isOpened(), true);
            app.window.document.body.click();
            assert.equal(app.window.document.activeElement, app.button, 'outside background clicks need not blur the button');
            assert.equal(app.isOpened(), false);
            assert.equal(app.button.getAttribute('aria-expanded'), 'false');
        } finally { app.cleanup(); }
    });

    it('keeps native Enter and Space activation available and accepts their synthesized button click', () => {
        const app = harness();
        try {
            app.button.focus();
            for (const key of ['Enter', ' ']) {
                assert.equal(app.key(app.button, key).defaultPrevented, false);
                app.button.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true, cancelable: true, detail: 0 }));
                assert.equal(app.isOpened(), key === 'Enter');
            }
            assert.equal(app.button.type, 'button');
            assert.equal(app.calls.open, 1);
        } finally { app.cleanup(); }
    });

    it('retains hover activation for unrelated dropdowns with no click-only setting', () => {
        const app = harness();
        try {
            const target = app.window.document.createElement('button');
            const content = app.window.document.createElement('div');
            content.id = 'legacy-menu';
            target.setAttribute('data-dropdown-target', '#legacy-menu');
            app.window.document.body.append(target, content);
            const legacy = app.dropdown.getOrConstruct(app.$(target)).dropInstance;
            app.hover(target);
            app.flush();
            assert.equal(legacy.isOpened(), true);
            assert.equal(app.isOpened(), false, 'other menu activation never opens the classroom switcher');
            target.dispatchEvent(new app.window.MouseEvent('mouseout', { bubbles: true }));
            app.flush();
            assert.equal(legacy.isOpened(), false);
        } finally { app.cleanup(); }
    });

    it('moves focus with ArrowDown/ArrowUp and wraps across classroom and management links', () => {
        const app = harness();
        try {
            app.button.focus();
            assert.equal(app.key(app.button, 'ArrowDown').defaultPrevented, true);
            assert.equal(app.window.document.activeElement, app.links[0]);
            app.key(app.links[0], 'ArrowDown');
            assert.equal(app.window.document.activeElement, app.links[1]);
            app.key(app.links[1], 'ArrowUp');
            assert.equal(app.window.document.activeElement, app.links[0]);
            app.key(app.links[0], 'ArrowUp');
            assert.equal(app.window.document.activeElement, app.links.at(-1));
            app.key(app.links.at(-1), 'ArrowDown');
            assert.equal(app.window.document.activeElement, app.links[0]);
            app.button.focus();
            app.key(app.button, 'ArrowUp');
            assert.equal(app.window.document.activeElement, app.links.at(-1));
            app.flush();
            assert.equal(app.isOpened(), true, 'moving between trigger and detached menu must not close it');
        } finally { app.cleanup(); }
    });

    it('closes on Escape and restores trigger focus without reopening', () => {
        const app = harness();
        try {
            app.button.focus();
            app.key(app.button, 'ArrowDown');
            const opensBefore = app.calls.open;
            assert.equal(app.key(app.links[0], 'Escape').defaultPrevented, true);
            app.flush();
            assert.equal(app.window.document.activeElement, app.button);
            assert.equal(app.isOpened(), false);
            assert.equal(app.button.getAttribute('aria-expanded'), 'false');
            assert.equal(app.calls.open, opensBefore);
        } finally { app.cleanup(); }
    });

    it('keeps the menu open for internal Tab focus and closes when focus leaves the switcher', () => {
        const app = harness();
        try {
            app.button.focus();
            app.button.click();
            assert.equal(app.key(app.button, 'Tab').defaultPrevented, false, 'normal Tab navigation should remain native');
            app.links[0].focus();
            app.flush();
            assert.equal(app.isOpened(), true);
            app.links.at(-1).focus();
            app.outside.focus();
            app.flush();
            assert.equal(app.isOpened(), false);
            assert.equal(app.button.getAttribute('aria-expanded'), 'false');
            assert.equal(app.window.document.activeElement, app.outside);
        } finally { app.cleanup(); }
    });

    it('does not duplicate listeners or dropdown instances when initialized repeatedly', () => {
        const app = harness();
        try {
            app.bind();
            app.bind();
            app.button.click();
            assert.equal(app.calls.open, 1);
            assert.equal(app.calls.constructed, 1);
            app.key(app.button, 'ArrowDown');
            assert.equal(app.calls.open, 2);
            assert.equal(app.window.document.activeElement, app.links[0]);
        } finally { app.cleanup(); }
    });

    it('uses inline mobile links without constructing a popover', () => {
        const app = harness(mobileWidth);
        try {
            app.button.focus();
            app.button.click();
            app.key(app.button, 'ArrowDown');
            assert.equal(app.window.document.activeElement, app.links[0]);
            app.key(app.links[0], 'ArrowUp');
            assert.equal(app.window.document.activeElement, app.links.at(-1));
            app.key(app.links.at(-1), 'Escape');
            app.flush();
            assert.equal(app.calls.constructed, 0);
            assert.equal(app.calls.open, 0);
            assert.equal(app.button.getAttribute('aria-expanded'), 'true');
            assert.equal(app.trigger.contains(app.menu), true);
        } finally { app.cleanup(); }
    });

    it('returns the same menu to the mobile sidebar and rebuilds one desktop popover on resize', () => {
        const app = harness();
        try {
            app.button.click();
            assert.equal(app.calls.constructed, 1);
            assert.equal(app.isOpened(), true);
            assert.equal(app.trigger.contains(app.menu), false);
            app.resize(mobileWidth - 1);
            assert.equal(app.calls.detached, 1);
            assert.equal(app.isOpened(), false);
            assert.equal(app.trigger.contains(app.menu), true);
            assert.equal(app.button.getAttribute('aria-expanded'), 'true');
            app.button.click();
            app.key(app.button, 'ArrowDown');
            assert.equal(app.window.document.activeElement, app.links[0], 'menu keyboard listeners must survive moving back');
            assert.equal(app.calls.constructed, 1, 'mobile actions must not recreate the desktop instance');
            app.resize(1280);
            assert.equal(app.calls.constructed, 2);
            assert.equal(app.trigger.contains(app.menu), false);
            assert.equal(app.isOpened(), false);
            assert.equal(app.button.getAttribute('aria-expanded'), 'false');
            app.button.click();
            assert.equal(app.isOpened(), true);
            app.resize(1400);
            app.bind();
            assert.equal(app.calls.constructed, 2, 'desktop resize and repeat binding reuse the replacement instance');
            assert.equal(app.window.document.querySelectorAll('#menu-nav-domain').length, 1);
        } finally { app.cleanup(); }
    });
});

describe('joined-domain menu templates', () => {
    it('renders every joined classroom beyond ten and uses the correct Scratch/OJ destination', () => {
        const document = new JSDOM(renderMenu(domains)).window.document;
        const links = [...document.querySelectorAll('.domain-switcher__link')];
        assert.equal(links.length, 15);
        assert.equal(document.querySelector('.domain-switcher__count').textContent.trim(), '15 个');
        for (const [index, link] of links.entries()) {
            assert.equal(link.getAttribute('href'), `/d/class-${index}/${index % 2 ? 'scratch' : ''}`);
            assert.equal(link.querySelector('.domain-switcher__name').textContent, domains[index].name);
        }
        const current = document.querySelectorAll('.domain-switcher__link[aria-current]');
        assert.equal(current.length, 1);
        assert.equal(current[0], links[2]);
        assert.equal(current[0].querySelector('.domain-switcher__current').textContent, '当前');
        assert.ok(document.querySelector('.domain-switcher__manage'));
    });

    it('renders a useful empty state and preserves long names as safely escaped text', () => {
        const empty = new JSDOM(renderMenu([])).window.document;
        assert.equal(empty.querySelectorAll('.domain-switcher__link').length, 0);
        assert.match(empty.querySelector('.domain-switcher__empty').textContent, /加入课堂/);
        assert.equal(empty.querySelector('.domain-switcher__count').textContent.trim(), '0 个');
        assert.ok(empty.querySelector('.domain-switcher__manage'));
        const name = `${'很长的课堂名'.repeat(40)} <img src=x onerror="alert(1)"><script>alert(2)</script> & "引号"`;
        const document = new JSDOM(renderMenu([{ ...domains[0], name }])).window.document;
        assert.equal(document.querySelector('.domain-switcher__name').textContent, name);
        assert.equal(document.querySelectorAll('script, [onerror]').length, 0);
        assert.equal(document.querySelectorAll('.domain-switcher__name img').length, 0);
    });

    it('shows automatic favorite status without a manual star toggle and retains normal domain actions', () => {
        const Loader = nunjucks.Loader.extend({
            getSource(name) {
                return { path: name, src: name === 'layout/home_base.html'
                    ? '{% block home_content %}{% endblock %}'
                    : fs.readFileSync(path.join(templateRoot, name), 'utf8') };
            },
        });
        const env = new nunjucks.Environment(new Loader(), { autoescape: true });
        const document = new JSDOM(env.render('home_domain.html', {
            ddocs: domains.slice(0, 2), role: {}, canManage: { 'class-0': true },
            handler: { user: { _id: 20, pinnedDomains: domains.map((item) => item._id), hasPriv: () => true } },
            model: { builtin: { PRIV: { PRIV_CREATE_DOMAIN: 1, PRIV_USER_PROFILE: 2 } } },
            avatarUrl: () => '/avatar.png', _: (value) => value,
            url: (name, args = {}) => `/${name}/${args.domainId || ''}`,
        })).window.document;
        assert.equal(document.querySelectorAll('.domain-auto-star').length, 2);
        assert.equal(document.querySelectorAll('[data-star-action], [data-star], input[value="star"]').length, 0);
        assert.equal(document.querySelectorAll('input[name="operation"][value="leave"]').length, 2);
        assert.ok(document.querySelector('a[href="/domain_dashboard/class-0"]'));
        assert.ok(document.getElementById('join-domain-button'));
    });
});
