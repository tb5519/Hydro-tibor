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
    browser = await playwright.chromium.launch({ executablePath, headless: true,
        args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
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
    if (options.realMedia) await context.addInitScript(() => {
        window.screenRequests = []; window.deviceTracks = [];
        Object.defineProperty(window, 'documentPictureInPicture', { value: undefined });
        const devices = navigator.mediaDevices;
        const getDevices = devices.getUserMedia.bind(devices);
        devices.getUserMedia = async (constraints) => {
            const stream = await getDevices(constraints);
            deviceTracks.push(...stream.getTracks());
            return stream;
        };
        devices.getDisplayMedia = constraints => {
            screenRequests.push({ constraints, activeClick: navigator.userActivation.isActive,
                joined: requests.some(request => request.body?.operation === 'join') });
            return new Promise((resolve, reject) => {
                window.selectScreen = (surface = 'monitor') => {
                    if (surface === 'cancel') { reject(new DOMException('Cancelled', 'NotAllowedError')); return; }
                    const canvas = document.createElement('canvas'); canvas.width = 800; canvas.height = 450;
                    const draw = canvas.getContext('2d'); draw.fillStyle = '#546ae8'; draw.fillRect(0, 0, 800, 450);
                    const stream = canvas.captureStream(8); window.screenTrack = stream.getVideoTracks()[0];
                    const settings = screenTrack.getSettings.bind(screenTrack);
                    screenTrack.getSettings = () => ({ ...settings(), displaySurface: surface });
                    resolve(stream);
                };
            });
        };
    });
    const page = await context.newPage();
    let allowExit = options.confirmExit !== false;
    const confirmations = [];
    page.on('dialog', async dialog => {
        confirmations.push(dialog.message());
        if (allowExit) await dialog.accept(); else await dialog.dismiss();
    });
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
          window.rows=${JSON.stringify([...new Map([...(options.lessons || []), ...(options.history || [])].map(row => [row._id, row])).values()])};window.uid=${options.student ? 5 : 2};
          window.resumeIntent=${JSON.stringify(options.resumeLessonId || null)};window.failFinish=false;window.failResume=false;
          window.pageDomain=location.pathname.match(/^\\/d\\/([^/]+)/)?.[1]||'C0001';
          window.students=[{uid:5,name:'橙子',online:true},{uid:7,name:'睿睿',online:false}];
          window.media={prepareDesktop(){const reservation={id:desktopReservations.length+1,cancelled:false};desktopReservations.push(reservation);desktopEvents.push('prepare');return reservation},cancelDesktop(reservation){reservation.cancelled=true;desktopEvents.push('cancel')},start(lesson,reservation){mediaStarts++;window.startedLesson=lesson._id;window.startedReservation=reservation;desktopEvents.push('start');return Promise.resolve()},receive(message){mediaReceives.push(message)},setConnected(value){mediaConnections.push(value)},stop(){mediaStops++},dispose(){mediaStops++}};
          window.dispatchShare=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}));
          for(const type of ['onebyone:lesson-share-start','onebyone:lesson-share-stop'])window.addEventListener(type,event=>shareEvents.push({type,detail:event.detail}));
          window.fakeFetch=async(url,init)=>{
            const body=init.body?JSON.parse(init.body):null;requests.push({url,body});
            if(url.endsWith('/lesson/inbox'))return new Response(JSON.stringify({uid,lessons:rows.filter(row=>[row.teacherUid,row.studentUid].includes(uid)&&['scheduled','active'].includes(row.status)).map(row=>({...row,apiUrl:'/d/'+row.domainId+'/lesson',socketUrl:'/d/'+row.domainId+'/lesson/conn',canTeach:row.teacherUid===uid})),serverNow:new Date(fakeNow).toISOString()}));
            if(body){
              if(url.endsWith('/lesson/resume')){
                if(failResume)throw new Error('网络中断');
                const item=rows.find(row=>row._id===resumeIntent&&row.status==='active');
                if(body.expectedUid!==uid)return new Response(JSON.stringify({code:'FORBIDDEN'}),{status:403});
                if(!item)return new Response(JSON.stringify({uid,lesson:null,serverNow:new Date(fakeNow).toISOString()}));
                item[uid===item.teacherUid?'teacherJoined':'studentJoined']=true;
                return new Response(JSON.stringify({uid,lesson:item,apiUrl:'/d/'+item.domainId+'/lesson',socketUrl:'/d/'+item.domainId+'/lesson/conn',canTeach:uid===item.teacherUid,serverNow:new Date(fakeNow).toISOString()}));
              }
              desktopEvents.push('request:'+body.operation);
              if(['join','create'].includes(body.operation)){
                if(${!!options.holdMutation})return new Promise(resolve=>{window.releaseMutation=data=>{resolve(new Response(JSON.stringify(data)));setTimeout(()=>{window.mutationReplyDelivered=true},0)}});
                const reply=${JSON.stringify(options.mutationResponse ?? null)};
                if(reply)return new Response(JSON.stringify(reply),{status:${options.mutationStatus || 200}});
              }
              if(body.operation==='create'){
                const planned=!!body.startAt;
                const item={_id:'lesson-created-abcdefghijkl',domainId:pageDomain,workspaceId:'legacy',teacherUid:2,studentUid:body.studentUid,teacherName:'唐老师',studentName:students.find(x=>x.uid===body.studentUid).name,title:body.title,startAt:body.startAt||new Date(fakeNow).toISOString(),endAt:new Date((body.startAt?Date.parse(body.startAt):fakeNow)+body.durationMinutes*60000).toISOString(),status:planned?'scheduled':'active',teacherJoined:!planned,studentJoined:false};rows.push(item);if(!planned)resumeIntent=item._id;return new Response(JSON.stringify({lesson:item}));
              }
              const item=rows.find(row=>row._id===body.lessonId);
              if(!item)return new Response(JSON.stringify({message:'没有这节课'}),{status:404});
              if(body.operation==='join'){item[uid===item.teacherUid?'teacherJoined':'studentJoined']=true;item.status='active';resumeIntent=item._id}
              if(['end','leave'].includes(body.operation)&&failFinish)throw new Error('网络中断');
              if(body.operation==='leave'){item[uid===item.teacherUid?'teacherJoined':'studentJoined']=false;if(resumeIntent===item._id)resumeIntent=null}
              if(body.operation==='cancel')item.status='cancelled';if(body.operation==='end'){item.status='ended';if(resumeIntent===item._id)resumeIntent=null}
              return new Response(JSON.stringify({lesson:item}));
            }
            const domainId=url.match(/^\\/d\\/([^/]+)\\/lesson$/)?.[1]||pageDomain;
            return new Response(JSON.stringify({lessons:rows.filter(row=>row.domainId===domainId),history:uid===2?rows.filter(row=>row.teacherUid===uid).map(row=>({...row,apiUrl:'/d/'+row.domainId+'/lesson',domainName:'课堂 '+row.domainId})):[],historyHasMore:false,students,serverNow:new Date(fakeNow).toISOString()}));
          };
          window.connections=[];window.noticeConnections=[];window.noticeMessages=[];
          window.fakeSocket=(url)=>{
            if(url.endsWith('/lesson/notifications')){
              const notice={readyState:0,bufferedAmount:0,onopen:null,onmessage:null,onclose:null,onerror:null,url,
                send(data){const msg=JSON.parse(data);noticeMessages.push(msg);if(msg.type==='subscribe'&&(!${!!options.holdNoticeReady}||noticeConnections.length>1))setTimeout(()=>this.deliver({type:'ready',uid,revision:0}),0);if(msg.type==='pulse')this.deliver({type:'pulse',uid})},
                deliver(data){this.onmessage?.({data:JSON.stringify(data)})},close(){this.readyState=3},drop(){this.readyState=3;this.onclose?.({})}};
              noticeConnections.push(notice);setTimeout(()=>{notice.readyState=1;notice.onopen?.({})},10);return notice;
            }
            const connection={readyState:0,bufferedAmount:0,onopen:null,onmessage:null,onclose:null,onerror:null,url,
              send(data){const msg=JSON.parse(data);messages.push(msg);if(msg.type==='join')setTimeout(()=>this.deliver({type:'ready',lesson:rows.find(x=>x._id===msg.lessonId),peerOnline:${!!options.peerOnline}}),0);if(msg.type==='pulse')this.deliver({type:'pulse'})},
              deliver(data){this.onmessage?.({data:JSON.stringify(data)})},close(){this.readyState=3},drop(){this.readyState=3;this.onclose?.({})}};
            connections.push(connection);setTimeout(()=>{connection.readyState=1;connection.onopen?.({})},10);return connection;
          };
          window.cleanup=LessonUI.installLesson({enabled:true,uid,canTeach:${!options.student},apiUrl:'/d/'+pageDomain+'/lesson',socketUrl:'/d/'+pageDomain+'/lesson/conn',resumeUrl:'/d/'+pageDomain+'/lesson/resume',...(${!!options.notifications}?{notificationsUrl:'/d/'+pageDomain+'/lesson/notifications',inboxUrl:'/d/'+pageDomain+'/lesson/inbox'}:{})}, {fetch:fakeFetch,now:()=>fakeNow,pollIntervalMs:1000000,socketFactory:fakeSocket,mediaFactory:${options.realMedia ? 'undefined' : '()=>media'}});
          window.refreshLessons=()=>document.dispatchEvent(new Event('visibilitychange'));
        </script></body></html>` });
    });
    await page.goto('https://lesson-ui.test/d/C0001/');
    await page.waitForFunction(() => requests.length > 0);
    return { page, errors, confirmations, setExitDecision(value) { allowExit = value; } };
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

const activeLesson = () => lesson({ status: 'active', teacherJoined: true, startAt: new Date(now - 60000).toISOString() });
const watchScreen = (page, watching) => page.evaluate(flag => connections[0].deliver({
    type: 'screen-view', lessonId: rows[0]._id, uid: rows[0].teacherUid, streamId: 'teacher-stream', watching: flag,
}), watching);

it('opens the screen picker in the learner join click and reuses the authorized track only when the teacher is watching', async t => {
    const { page, errors } = await fixture(t, { student: true, realMedia: true, lessons: [activeLesson()], holdMutation: true, peerOnline: true });
    const join = page.locator('[data-lesson-reminder-join]'); await join.waitFor();
    assert.deepEqual(await page.evaluate(() => [screenRequests.length, deviceTracks.length, messages.length]), [0, 0, 0]);
    await join.click(); await page.waitForFunction(() => !!window.releaseMutation);
    const calls = await page.evaluate(() => screenRequests);
    assert.equal(calls.length, 1); assert.equal(calls[0].activeClick, true); assert.equal(calls[0].joined, false);
    assert.equal(calls[0].constraints.video.displaySurface, 'monitor'); assert.equal(calls[0].constraints.audio, false);
    await page.evaluate(() => selectScreen());
    assert.deepEqual(await page.evaluate(() => [screenTrack.readyState, deviceTracks.length, messages.length]), ['live', 0, 0]);
    await page.evaluate(() => { rows[0].studentJoined = true; releaseMutation({ lesson: rows[0] }); });
    await page.waitForFunction(() => messages.some(m => m.type === 'video') && messages.some(m => m.type === 'audio'));
    assert.equal(await page.evaluate(() => messages.some(m => m.type === 'screen')), false);
    await watchScreen(page, true);
    await page.waitForFunction(() => messages.some(m => m.type === 'screen' && m.data.startsWith('data:image/jpeg;base64,')));
    await watchScreen(page, false);
    const count = await page.evaluate(() => messages.filter(m => m.type === 'screen').length);
    await page.waitForTimeout(380);
    assert.equal(await page.evaluate(() => messages.filter(m => m.type === 'screen').length), count);
    await watchScreen(page, true);
    await page.waitForFunction(n => messages.filter(m => m.type === 'screen').length > n, count);
    assert.equal(await page.evaluate(() => screenRequests.length), 1);
    await page.evaluate(() => { rows[0].status = 'ended'; connections[0].deliver({ type: 'ended', lessonId: rows[0]._id }); });
    await page.waitForFunction(() => screenTrack.readyState === 'ended' && deviceTracks.every(track => track.readyState === 'ended'));
    assert.deepEqual(errors, []);
});

it('joins via the course card after screen consent is cancelled and leaves camera and microphone available', async t => {
    const { page, errors } = await fixture(t, { student: true, realMedia: true, lessons: [activeLesson()], peerOnline: true });
    await page.getByRole('button', { name: '稍后提醒' }).click();
    await page.locator('[data-lesson-home] [data-lesson-join]').click();
    assert.equal(await page.evaluate(() => screenRequests.length), 1);
    await page.evaluate(() => selectScreen('cancel'));
    await page.waitForFunction(() => messages.some(m => m.type === 'audio') && messages.some(m => m.type === 'video'));
    await watchScreen(page, true);
    await page.locator('[data-lesson-screen-share]').waitFor();
    assert.deepEqual(await page.evaluate(() => [screenRequests.length, messages.some(m => m.type === 'screen')]), [1, false]);
    await page.locator('[data-lesson-media-leave]').click();
    await page.locator('[data-lesson-exit-confirm]').click();
    await page.waitForFunction(() => requests.some(r => r.body?.operation === 'leave') && deviceTracks.every(t => t.readyState === 'ended'));
    assert.deepEqual(errors, []);
});

it('releases a late screen selection when the learner leaves the classroom host before admission', async t => {
    const { page, errors } = await fixture(t, { student: true, realMedia: true, lessons: [activeLesson()], holdMutation: true });
    await page.locator('[data-lesson-reminder-join]').click();
    await page.waitForFunction(() => !!window.releaseMutation);
    await page.evaluate(() => {
        window.dispatchEvent(new PageTransitionEvent('pagehide'));
        selectScreen(); releaseMutation({ lesson: { ...rows[0], studentJoined: true } });
    });
    await page.waitForFunction(() => window.mutationReplyDelivered && screenTrack.readyState === 'ended');
    assert.deepEqual(await page.evaluate(() => [deviceTracks.length, connections.length, messages.length]), [0, 0, 0]);
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
    assert.equal(await page.evaluate(() => shareEvents.some(event => event.type.endsWith('share-stop'))), false,
        'a short peer outage must preserve the existing classroom sharing and its annotations');
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

it('a teacher can confirm ending a cross-domain old lesson while keeping the current class and cancelling is inert', async t => {
    const current = lesson({ status: 'active', teacherJoined: true, studentJoined: true, title: '当前新课', startAt: new Date(now - 60000).toISOString() });
    const old = lesson({ _id: 'historical-old-domain-class', domainId: 'C0002', status: 'active', title: '待清理旧课',
        startAt: new Date(now - 3 * 86400000).toISOString(), endAt: new Date(now - 2 * 86400000).toISOString() });
    const { page, errors, confirmations, setExitDecision } = await fixture(t, { lessons: [current], history: [old],
        resumeLessonId: current._id, peerOnline: true, confirmExit: false });
    await page.waitForFunction(() => mediaStarts === 1 && mediaConnections.includes(true));
    await page.locator('[data-lesson-open]').click();
    await page.getByRole('heading', { name: '历史课程', exact: true }).waitFor();
    const baseline = await page.evaluate(() => ({ starts: mediaStarts, stops: mediaStops,
        hint: localStorage.getItem('onebyone.lesson.recovery:2'), events: shareEvents.length }));
    await page.locator('[data-lesson-end="historical-old-domain-class"]').click();
    assert.equal(confirmations.length, 1);
    assert.equal(await page.evaluate(() => requests.some(item => item.body?.operation === 'end')), false);
    assert.deepEqual(await page.evaluate(() => ({ starts: mediaStarts, stops: mediaStops,
        hint: localStorage.getItem('onebyone.lesson.recovery:2'), events: shareEvents.length })), baseline);
    setExitDecision(true);
    await page.locator('[data-lesson-end="historical-old-domain-class"]').click();
    await page.locator('[data-lesson-history-id="historical-old-domain-class"]').getByText('已结束', { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => requests.find(item => item.body?.operation === 'end').url), '/d/C0002/lesson');
    assert.deepEqual(await page.evaluate(() => ({ starts: mediaStarts, stops: mediaStops,
        hint: localStorage.getItem('onebyone.lesson.recovery:2'), events: shareEvents.length })), baseline);
    assert.equal(await page.locator('.lesson-session').isVisible(), true); assert.deepEqual(errors, []);
});

it('a previously joined class resumes from another classroom page and reloads without another invitation or desktop click', async t => {
    const current = lesson({ status: 'active', teacherJoined: true, studentJoined: true,
        startAt: new Date(now - 60000).toISOString() });
    const { page, errors } = await fixture(t, { lessons: [current], resumeLessonId: current._id, peerOnline: true });
    await page.waitForFunction(() => mediaStarts === 1 && mediaConnections.includes(true));
    await page.getByRole('button', { name: '共享学员页面', exact: true }).click();
    await page.goto('https://lesson-ui.test/d/C0002/p');
    await page.waitForFunction(() => mediaStarts === 1 && mediaConnections.includes(true));
    assert.equal(await page.evaluate(() => startedLesson), current._id);
    assert.equal(await page.evaluate(() => connections[0].url), 'wss://lesson-ui.test/d/C0001/lesson/conn');
    assert.equal(await page.evaluate(() => desktopReservations.length), 0, 'automatic recovery never prepares a window without a click');
    assert.equal(await page.getByRole('button', { name: '共享学员页面', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => requests.some(item => ['join', 'create'].includes(item.body?.operation))), false);
    const before = await page.evaluate(() => shareEvents.filter(item => item.type.endsWith('share-start')).length);
    await page.evaluate(() => window.dispatchEvent(new Event('onebyone:lesson-share-ready')));
    assert.equal(await page.evaluate(() => shareEvents.filter(item => item.type.endsWith('share-start')).length), before + 1,
        'late share-module initialization receives the active classroom again');
    await page.reload();
    await page.waitForFunction(() => mediaStarts === 1 && mediaConnections.includes(true));
    assert.equal(await page.evaluate(() => desktopReservations.length), 0);
    assert.equal(await page.getByRole('button', { name: '共享学员页面', exact: true }).getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
});

it('a dropped classroom reconnects through REST without restarting devices, while a replaced tab stays yielded', async t => {
    const current = lesson({ status: 'active', teacherJoined: true, studentJoined: true,
        startAt: new Date(now - 60000).toISOString() });
    const { page, errors } = await fixture(t, { lessons: [current], resumeLessonId: current._id, peerOnline: true });
    await page.waitForFunction(() => mediaStarts === 1 && mediaConnections.includes(true));
    const initialResumes = await page.evaluate(() => requests.filter(item => item.url.endsWith('/resume')).length);
    await page.evaluate(() => { connections[0].drop(); window.dispatchEvent(new Event('online')); });
    await page.waitForFunction(() => connections.length === 2 && mediaConnections.at(-1) === true);
    assert.equal(await page.evaluate(() => mediaStarts), 1);
    assert.equal(await page.evaluate(() => mediaStops), 0);
    assert.equal(await page.evaluate(() => requests.filter(item => item.url.endsWith('/resume')).length), initialResumes + 1);
    assert.equal(await page.evaluate(() => shareEvents.some(item => item.type.endsWith('share-stop'))), false);
    await page.evaluate(() => connections[1].deliver({ type: 'error', code: 'REPLACED', message: '已在其他页面续课' }));
    const yielded = await page.evaluate(() => ({ sockets: connections.length, resumes: requests.filter(item => item.url.endsWith('/resume')).length }));
    await page.evaluate(() => { window.dispatchEvent(new Event('online')); refreshLessons(); });
    await page.waitForTimeout(100);
    assert.deepEqual(await page.evaluate(() => ({ sockets: connections.length, resumes: requests.filter(item => item.url.endsWith('/resume')).length })), yielded);
    assert.equal(await page.evaluate(() => mediaStops), 1);
    assert.deepEqual(errors, []);
});

it('an offline teacher end is synchronized before page recovery and never reopens the camera', async t => {
    const current = lesson({ status: 'active', teacherJoined: true, studentJoined: true,
        startAt: new Date(now - 60000).toISOString() });
    const { page, errors } = await fixture(t, { lessons: [current], resumeLessonId: current._id, peerOnline: true });
    await page.waitForFunction(() => mediaStarts === 1 && mediaConnections.includes(true));
    await page.evaluate(() => { failFinish = true; });
    await page.getByRole('button', { name: '结束课堂', exact: true }).click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('onebyone.lesson.recovery:2') || '{}').pending === 'end');
    await page.reload();
    await page.waitForFunction(() => requests.some(item => item.body?.operation === 'end'));
    await page.waitForFunction(() => !localStorage.getItem('onebyone.lesson.recovery:2'));
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    assert.equal(await page.evaluate(() => connections.length), 0);
    assert.equal(await page.evaluate(() => requests.some(item => item.url.endsWith('/resume'))), false);
    assert.deepEqual(errors, []);
});

it('account notifications deliver a cross-domain invitation immediately and join only after a click using its original classroom', async t => {
    const { page, errors } = await fixture(t, { student: true, notifications: true });
    await page.waitForFunction(() => requests.some(item => item.url.endsWith('/lesson/inbox')) && noticeMessages.some(item => item.type === 'subscribe'));
    assert.deepEqual(await page.evaluate(() => noticeMessages[0]), { type: 'subscribe', expectedUid: 5 });
    const invitation = lesson({ _id: 'lesson-account-invitation', domainId: 'C0002', status: 'active',
        teacherJoined: true, startAt: new Date(now - 60000).toISOString() });
    await page.evaluate(row => {
        rows.push(row); noticeConnections[0].deliver({ type: 'changed', uid: 5, revision: 1 });
    }, invitation);
    await page.waitForFunction(() => document.querySelector('.lesson-reminder')?.open);
    assert.match(await page.locator('.lesson-reminder').textContent(), /老师邀请你上课/);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    assert.equal(await page.evaluate(() => connections.length), 0);
    assert.equal(await page.evaluate(() => desktopReservations.length), 0);
    await page.locator('[data-lesson-reminder-join]').click();
    await page.waitForFunction(() => mediaStarts === 1 && mediaConnections.includes(true));
    assert.equal(await page.evaluate(() => requests.find(item => item.body?.operation === 'join').url), '/d/C0002/lesson');
    assert.equal(await page.evaluate(() => connections[0].url), 'wss://lesson-ui.test/d/C0002/lesson/conn');
    await page.evaluate(row => {
        rows.push(row); noticeConnections[0].deliver({ type: 'changed', uid: 5, revision: 2 });
    }, lesson({ _id: 'lesson-another-invitation', domainId: 'C0003', status: 'active',
        teacherUid: 3, teacherName: '另一位老师', teacherJoined: true, startAt: new Date(now - 60000).toISOString() }));
    await page.waitForFunction(() => !document.querySelector('.lesson-invitations')?.hidden
        && document.querySelector('.lesson-invitations')?.textContent.includes('另一位老师'));
    assert.equal(await page.evaluate(() => startedLesson), invitation._id);
    assert.equal(await page.evaluate(() => mediaStarts), 1);
    assert.equal(await page.evaluate(() => mediaStops), 0);
    assert.equal(await page.locator('.lesson-reminder').isVisible(), false, 'a new invitation does not cover an ongoing class');
    assert.equal(await page.evaluate(() => requests.filter(item => item.body?.operation === 'join').length), 1);
    assert.deepEqual(errors, []);
});

it('notifications fetch the latest invitation after first subscription and remove cancellations missed while disconnected', async t => {
    const { page, errors } = await fixture(t, { student: true, notifications: true, holdNoticeReady: true });
    await page.waitForFunction(() => noticeMessages.some(item => item.type === 'subscribe'));
    const beforeReadyInboxCount = await page.evaluate(() => requests.filter(item => item.url.endsWith('/lesson/inbox')).length);
    const invitation = lesson({ _id: 'lesson-during-subscription', domainId: 'C0002',
        startAt: new Date(now - 60000).toISOString() });
    await page.evaluate(row => {
        rows.push(row); noticeConnections[0].deliver({ type: 'ready', uid: 5, revision: 0 });
    }, invitation);
    await page.waitForFunction(() => document.querySelector('.lesson-reminder')?.open);
    assert(await page.evaluate(() => requests.filter(item => item.url.endsWith('/lesson/inbox')).length) > beforeReadyInboxCount,
        'subscription readiness refreshes the account snapshot even when no changed event was received');
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    await page.evaluate(() => {
        noticeConnections[0].drop(); rows[0].status = 'cancelled'; window.dispatchEvent(new Event('online'));
    });
    await page.waitForFunction(() => noticeConnections.length === 2 && requests.filter(item => item.url.endsWith('/lesson/inbox')).length >= 2);
    await page.waitForFunction(() => !document.querySelector('.lesson-reminder')?.open);
    assert.equal(await page.evaluate(() => mediaStarts), 0);
    assert.equal(await page.evaluate(() => connections.length), 0);
    assert.equal(await page.evaluate(() => desktopReservations.length), 0);
    assert.deepEqual(errors, []);
});
