const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { build } = require('esbuild');
const { fixture, studentDetail, render } = require('./fixtures/training_dashboard');

let browser;
before(async () => {
    let playwright;
    for (const location of ['playwright', path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')]) {
        try { playwright = require(location); break; } catch { /* Try the bundled runtime. */ }
    }
    const executablePath = [process.env.HERO_CHROMIUM_PATH, playwright?.chromium.executablePath(),
        path.join(os.homedir(), 'Library/Caches/ms-playwright/chromium-1140/chrome-mac/Chromium.app/Contents/MacOS/Chromium')]
        .find((candidate) => candidate && fs.existsSync(candidate));
    assert.ok(executablePath, 'Chromium is required to verify dashboard navigation');
    browser = await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => browser?.close());

const startUrl = 'https://school.test/d/python/manage/training-dashboard';
const names = { 12: '方全然', 13: '秦济舟', 10: '周烁' };
async function visit(t, intercept = () => {}, { shell = false, javaScriptEnabled = true } = {}) {
    const page = await browser.newPage({ javaScriptEnabled });
    if (shell) {
        const { outputFiles } = await build({ entryPoints: [path.join(__dirname, '../packages/ui-default/utils/persistent-navigation.ts')],
            bundle: true, write: false, format: 'iife', globalName: 'Navigation' });
        await page.addInitScript({ content: outputFiles[0].text + `
            document.addEventListener('DOMContentLoaded', () => {
                document.documentElement.dataset.app = 'Hydro';
                window.UserContext = { _id: 1 };
                if (!Navigation.attachPlatformPage(window)) Navigation.installPlatformShell(window);
            });
        ` });
        await page.route('**/d/python/p/P4097', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>数字替换</h1>' }));
    }
    page.setDefaultTimeout(5000);
    t.after(() => page.close());
    const visits = [];
    await page.route('**/manage/training-dashboard*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        const fragment = request.headers()['x-training-dashboard'] === 'fragment';
        visits.push({ url, fragment, method: request.method(), body: request.postData() });
        if (await intercept(route, url)) return;
        const params = Object.fromEntries(url.searchParams);
        const uid = Number(params.student || (params.page === '2' ? 10 : 12));
        const data = fixture({ detail: studentDetail({ uid, name: names[uid] }), period: params.period || '7d',
            q: params.q || '', currentQuery: params });
        if (uid === 13) {
            data.detail.lifetimeEffort = { ...data.detail.lifetimeEffort, averageWeeklyTrainingLabel: '0 分钟',
                trainingLabel: '0 分钟', totalLabel: '4 小时' };
            for (const points of Object.values(data.detail.trends)) {
                for (const point of points) {
                    point.trainingSeconds = 0;
                    point.trainingLabel = '0 分钟';
                    point.value = point.classSeconds;
                    point.timeLabel = point.classLabel;
                    point.shortLabel = point.classLabel;
                }
            }
        }
        if (request.method() === 'POST') data.integration.token = 'temporary-test-value';
        await route.fulfill({ contentType: 'text/html', body: render(data, fragment) });
    });
    await page.goto(startUrl);
    return { page, visits, student: page.locator('[data-heading-student]') };
}
test('student, period, history, search, classrooms, pagination and token forms keep the same document', async (t) => {
    const { page, visits, student } = await visit(t);
    await page.locator('.effort-trend__switch-month').click();
    const cumulative = page.locator('.tdash-lifetime-total .tdash-lifetime-value');
    assert.equal(await cumulative.innerText(), '3 小时');
    const requestsBeforeToggle = visits.length;
    await page.locator('[data-include-class-time]').uncheck();
    assert.equal(await cumulative.innerText(), '2 小时');
    assert.equal(visits.length, requestsBeforeToggle);
    const monthly = page.locator('[data-effort-series=months]');
    const training = monthly.locator('[data-effort-line=training]');
    const beforeTraining = await training.getAttribute('points');
    await page.locator('[data-training-student-link]').nth(1).click();
    await page.waitForURL(/student=13/);
    assert.ok(await monthly.isVisible());
    assert.equal(await cumulative.innerText(), '0 分钟');
    assert.equal(await page.locator('[data-average-weekly-training]').textContent(), '0 分钟');
    assert.equal(await page.locator('[data-include-class-time]').isChecked(), false);
    await page.locator('[data-include-class-time]').check();
    assert.equal(await cumulative.innerText(), '4 小时');
    assert.notEqual(await training.getAttribute('points'), beforeTraining);
    assert.notEqual(await training.getAttribute('points'), await monthly.locator('[data-effort-line=total]').getAttribute('points'));
    assert.equal(await student.textContent(), names[13]);
    assert.ok(await page.locator('.effort-trend__radio--months').isChecked());
    await page.locator('[data-problem-period=thisWeek]').click();
    await page.waitForURL(/period=thisWeek/);
    assert.equal(await cumulative.innerText(), '4 小时');
    assert.equal(await page.locator('[data-average-weekly-training]').textContent(), '0 分钟');
    await page.goBack();
    await page.waitForSelector('[data-problem-period="7d"][aria-current]');
    await page.goForward();
    await page.waitForSelector('[data-problem-period=thisWeek][aria-current]');
    await page.locator('.tdash-pagination a').click();
    await page.waitForURL(/page=2/);
    assert.equal(await student.textContent(), names[10]);
    await page.locator('.tdash-search [name=q]').fill('周');
    await page.locator('.tdash-search [name=q]').press('Enter');
    await page.waitForURL((url) => url.searchParams.get('q') === '周');
    await page.locator('[data-training-domains] summary').click();
    await page.locator('[data-training-domain-all]').check();
    await page.locator('#training-dashboard-filters button').click();
    await page.waitForURL(/domains=all/);
    await page.locator('[data-class-integration] > summary').click();
    await page.locator('[data-class-token-form] button').click();
    await page.waitForSelector('#training-class-token');
    assert.equal(await page.locator('#training-class-token').inputValue(), 'temporary-test-value');
    assert.ok(!page.url().includes('temporary-test-value'));
    assert.equal(visits.at(-1).method, 'POST');
    assert.equal(new URLSearchParams(visits.at(-1).body).get('operation'), 'issueClassToken');
    assert.equal(visits.filter((request) => !request.fragment).length, 1);
});

test('late responses cannot replace the latest learner and failed navigation can be retried in place', async (t) => {
    let holdFirst;
    const delayed = new Promise((resolve) => { holdFirst = resolve; });
    let dropWeek = true;
    const { page, visits, student } = await visit(t, async (route, url) => {
        if (url.searchParams.get('student') === '13') await delayed;
        if (url.searchParams.get('period') === 'thisWeek' && dropWeek) {
            dropWeek = false; await route.abort(); return true;
        }
        return false;
    });
    const started = page.waitForRequest((request) => new URL(request.url()).searchParams.get('student') === '13');
    await page.locator('[data-training-student-link]').nth(1).click();
    await started;
    await page.locator('[data-training-student-link]').nth(2).click();
    await page.waitForURL(/student=10/);
    holdFirst();
    await page.locator('[data-problem-period=thisWeek]').click();
    await page.waitForSelector('[data-retry-dashboard]:visible');
    assert.equal(await student.textContent(), names[10]);
    assert.ok(!page.url().includes('period=thisWeek'));
    await page.locator('[data-retry-dashboard]').click();
    await page.waitForURL(/period=thisWeek/);
    assert.equal(await student.textContent(), names[10]);
    assert.equal(visits.filter((request) => !request.fragment).length, 1);
});

test('the platform keeps its host while dashboard history and problem navigation update its address', async (t) => {
    const { page } = await visit(t, undefined, { shell: true });
    const frame = page.frameLocator('[data-platform-page]');
    await frame.locator('[data-heading-student]').waitFor();
    await page.evaluate(() => { window.shellMarker = 'initial host'; });
    await frame.locator('[data-training-student-link]').nth(1).click();
    await page.waitForURL(/student=13/);
    assert.equal(await frame.locator('[data-heading-student]').textContent(), names[13]);
    await frame.locator('[data-problem-period=thisWeek]').click();
    await page.waitForURL(/period=thisWeek/);
    await page.goBack();
    await frame.locator('[data-problem-period="7d"][aria-current]').waitFor();
    await page.goForward();
    await frame.locator('[data-problem-period="thisWeek"][aria-current]').waitFor();
    await frame.locator('[data-training-problem] a').first().click();
    await page.waitForURL('**/d/python/p/P4097');
    assert.equal(await frame.locator('h1').textContent(), '数字替换');
    await page.goBack();
    await frame.locator('[data-problem-period="thisWeek"][aria-current]').waitFor();
    assert.equal(await frame.locator('[data-heading-student]').textContent(), names[13]);
    assert.equal(await page.evaluate(() => window.shellMarker), 'initial host');
});

test('a browser with JavaScript disabled can still follow dashboard links and submit searches', async (t) => {
    const { page, student, visits } = await visit(t, undefined, { javaScriptEnabled: false });
    await page.locator('[data-training-student-link]').nth(1).click();
    assert.equal(await student.textContent(), names[13]);
    await page.locator('[data-problem-period=thisWeek]').click();
    await page.locator('[data-problem-period=thisWeek][aria-current]').waitFor();
    await page.locator('.tdash-search [name=q]').fill('方');
    await page.locator('.tdash-search button').click();
    await page.waitForURL((url) => url.searchParams.get('q') === '方');
    assert.ok(visits.every((visit) => !visit.fragment));
});

test('weekly and monthly total and training point labels remain distinct for overlapping and close values on a phone', async (t) => {
    const page = await browser.newPage({ viewport: { width: 320, height: 650 }, javaScriptEnabled: false });
    t.after(() => page.close());
    const data = fixture();
    const readings = [
        [0, 0, '0分', '0 分钟', '0 分钟'],
        [1680, 1680, '28分', '28 分钟', '0 分钟'],
        [1680, 0, '28分', '0 分钟', '28 分钟'],
        [3600, 3599, '1时', '59 分钟', '不足 1 分钟'],
        [111540, 107940, '约30时59分', '约 29 小时 59 分钟', '1 小时'],
    ];
    for (const series of ['weeks', 'months']) data.detail.trends[series] = readings.map(([total, training, shortLabel, trainingLabel, classLabel], i) => ({
        ...data.detail.trends[series][0], value: total, classSeconds: total - training, trainingSeconds: training,
        timeLabel: shortLabel, shortLabel, trainingLabel, classLabel, label: series === 'weeks' ? '11/' + (i + 1) : (i + 1) + '月',
    }));
    await page.setContent(render(data));
    for (const series of ['weeks', 'months']) {
        await page.locator(series === 'weeks' ? '.effort-trend__switch-week' : '.effort-trend__switch-month').click();
        const points = page.locator('[data-effort-series=' + series + '] [data-effort-point]');
        assert.equal(await points.count(), readings.length);
        for (let i = 0; i < readings.length; i++) {
            const point = points.nth(i);
            await point.scrollIntoViewIfNeeded();
            assert.equal(await point.locator('.effort-trend__value').textContent(), readings[i][2]);
            assert.equal(await point.locator('.effort-trend__training-value').textContent(), readings[i][3]);
            const layout = await point.evaluate((node) => {
                const rect = (selector) => node.querySelector(selector).getBoundingClientRect();
                const total = rect('.effort-trend__value');
                const training = rect('.effort-trend__training-value');
                const label = rect('.effort-trend__period');
                const circle = rect('.effort-trend__dot');
                const diamond = rect('.effort-trend__training-dot');
                const column = node.getBoundingClientRect();
                return { labelsSeparate: total.bottom < circle.top && training.top > diamond.bottom,
                    labelsInColumn: [training, total].every((r) => r.left >= column.left && r.right <= column.right &&
                        r.left >= 0 && r.right <= innerWidth && r.top >= column.top && r.bottom < label.top),
                    totalY: (circle.top + circle.bottom) / 2 - column.top, trainingY: (diamond.top + diamond.bottom) / 2 - column.top,
                    markersDistinct: diamond.width < circle.width - 3 };
            });
            assert.ok(layout.labelsSeparate && layout.labelsInColumn && layout.markersDistinct, series + ' ' + i);
            const maxSeconds = 111540;
            assert.ok(Math.abs(layout.totalY - (126 - 92 * readings[i][0] / maxSeconds)) < 0.1);
            assert.ok(Math.abs(layout.trainingY - (126 - 92 * readings[i][1] / maxSeconds)) < 0.1);
        }
    }
});
