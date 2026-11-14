const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { before, after, it } = require('node:test');
const esbuild = require('esbuild');
const stylus = require('stylus');
const playwright = require('playwright');
const repo = path.resolve(__dirname, '..');
const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright.chromium.executablePath(),
    path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
    .find(value => value && fs.existsSync(value));
const code = esbuild.buildSync({ entryPoints: [path.join(repo, 'packages/ui-default/components/lesson/controller.ts')],
    bundle: true, write: false, format: 'iife', globalName: 'LessonUI' }).outputFiles[0].text;
const styleFile = path.join(repo, 'packages/ui-default/components/lesson.page.styl');
const css = stylus.render(fs.readFileSync(styleFile, 'utf8'), { filename: styleFile });
let browser;
before(async () => {
    assert(executablePath, 'A local Chromium runtime is required for lesson UI checks');
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => browser?.close());

const now = Date.parse('2026-11-15T10:00:00+08:00');
const lesson = (changes = {}) => ({ _id: 'lesson-abcdefghijklmnop', domainId: 'C0001', workspaceId: 'legacy', teacherUid: 2,
    studentUid: 5, teacherName: '唐老师', studentName: '橙子', title: 'Python 一对一',
    startAt: new Date(now + 10 * 60000).toISOString(), endAt: new Date(now + 70 * 60000).toISOString(),
    status: 'scheduled', teacherJoined: false, studentJoined: false, ...changes });

async function fixture(t, options = {}) {
    const context = await browser.newContext({ viewport: options.viewport || { width: 1360, height: 920 }, timezoneId: 'America/Los_Angeles' });
    t.after(() => context.close());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://lesson-ui.test/**', async route => {
        if (route.request().url().includes('/content/')) {
            await route.fulfill({ contentType: 'text/html', body: `<!doctype html><meta charset="utf-8"><style>${css}</style><main class="ui-v2-home"><h1>下一页</h1><section class="ui-pinned-contest"><h2>下个比赛</h2></section><div class="ui-v2-home__body">内容</div></main>` });
            return;
        }
        await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta charset="utf-8"><title>OneByOne</title><style>
          body{margin:0;background:#edf0f4;font-family:system-ui;color:#33465d}main{margin:36px}.ui-v2-home__hero{height:200px;background:linear-gradient(120deg,#d9eefe,#91bee9);border-radius:20px;padding:20px;margin-bottom:24px}.ui-pinned-contest{display:flex;align-items:center;justify-content:space-between;padding:24px;background:white;border:1px solid #dce5ee;border-radius:16px}.ui-pinned-contest__main{min-width:0}.ui-pinned-contest__main h2{font-size:22px}.ui-pinned-contest__action{padding:12px;background:#609fd5;color:white;border-radius:12px}.ui-v2-home__body{margin-top:24px;background:white;padding:36px;border-radius:20px}.assistant{position:fixed;bottom:25px;right:25px;padding:15px;background:#fff;border:1px solid #dce5ee;border-radius:14px}${css}
          </style></head><body><main class="ui-v2-home"><section class="ui-v2-home__hero"><h1>开始你的编程训练</h1><p>从一道题开始，记录每一次进步。</p></section><section class="ui-pinned-contest"><div class="ui-pinned-contest__main"><small>置顶比赛 · 正在进行</small><h2>周赛（11月9日—11月15日）</h2><p>2 小时 · 4 题</p></div><a class="ui-pinned-contest__action" href="#contest">进入比赛</a></section><div class="ui-v2-home__body">我的作业与训练计划</div></main><button class="assistant" data-lesson-open>上课模式</button><script>${code}</script><script>
          window.fakeNow=${options.now ?? now};window.requests=[];window.messages=[];window.mediaStarts=0;window.mediaStops=0;window.mediaReceives=[];window.mediaConnections=[];window.shareEvents=[];
          window.desktopEvents=[];window.desktopReservations=[];window.startedReservation=null;
          window.rows=${JSON.stringify(options.lessons || [])};window.uid=${options.student ? 5 : 2};
          window.students=[{uid:5,name:'橙子',online:true},{uid:7,name:'睿睿',online:false}];
          window.media={prepareDesktop(){const reservation={id:desktopReservations.length+1,cancelled:false};desktopReservations.push(reservation);desktopEvents.push('prepare');return reservation},cancelDesktop(reservation){reservation.cancelled=true;desktopEvents.push('cancel')},start(lesson,reservation){mediaStarts++;window.startedLesson=lesson._id;window.startedReservation=reservation;desktopEvents.push('start');return Promise.resolve()},receive(message){mediaReceives.push(message)},setConnected(value){mediaConnections.push(value)},stop(){mediaStops++},dispose(){mediaStops++}};
          window.dispatchShare=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}));
          for(const type of ['onebyone:lesson-share-start','onebyone:lesson-share-stop'])window.addEventListener(type,event=>shareEvents.push({type,detail:event.detail}));
          window.fakeFetch=async(url,init)=>{
            const body=init.body?JSON.parse(init.body):null;requests.push({url,body});
            if(body){
              desktopEvents.push('request:'+body.operation);
              if(['join','create'].includes(body.operation)){
                if(${!!options.holdMutation})return new Promise(resolve=>{window.releaseMutation=data=>{resolve(new Response(JSON.stringify(data)));setTimeout(()=>{window.mutationReplyDelivered=true},0)}});
                const reply=${JSON.stringify(options.mutationResponse ?? null)};
                if(reply)return new Response(JSON.stringify(reply),{status:${options.mutationStatus || 200}});
              }
              if(body.operation==='create'){
                const planned=!!body.startAt;
                const item={_id:'lesson-created-abcdefghijkl',domainId:'C0001',workspaceId:'legacy',teacherUid:2,studentUid:body.studentUid,teacherName:'唐老师',studentName:students.find(x=>x.uid===body.studentUid).name,title:body.title,startAt:body.startAt||new Date(fakeNow).toISOString(),endAt:new Date((body.startAt?Date.parse(body.startAt):fakeNow)+body.durationMinutes*60000).toISOString(),status:planned?'scheduled':'active',teacherJoined:!planned,studentJoined:false};rows.push(item);return new Response(JSON.stringify({lesson:item}));
              }
              const item=rows.find(row=>row._id===body.lessonId);
              if(!item)return new Response(JSON.stringify({message:'没有这节课'}),{status:404});
              if(body.operation==='join'){item[uid===item.teacherUid?'teacherJoined':'studentJoined']=true;item.status='active'}
              if(body.operation==='leave')item[uid===item.teacherUid?'teacherJoined':'studentJoined']=false;
              if(body.operation==='cancel')item.status='cancelled';if(body.operation==='end')item.status='ended';
              return new Response(JSON.stringify({lesson:item}));
            }
            return new Response(JSON.stringify({lessons:rows.filter(row=>url.startsWith('/d/C0002')?row.domainId==='C0002':row.domainId==='C0001'),students,serverNow:new Date(fakeNow).toISOString()}));
          };
          window.connections=[];
          window.fakeSocket=(url)=>{
            const connection={readyState:0,bufferedAmount:0,onopen:null,onmessage:null,onclose:null,onerror:null,url,
              send(data){const msg=JSON.parse(data);messages.push(msg);if(msg.type==='join')setTimeout(()=>this.deliver({type:'ready',lesson:rows.find(x=>x._id===msg.lessonId),peerOnline:${!!options.peerOnline}}),0)},
              deliver(data){this.onmessage?.({data:JSON.stringify(data)})},close(){this.readyState=3}};
            connections.push(connection);setTimeout(()=>{connection.readyState=1;connection.onopen?.({})},10);return connection;
          };
          window.cleanup=LessonUI.installLesson({enabled:true,uid,canTeach:${!options.student},apiUrl:'/d/C0001/lesson',socketUrl:'/d/C0001/lesson/conn'}, {fetch:fakeFetch,now:()=>fakeNow,pollIntervalMs:1000000,socketFactory:fakeSocket,mediaFactory:()=>media});
          window.refreshLessons=()=>document.dispatchEvent(new Event('visibilitychange'));
        </script></body></html>` });
    });
    await page.goto('https://lesson-ui.test/d/C0001/');
    await page.waitForFunction(() => requests.length > 0);
    return { page, errors };
}

it('booking an offline learner uses Beijing time on a device in another timezone without starting devices', async t => {
    const { page, errors } = await fixture(t);
    await page.locator('[data-lesson-open]').click();
    await page.getByRole('button', { name: '预约上课', exact: true }).click();
    await page.getByRole('searchbox', { name: '搜索上课学员' }).fill('7');
    await page.locator('[data-lesson-student="7"]').click();
    await page.getByLabel('上课时间（北京时间）').fill('2026-11-16T19:30');
    await page.getByPlaceholder('例如：Python 一对一').fill('C++ 递归课');
    await page.getByRole('button', { name: '确认预约', exact: true }).click();
    await page.waitForFunction(() => requests.some(x => x.body?.operation === 'create'));
    const request = await page.evaluate(() => requests.find(x => x.body?.operation === 'create'));
    assert.equal(request.body.studentUid, 7);
    assert.equal(request.body.startAt, '2026-11-16T11:30:00.000Z');
    assert.equal(request.body.durationMinutes, 60);
    assert.match(request.body.tabId, /^[a-f0-9]{32}$/);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    assert.equal(await page.evaluate(() => desktopReservations.length), 0);
    await page.waitForSelector('[data-lesson-home]');
    assert.match(await page.locator('[data-lesson-home]').textContent(), /19:30/);
    assert.match(await page.locator('[data-lesson-home]').textContent(), /睿睿/);
    assert.equal(await page.locator('.ui-pinned-contest__action').isVisible(), true);
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-lesson-scheduled.png') });
    assert.deepEqual(errors, []);
});

it('due-time reminders require a click and keep both devices idle until the learner enters', async t => {
    const { page, errors } = await fixture(t, { student: true, lessons: [lesson()] });
    assert.equal(await page.locator('.lesson-reminder').isVisible(), false);
    assert.equal(await page.locator('[data-lesson-home] [data-lesson-join]').isDisabled(), true);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    assert.equal(await page.evaluate(() => desktopReservations.length), 0, 'the reminder does not open desktop floating');
    await page.evaluate(() => { fakeNow += 11 * 60000; });
    await page.waitForFunction(() => document.querySelector('.lesson-reminder')?.open);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    const box = await page.locator('.lesson-reminder').boundingBox();
    assert.ok(Math.abs(box.x + box.width / 2 - 680) < 2 && Math.abs(box.y + box.height / 2 - 460) < 2);
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-lesson-reminder.png') });
    await page.locator('[data-lesson-reminder-join]').click();
    await page.waitForFunction(() => mediaStarts === 1 && messages.some(x => x.type === 'join'));
    assert.equal(await page.locator('.lesson-reminder').isVisible(), false);
    assert.equal(await page.evaluate(() => connections.length), 1);
    assert.equal(await page.evaluate(() => requests.filter(x => x.body?.operation === 'join').length), 1);
    assert.deepEqual(await page.evaluate(() => desktopEvents.slice(0, 3)), ['prepare', 'request:join', 'start']);
    assert.equal(await page.evaluate(() => startedReservation === desktopReservations[0] && !startedReservation.cancelled), true);
    assert.deepEqual(errors, []);
});

it('an invitation already active when a learner logs in shows the central join card without opening media', async t => {
    const { page, errors } = await fixture(t, { student: true,
        lessons: [lesson({ status: 'active', teacherJoined: true, startAt: new Date(now - 60000).toISOString() })] });
    await page.waitForFunction(() => document.querySelector('.lesson-reminder')?.open);
    assert.match(await page.locator('.lesson-reminder').textContent(), /老师邀请你上课/);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    await page.getByRole('button', { name: '稍后提醒' }).click();
    await page.evaluate(() => { refreshLessons(); });
    assert.equal(await page.locator('.lesson-reminder').isVisible(), false);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    assert.deepEqual(errors, []);
});

it('an entry rejected by the server releases desktop floating without starting media', async t => {
    const { page, errors } = await fixture(t, { student: true,
        lessons: [lesson({ status: 'active', teacherJoined: true, startAt: new Date(now - 60000).toISOString() })],
        mutationResponse: { error: 'FORBIDDEN', message: '没有课堂权限' }, mutationStatus: 403 });
    await page.locator('[data-lesson-reminder-join]').click();
    await page.waitForFunction(() => desktopReservations[0]?.cancelled);
    assert.deepEqual(await page.evaluate(() => desktopEvents.slice(0, 3)), ['prepare', 'request:join', 'cancel']);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    assert.equal(await page.evaluate(() => connections.length), 0);
    assert.match(await page.locator('.lesson-reminder .lesson-error').textContent(), /没有课堂权限/);
    assert.deepEqual(errors, []);
});

it('session disposal closes an entry reservation before its delayed REST reply arrives', async t => {
    const { page, errors } = await fixture(t, { holdMutation: true });
    await page.locator('[data-lesson-open]').click();
    await page.locator('[data-lesson-student="5"]').click();
    await page.locator('[data-lesson-create]').click();
    await page.waitForFunction(() => !!window.releaseMutation);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    await page.evaluate(() => window.dispatchEvent(new Event('onebyone:session-ended')));
    assert.equal(await page.evaluate(() => desktopReservations[0].cancelled), true);
    await page.evaluate(() => releaseMutation({ lesson: { ...rows[0], _id: 'late-classroom' } }));
    await page.waitForFunction(() => window.mutationReplyDelivered);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    assert.equal(await page.evaluate(() => connections.length), 0);
    assert.deepEqual(errors, []);
});

it('a teacher enters immediately, waits for learner consent, and switches sharing without restarting media', async t => {
    const { page, errors } = await fixture(t);
    await page.locator('[data-lesson-open]').click();
    await page.locator('[data-lesson-student="5"]').click();
    await page.getByPlaceholder('例如：Python 一对一').fill('Python 上课');
    await page.screenshot({ path: path.join(os.tmpdir(), 'onebyone-lesson-picker.png') });
    await page.locator('[data-lesson-create]').click();
    await page.waitForFunction(() => mediaStarts === 1 && connections.length === 1 && mediaConnections.includes(true));
    assert.deepEqual(await page.evaluate(() => desktopEvents.slice(0, 3)), ['prepare', 'request:create', 'start']);
    assert.equal(await page.evaluate(() => startedReservation === desktopReservations[0] && !startedReservation.cancelled), true);
    assert.equal(await page.evaluate(() => shareEvents.length), 0, 'unaccepted invitations do not start sharing');
    await page.evaluate(() => {
        rows[0].studentJoined = true;
        connections[0].deliver({ type: 'lesson', lesson: rows[0] });
        connections[0].deliver({ type: 'peer', online: true });
    });
    await page.waitForFunction(() => shareEvents.some(x => x.type.endsWith('share-start')));
    assert.equal(await page.evaluate(() => shareEvents.find(x => x.type.endsWith('share-start')).detail.mode), 'broadcast');
    const starts = await page.evaluate(() => mediaStarts);
    const stops = await page.evaluate(() => mediaStops);
    await page.getByRole('button', { name: '共享学员页面', exact: true }).click();
    assert.equal(await page.evaluate(() => shareEvents.at(-1).detail.mode), 'assist');
    await page.evaluate(() => { refreshLessons(); });
    await page.waitForTimeout(100);
    assert.equal(await page.getByRole('button', { name: '共享学员页面', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => shareEvents.filter(x => x.type.endsWith('share-start')).length), 2);
    await page.getByRole('button', { name: '分享我的画面', exact: true }).click();
    assert.equal(await page.evaluate(() => shareEvents.at(-1).detail.mode), 'broadcast');
    assert.equal(await page.evaluate(() => mediaStarts), starts);
    assert.equal(await page.evaluate(() => mediaStops), stops);
    await page.evaluate(() => connections[0].deliver({ type: 'peer', online: false }));
    assert.equal(await page.evaluate(() => shareEvents.at(-1).type), 'onebyone:lesson-share-stop');
    assert.equal(await page.evaluate(() => mediaStops), stops, 'a peer leaving clears its image without releasing the local camera');
    await page.getByRole('button', { name: '结束课堂', exact: true }).click();
    await page.waitForFunction(() => requests.some(x => x.body?.operation === 'end'));
    assert.equal(await page.locator('.lesson-session').isVisible(), false);
    assert.equal(await page.evaluate(() => mediaStops), stops + 1);
    assert.deepEqual(errors, []);
});

it('classroom media stays in the host across content navigation and the next classroom scope is adopted after leaving', async t => {
    const current = lesson({ status: 'active', teacherJoined: true, studentJoined: true, startAt: new Date(now - 60000).toISOString() });
    const next = lesson({ _id: 'lesson-in-next-classroom', domainId: 'C0002', title: '下一课堂课程' });
    const { page, errors } = await fixture(t, { lessons: [current, next], peerOnline: true });
    await page.locator('[data-lesson-home] [data-lesson-join]').click();
    await page.waitForFunction(() => mediaStarts === 1 && mediaConnections.includes(true));
    const before = await page.evaluate(() => ({ mediaStarts, mediaStops, connection: connections.length }));
    await page.evaluate(() => {
        const frame = document.createElement('iframe'); frame.id = 'content'; frame.src = '/content/next'; document.body.append(frame);
        window.__onebyonePlatformShell = { contentWindow: () => frame.contentWindow };
    });
    await page.frameLocator('#content').getByRole('heading', { name: '下一页' }).waitFor();
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('onebyone:page-change', { detail: {
        window: document.querySelector('#content').contentWindow,
        context: { lesson: { enabled: true, uid: 2, canTeach: true, apiUrl: '/d/C0002/lesson', socketUrl: '/d/C0002/lesson/conn' } },
    } })));
    assert.deepEqual(await page.evaluate(() => ({ mediaStarts, mediaStops, connection: connections.length })), before);
    assert.equal(await page.evaluate(() => requests.some(x => x.url === '/d/C0002/lesson')), false);
    await page.getByRole('button', { name: '离开课堂', exact: true }).click();
    await page.waitForFunction(() => requests.some(x => x.url === '/d/C0002/lesson'));
    const leave = await page.evaluate(() => requests.find(x => x.body?.operation === 'leave'));
    assert.equal(leave.url, '/d/C0001/lesson');
    await page.frameLocator('#content').getByText('下一课堂课程', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => mediaStarts), before.mediaStarts);
    await page.evaluate(() => window.dispatchEvent(new Event('onebyone:session-ended')));
    assert.equal(await page.locator('.lesson-picker').count(), 0);
    assert.equal(await page.frameLocator('#content').locator('[data-lesson-home]').count(), 0);
    assert.deepEqual(errors, []);
});

it('cancelled bookings disappear and invalid calendar dates are rejected before sending a request', async t => {
    const { page, errors } = await fixture(t, { lessons: [lesson()] });
    await page.locator('[data-lesson-home] [data-lesson-cancel]').click();
    await page.waitForFunction(() => !document.querySelector('[data-lesson-home]'));
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    const result = await page.evaluate(() => {
        const values = ['2026-02-30T12:00', '2026-11-15T25:00', 'not a date'];
        return values.map(value => { try { LessonUI.lessonStartIso(value); return false; } catch { return true; } });
    });
    assert.deepEqual(result, [true, true, true]);
    assert.deepEqual(errors, []);
});
