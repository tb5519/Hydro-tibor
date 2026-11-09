const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
const stylus = require('stylus');
let playwright;
for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
    try { playwright = require(location); break; } catch { /* Available local browser runtime. */ }
}
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find((entry) => entry && fs.existsSync(entry));
const repo = path.resolve(__dirname, '..');
const code = esbuild.buildSync({ stdin: {
    contents: "export { installVoiceCall } from './ui'; export { mountVoiceCallWindow } from './window';",
    resolveDir: path.join(repo, 'packages/ui-default/components/voice_call'), loader: 'ts',
}, bundle: true, write: false, format: 'iife', globalName: 'VoiceUI' }).outputFiles[0].text;
const css = fs.readFileSync(path.join(repo, 'packages/ui-default/public/theme-4.58.0-beta.21.css'), 'utf8') + ['teacher_assistant.page.styl', 'live_share.page.styl', 'voice_call.page.styl']
    .map((file) => stylus.render(fs.readFileSync(path.join(repo, 'packages/ui-default/components', file), 'utf8'))).join('\n');
let browser;
before(async () => {
    assert(executablePath, 'A Chromium runtime is required for voice interface tests');
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => browser?.close());

async function fixture(t, options = {}) {
    const context = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 800 } });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('https://voice-ui.test/**', (route) => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><title>OneByOne · 我的课堂</title><style>body{margin:0;background:#edf0f4;font-family:system-ui;color:#33465d}main{margin:32px;background:#fff;padding:32px;border-radius:24px;min-height:450px}.fixture-nav{padding:20px 32px;background:#fff;border-bottom:1px solid #dbe3ec}.teacher-assistant{right:24px;bottom:24px;width:260px;height:auto}.teacher-assistant__links{background:white;padding:8px;border-radius:16px}${css}</style></head><body><nav class="fixture-nav">OneByOne · 编程课堂</nav><main><h1>我的课堂</h1><p>老师和学员可以边看边聊。</p><button id="student-work">继续写代码</button></main><aside class="teacher-assistant" data-teacher-assistant><nav class="teacher-assistant__links"><button class="teacher-assistant__link teacher-assistant__voice" data-voice-call-open>语音通话</button><button class="teacher-assistant__link" data-live-share-open>共享模式</button></nav></aside><script>${code}</script><script>
      window.sent=[];window.audioStarts=0;window.audioStops=0;window.audioMuted=false;window.open=()=>{throw Error('No popup is needed')};
      window.fakeAudio={ready:false,async start(){audioStarts++;this.ready=true},stop(){audioStops++;this.ready=false},setMuted(value){audioMuted=value},setTransmitting(){},resetReceive(){},receive(){}};
      window.cleanup=VoiceUI.installVoiceCall({enabled:true,uid:${options.student ? 5 : 2},canTeach:${!options.student},socketUrl:'/voice-call/conn'}, {
        transportFactory(config,handlers){window.handlers=handlers;window.transport={ready:true,start(){handlers.onConnection(true);handlers.onMessage({type:'ready'})},send(message){sent.push(message);return this.ready},dispose(){this.ready=false}};return transport},
        controllerFactory(root,config,settings){return VoiceUI.mountVoiceCallWindow(root,config,{...settings,audioFactory:()=>fakeAudio})}
      });
      window.deliver=(message)=>handlers.onMessage(message);
    </script></body></html>` }));
    await page.goto('https://voice-ui.test/classroom');
    return { page, errors };
}
const call = (overrides = {}) => ({ type: 'snapshot', callId: 'voice-call-abcdefgh', status: 'ringing',
    teacherUid: 2, teacherName: '唐老师', studentUid: 5, studentName: '橙子', createdAt: Date.now(),
    ringExpiresAt: Date.now() + 45000, isOwner: false, ...overrides });
const roster = { type: 'students', students: [
    { uid: 5, name: '橙子', online: true, busy: false }, { uid: 6, name: '睿睿', online: true, busy: true },
    { uid: 7, name: '颂严', online: false, busy: false },
] };

it('teacher can search and dial an available learner; mere presence never starts the microphone', async (t) => {
    const { page, errors } = await fixture(t);
    assert.equal(await page.evaluate(() => audioStarts), 0);
    await page.locator('[data-voice-call-open]').click();
    await page.evaluate((message) => deliver(message), roster);
    assert.equal(await page.locator('[data-voice-student="6"]').isDisabled(), true);
    assert.equal(await page.locator('[data-voice-student="7"]').isDisabled(), true);
    await page.getByRole('searchbox').fill('5');
    const searchBox = await page.getByRole('searchbox').boundingBox();
    const searchIcon = await page.locator('.voice-call-picker__search svg').boundingBox();
    assert.ok(Math.abs(searchBox.y + searchBox.height / 2 - searchIcon.y - searchIcon.height / 2) < 2, 'search icon and text share one line under the base theme');
    assert.equal(await page.locator('.voice-call-student').count(), 1);
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-voice-picker.png') });
    await page.locator('[data-voice-student="5"]').click();
    await page.waitForFunction(() => sent.some((message) => message.type === 'dial'));
    assert.equal(await page.evaluate(() => audioStarts), 1);
    assert.equal(await page.locator('.voice-call-picker').isVisible(), false);
    assert.equal(await page.locator('.voice-call-floating').isVisible(), true);
    assert.equal(await page.locator('.voice-call-window__name').textContent(), '橙子');
    const dial = await page.evaluate(() => sent.find((message) => message.type === 'dial'));
    assert.equal(dial.type, 'dial'); assert.equal(dial.studentUid, 5); assert.match(dial.requestId, /^[0-9a-f]{32}$/);
    assert.deepEqual(errors, []);
});

it('content navigation and a replaced assistant menu preserve the active call until the account ends', async (t) => {
    const { page, errors } = await fixture(t);
    await page.locator('[data-voice-call-open]').click();
    await page.evaluate((message) => deliver(message), roster);
    await page.locator('[data-voice-student="5"]').click();
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: true, acceptedAt: Date.now() }));
    await page.waitForFunction(() => fakeAudio.ready);
    const before = await page.evaluate(() => ({ audioStarts, audioStops, transport: transport.ready }));
    await page.route('https://voice-ui.test/content/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>下一页</h1><a href="/content/next">继续</a>' }));
    await page.evaluate(() => {
        const frame = document.createElement('iframe'); frame.id = 'content'; frame.src = '/content/first'; document.body.append(frame);
        const assistant = document.querySelector('[data-teacher-assistant]');
        assistant.replaceChildren(Object.assign(document.createElement('button'), { textContent: '新的语音入口' }));
        assistant.firstElementChild.setAttribute('data-voice-call-open', '');
        assistant.style.cssText = 'position:fixed;left:12px;top:12px;right:auto;bottom:auto';
    });
    await page.frameLocator('#content').getByRole('link', { name: '继续' }).click();
    await page.waitForFunction(() => document.querySelector('#content').contentWindow.location.pathname === '/content/next');
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('onebyone:page-change', { detail: { window: document.querySelector('#content').contentWindow } })));
    await page.locator('[data-voice-call-open]').click();
    assert.equal(await page.locator('.voice-call-floating').isVisible(), true);
    assert.deepEqual(await page.evaluate(() => ({ audioStarts, audioStops, transport: transport.ready })), before, 'no microphone or transport restart on content navigation');
    await page.evaluate(() => window.dispatchEvent(new Event('onebyone:session-ended')));
    assert.equal(await page.evaluate(() => fakeAudio.ready), false);
    assert.equal(await page.evaluate(() => transport.ready), false);
    assert.equal(await page.locator('.voice-call-floating').count(), 0);
    assert.deepEqual(errors, []);
});

it('student sees a private incoming card and explicitly accepts before opening the microphone', async (t) => {
    const { page, errors } = await fixture(t, { student: true });
    await page.evaluate((message) => deliver(message), call());
    assert.equal(await page.evaluate(() => audioStarts), 0);
    assert.equal(await page.locator('.voice-call-card__name').textContent(), '唐老师');
    assert.equal(await page.title(), '语音来电 · 唐老师');
    assert.equal(await page.locator('.voice-call-card').getAttribute('data-live-share-private'), '');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.voice-call-card')).opacity === '1');
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-voice-incoming.png') });
    await page.getByRole('button', { name: '接听', exact: true }).click();
    await page.waitForFunction(() => sent.some((message) => message.type === 'accept'));
    assert.equal(await page.evaluate(() => audioStarts), 1);
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: true, acceptedAt: Date.now() - 12000 }));
    assert.equal(await page.locator('.voice-call-card').isVisible(), false);
    assert.equal(await page.locator('.voice-call-floating').isVisible(), true);
    await page.getByRole('button', { name: '静音', exact: true }).click();
    assert.equal(await page.evaluate(() => audioMuted), true);
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-voice-active.png') });
    assert.ok((await page.locator('.voice-call-floating').boundingBox()).height <= 155, 'active call stays a compact strip');
    await page.locator('.voice-call-floating__collapse').click();
    assert.equal(await page.locator('.voice-call-window').isVisible(), false);
    await page.locator('.voice-call-floating__mute').click();
    assert.equal(await page.evaluate(() => audioMuted), false);
    await page.locator('.voice-call-floating__hangup').click();
    assert.equal(await page.evaluate(() => fakeAudio.ready), false);
    assert.equal(await page.locator('.voice-call-floating').isVisible(), false);
    assert.ok(await page.evaluate(() => sent.some((message) => message.type === 'hangup')));
    assert.deepEqual(errors, []);
});

it('incoming calls start centered, drag from the full header or blank space, and reset only for a new call', async (t) => {
    const { page, errors } = await fixture(t, { student: true });
    await page.evaluate((value) => deliver(value), call());
    const card = page.locator('.voice-call-card.is-incoming');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.voice-call-card')).opacity === '1');
    const center = await card.boundingBox();
    assert.ok(Math.abs(center.x + center.width / 2 - 640) <= 1);
    assert.ok(Math.abs(center.y + center.height / 2 - 400) <= 1);
    const handle = await page.locator('.voice-call-card__name').boundingBox();
    await page.mouse.move(handle.x + 20, handle.y + 8); await page.mouse.down();
    await page.mouse.move(handle.x - 160, handle.y - 92, { steps: 8 }); await page.mouse.up();
    const moved = await card.boundingBox();
    assert.ok(moved.x < center.x - 150 && moved.y < center.y - 70, 'dragging the teacher name moves the card');
    await page.evaluate((value) => deliver(value), call());
    assert.deepEqual(await card.boundingBox(), moved, 'repeat snapshots do not reset a dragged call');
    await page.mouse.move(moved.x + 8, moved.y + moved.height - 8); await page.mouse.down();
    await page.mouse.move(-80, -80, { steps: 8 }); await page.mouse.up();
    const clamped = await card.boundingBox();
    assert.ok(clamped.x >= 12 && clamped.y >= 12, 'blank-space dragging stays inside the viewport');
    await page.locator('.voice-call-card__top').focus(); await page.keyboard.press('Home');
    assert.deepEqual(await card.boundingBox(), center, 'Home recenters the incoming card');
    await page.keyboard.press('ArrowRight');
    assert.ok((await card.boundingBox()).x > center.x);
    await page.evaluate((value) => deliver(value), call({ callId: 'voice-call-next-ring' }));
    assert.deepEqual(await card.boundingBox(), center, 'a fresh call starts centered again');
    await page.locator('.voice-call-card__button.is-accept').click();
    assert.equal(await page.evaluate(() => audioStarts), 1, 'drag does not break explicit acceptance');
    assert.equal(await card.isVisible(), false);
    assert.deepEqual(errors, []);
});

it('incoming call stays reachable over a shared screen and clamps after a small-window resize', async (t) => {
    const { page, errors } = await fixture(t, { student: true, viewport: { width: 390, height: 620 } });
    await page.evaluate((value) => {
        const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;inset:0;background:#f4f6f7;z-index:2147481000';
        document.body.append(overlay); deliver(value);
    }, call());
    const card = page.locator('.voice-call-card.is-incoming');
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.voice-call-card')).opacity === '1');
    const box = await card.boundingBox();
    assert.ok(Math.abs(box.x + box.width / 2 - 195) <= 1 && Math.abs(box.y + box.height / 2 - 310) <= 1);
    assert.equal(await card.evaluate(node => {
        const rect = node.getBoundingClientRect(); return !!document.elementFromPoint(rect.x + 20, rect.y + 20)?.closest('.voice-call-card');
    }), true, 'the incoming card is above classroom sharing');
    const header = await page.locator('.voice-call-card__top').boundingBox();
    await page.mouse.move(header.x + 25, header.y + 25); await page.mouse.down();
    await page.mouse.move(380, 600, { steps: 6 }); await page.mouse.up();
    await page.setViewportSize({ width: 320, height: 360 });
    await page.waitForFunction(() => {
        const rect = document.querySelector('.voice-call-card').getBoundingClientRect();
        return rect.x >= 12 && rect.y >= 12 && rect.right <= innerWidth - 11 && rect.bottom <= innerHeight - 11;
    });
    await page.getByRole('button', { name: '暂不接听', exact: true }).click();
    assert.equal(await page.evaluate(() => sent.at(-1).type), 'reject');
    assert.equal(await page.evaluate(() => audioStarts), 0, 'moving/rejecting a call never requests microphone');
    assert.deepEqual(errors, []);
});

it('reject and a different tab stay silent; notification names are text, not markup', async (t) => {
    const { page } = await fixture(t, { student: true });
    const name = '<img src=x onerror="alert(1)">';
    await page.evaluate((message) => deliver(message), call({ teacherName: name }));
    assert.equal(await page.locator('.voice-call-card__name').textContent(), name);
    assert.equal(await page.locator('.voice-call-card img').count(), 0);
    await page.getByRole('button', { name: '暂不接听' }).click();
    assert.ok(await page.evaluate(() => sent.some((message) => message.type === 'reject')));
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: false }));
    assert.equal(await page.evaluate(() => audioStarts), 0);
    assert.equal(await page.locator('.voice-call-floating').isVisible(), false);
    assert.match(await page.locator('.voice-call-card__status').textContent(), /另一个页面/);
    assert.equal(await page.title(), 'OneByOne · 我的课堂');
});

it('voice stays accessible while viewing a shared page and cleans up without stopping sharing', async (t) => {
    const { page, errors } = await fixture(t);
    await page.evaluate(() => { document.body.classList.add('live-share-viewing'); const overlay = document.createElement('div'); overlay.className = 'live-share-overlay'; document.body.append(overlay); });
    assert.equal(await page.locator('[data-voice-call-open]').isVisible(), true);
    assert.equal(await page.locator('[data-live-share-open]').isVisible(), false);
    await page.locator('[data-voice-call-open]').click();
    assert.equal(await page.locator('.voice-call-picker').isVisible(), true);
    await page.getByRole('button', { name: '关闭语音拨号' }).click();
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: true, acceptedAt: Date.now() }));
    await page.waitForFunction(() => audioStarts === 1);
    assert.equal(await page.locator('.voice-call-floating').getAttribute('data-live-share-private'), '');
    await page.evaluate(() => cleanup());
    assert.equal(await page.locator('.voice-call-floating').count(), 0);
    assert.equal(await page.locator('.live-share-overlay').count(), 1);
    assert.equal(await page.evaluate(() => fakeAudio.ready), false);
    assert.deepEqual(errors, []);
});

it('small-screen dialer and incoming call fit without covering the entire page', async (t) => {
    const { page, errors } = await fixture(t, { viewport: { width: 375, height: 667 } });
    await page.locator('[data-voice-call-open]').click();
    await page.evaluate((message) => deliver(message), roster);
    const box = await page.locator('.voice-call-picker').boundingBox();
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 375 && box.y + box.height <= 667);
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-voice-mobile-picker.png') });
    await page.getByRole('button', { name: '关闭语音拨号' }).click();
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: true, acceptedAt: Date.now() }));
    const floating = await page.locator('.voice-call-floating').boundingBox();
    assert.ok(floating.x >= 0 && floating.y >= 0 && floating.x + floating.width <= 375 && floating.y + floating.height <= 667);
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.voice-call-floating')).opacity === '1');
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-voice-mobile-active.png') });
    assert.deepEqual(errors, []);
});

it('back-forward restoration reinstalls one listener and resumes only the confirmed owner', async (t) => {
    const { page, errors } = await fixture(t);
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: true, acceptedAt: Date.now() }));
    await page.waitForFunction(() => audioStarts === 1);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
    assert.equal(await page.evaluate(() => fakeAudio.ready), false);
    assert.equal(await page.locator('.voice-call-floating').count(), 0);
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    assert.equal(await page.locator('.voice-call-floating').count(), 1);
    assert.equal(await page.evaluate(() => audioStarts), 1, 'restoring the page itself does not reopen the mic');
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: false }));
    assert.equal(await page.evaluate(() => audioStarts), 1);
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: true, acceptedAt: Date.now() }));
    await page.waitForFunction(() => audioStarts === 2);
    assert.equal(await page.locator('.voice-call-floating').count(), 1);
    assert.deepEqual(errors, []);
});

it('the live floating strip avoids the assistant button, its expanded menu and dragged positions', async (t) => {
    const { page, errors } = await fixture(t, { viewport: { width: 1360, height: 900 } });
    await page.evaluate(() => {
        const host = document.querySelector('[data-teacher-assistant]');
        host.style.cssText = 'position:fixed;left:1260px;top:760px;right:auto;bottom:auto;width:88px;height:44px';
        const toggle = document.createElement('button'); toggle.dataset.assistantToggle = ''; toggle.textContent = '助手';
        toggle.style.cssText = 'width:88px;height:44px';
        const panel = document.createElement('section'); panel.dataset.assistantPanel = ''; panel.hidden = true;
        panel.style.cssText = 'position:fixed;left:1060px;top:400px;width:288px;height:348px;background:white';
        panel.textContent = '老师助手菜单';
        toggle.onclick = () => { panel.hidden = !panel.hidden; };
        host.replaceChildren(toggle, panel);
        window.voiceClearOfAssistant = () => {
            const box = document.querySelector('.voice-call-floating').getBoundingClientRect();
            return [...document.querySelectorAll('[data-assistant-toggle],[data-assistant-panel]')].filter((node) => !node.hidden)
                .every((node) => { const b = node.getBoundingClientRect(); return box.right <= b.left || box.left >= b.right || box.bottom <= b.top || box.top >= b.bottom; });
        };
    });
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: true, acceptedAt: Date.now() }));
    await page.waitForFunction(() => voiceClearOfAssistant());
    await page.locator('[data-assistant-toggle]').click();
    await page.waitForFunction(() => voiceClearOfAssistant());
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.voice-call-floating')).opacity === '1');
    const placed = await page.locator('.voice-call-floating').boundingBox();
    await page.waitForTimeout(150);
    assert.deepEqual(await page.locator('.voice-call-floating').boundingBox(), placed, 'placement stays stable after observers run');
    await page.locator('[data-assistant-toggle]').click();
    await page.evaluate(() => { document.querySelector('[data-teacher-assistant]').style.top = '600px'; });
    await page.waitForFunction(() => voiceClearOfAssistant());
    await page.locator('[data-assistant-toggle]').click();
    await page.waitForFunction(() => voiceClearOfAssistant());
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-voice-assistant-clear.png') });
    assert.deepEqual(errors, []);
});
it('terminal logout closes microphone and removes the active call strip', async (t) => {
    const { page } = await fixture(t);
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: true, acceptedAt: Date.now() }));
    await page.waitForFunction(() => fakeAudio.ready);
    await page.evaluate(() => deliver({ type: 'terminated', reason: '登录或课堂权限已失效，语音已结束。' }));
    assert.equal(await page.evaluate(() => fakeAudio.ready), false);
    assert.equal(await page.locator('.voice-call-floating').isVisible(), false);
    assert.equal(await page.locator('.voice-call-card').isVisible(), false);
});
it('old call events cannot hide the strip of a new outgoing call', async (t) => {
    const { page } = await fixture(t);
    const dial = async () => {
        await page.locator('[data-voice-call-open]').click();
        await page.evaluate((message) => deliver(message), roster);
        await page.locator('[data-voice-student="5"]').click();
    };
    await dial();
    await page.waitForFunction(() => sent.some((message) => message.type === 'dial'));
    const previous = await page.evaluate(() => sent.find((message) => message.type === 'dial').requestId);
    await page.evaluate((message) => deliver(message), call({ status: 'active', isOwner: true, requestId: previous }));
    await page.locator('.voice-call-window__button.is-danger').click();
    await page.evaluate((requestId) => deliver({ type: 'ended', callId: 'voice-call-abcdefgh', requestId }), previous);
    await dial();
    await page.waitForFunction(() => sent.filter((message) => message.type === 'dial').length === 2);
    await page.evaluate((requestId) => {
        deliver({ type: 'ended', callId: 'voice-call-abcdefgh', requestId });
        deliver({ type: 'error', requestId, message: '旧通话错误' });
    }, previous);
    assert.equal(await page.locator('.voice-call-floating').isVisible(), true);
    assert.equal(await page.evaluate(() => fakeAudio.ready), true);
});
