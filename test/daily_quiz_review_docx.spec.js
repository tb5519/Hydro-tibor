const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');
const AdmZip = require('adm-zip');

const source = buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/components/daily_quiz_review_docx.ts')],
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
function harness(extra = {}) {
    const dom = new JSDOM('', { url: 'https://school.test/manage/daily-quiz' });
    const mod = { exports: {} };
    vm.runInNewContext(source, {
        module: mod, exports: mod.exports, require, document: dom.window.document, window: dom.window,
        Blob, TextEncoder, URL, DOMException, Uint8Array, Uint32Array, DataView, Intl, Date, fetch, atob,
        AbortController, setTimeout, clearTimeout, ...extra,
    });
    return { document: dom.window.document, build: mod.exports.createDailyQuizReviewDocx, close: () => dom.window.close() };
}
const question = (overrides = {}) => ({
    id: 'q1', index: 1, title: '判断幂运算', domainName: 'Python训练', kind: 'judge', tags: ['运算符'],
    stem: 'Python 代码 `print(4 ** 2 == 2 * 2 ** 2)` 输出 True。',
    options: ['正确', '错误'], answers: ['B'], selected: ['A'], correct: false,
    points: 1, earnedPoints: 0, analysis: '**解析**：左侧 4**2=16，右侧 2**2=4，再乘2得8。',
    ...overrides,
});
const input = (questions = [question()]) => ({ studentName: '秦济舟', uid: 11, questions, exportedAt: new Date('2026-10-11T18:00:00Z') });
async function unpack(result) {
    const zip = new AdmZip(Buffer.from(await result.blob.arrayBuffer()));
    assert.equal(zip.test(), true, 'all stored members pass ZIP CRC checks');
    const xml = zip.readAsText('word/document.xml');
    const parsed = new JSDOM(xml, { contentType: 'text/xml' });
    const document = parsed.window.document;
    const text = [...document.getElementsByTagNameNS(W, 't')].map((item) => item.textContent).join('');
    return { zip, xml, document, text, close: () => parsed.window.close() };
}

test('creates a real editable DOCX with questions first, then answers on a new page and Beijing filename', async () => {
    const app = harness();
    try {
        const result = await app.build(input());
        assert.equal(result.filename, '秦济舟_11_待复习题_2026-10-12.docx');
        assert.equal(result.questionCount, 1);
        assert.equal(result.blob.type, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        const doc = await unpack(result);
        try {
            const paragraphs = [...doc.document.getElementsByTagNameNS(W, 'p')];
            const answerHeading = paragraphs.find((item) => item.textContent === '答案与解析');
            assert.equal(answerHeading.getElementsByTagNameNS(W, 'pageBreakBefore').length, 1);
            const beforeAnswer = doc.xml.slice(0, doc.xml.indexOf('<w:t xml:space="preserve">答案与解析'));
            assert.doesNotMatch(beforeAnswer, /正确答案：|上次作答：|左侧/);
            assert.match(doc.text, /正确答案：错误/);
            assert.match(doc.text, /上次作答：正确/);
            assert.match(doc.text, /作答：________________/);
            assert.match(doc.text, /print\(4 \*\* 2 == 2 \* 2 \*\* 2\)/);
            assert.match(doc.text, /左侧 4\*\*2=16，右侧 2\*\*2=4/);
            assert.match(doc.zip.readAsText('word/styles.xml'), /w:eastAsia="宋体"/);
            assert.match(doc.xml, /w:pgSz w:w="11906" w:h="16838"/);
            assert.equal(doc.zip.getEntries().some((entry) => /macro|vba|embeddings/i.test(entry.entryName)), false);
        } finally { doc.close(); }
    } finally { app.close(); }
});

test('converts math to native Word equations and retains code, rich text, lists and tables', async () => {
    const app = harness();
    try {
        const stem = '**加粗**与*斜体*，$x^{2}+a_{1}+\\frac{1}{2}+\\sqrt{9}$。\n\n```python\nfor i in range(3):\n    print(i ** 2)\n```\n\n- 第一项\n- 第二项\n\n| 名称 | 数值 |\n| --- | --- |\n| a | 2 |';
        const doc = await unpack(await app.build(input([question({ stem })])));
        try {
            for (const tag of ['oMath', 'sSup', 'sSub', 'f', 'rad']) assert.ok(doc.document.getElementsByTagNameNS(M, tag).length, tag);
            assert.doesNotMatch(doc.xml, /\$|\\frac|katex-html|application\/x-tex/);
            assert.match(doc.text, /print\(i \*\* 2\)/);
            assert.match(doc.text, /• 第一项/);
            assert.equal(doc.document.getElementsByTagNameNS(W, 'tbl').length, 1);
            assert.ok(doc.document.getElementsByTagNameNS(W, 'b').length);
            assert.ok(doc.document.getElementsByTagNameNS(W, 'i').length);
        } finally { doc.close(); }
    } finally { app.close(); }
});

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZ1sAAAAASUVORK5CYII=', 'base64');
test('embeds authorized local images once and embeds each usage with its own drawing ID', async () => {
    const app = harness();
    try {
        const requests = [];
        const download = async (url, init) => {
            requests.push({ url, init });
            return new Response(png, { headers: { 'content-type': 'image/png' } });
        };
        const doc = await unpack(await app.build(input([question({ stem: '![图](/file/diagram.png)\n\n![图](/file/diagram.png)' })]), { fetch: download }));
        try {
            assert.equal(requests.length, 1);
            assert.equal(requests[0].url, 'https://school.test/file/diagram.png');
            assert.equal(requests[0].init.credentials, 'same-origin');
            assert.equal(requests[0].init.redirect, 'error');
            assert.deepEqual(doc.zip.readFile('word/media/image1.png'), png);
            assert.match(doc.xml, /wp:docPr id="1"/);
            assert.match(doc.xml, /wp:docPr id="2"/);
            assert.doesNotMatch(doc.zip.readAsText('word/_rels/document.xml.rels'), /TargetMode="External"|https:\/\/school/);
        } finally { doc.close(); }
    } finally { app.close(); }
});

test('rejects external images without a request, auth HTML, fake image payloads and oversized images', async () => {
    const app = harness();
    try {
        let called = false;
        await assert.rejects(app.build(input([question({ stem: '![图](https://outside.test/a.png)' })]), { fetch: async () => { called = true; } }), /站外/);
        assert.equal(called, false);
        for (const [body, headers, expected] of [
            ['<html>登录</html>', { 'content-type': 'text/html' }, /身份验证/],
            ['<svg><script/></svg>', { 'content-type': 'image/png' }, /图片格式/],
            [png, { 'content-type': 'image/jpeg' }, /图片数据异常/],
            [png, { 'content-type': 'image/png', 'content-length': String(9 * 1024 * 1024) }, /图片过大/],
        ]) {
            await assert.rejects(app.build(input([question({ stem: '![图](/file/a)' })]), { fetch: async () => new Response(body, { headers }) }), expected);
        }
        await assert.rejects(app.build(input([question({ stem: '![图](/file/a)' })]), { fetch: async () => new Response('', { status: 403 }) }), /身份验证/);
    } finally { app.close(); }
});

test('safe image data is embedded; filenames and XML remain safe', async () => {
    const app = harness();
    try {
        const malicious = '</w:t><w:instrText>DDEAUTO</w:instrText> & "';
        const doc = await unpack(await app.build({ ...input([question({ title: malicious, stem: `![图](data:image/png;base64,${png.toString('base64')})` })]), studentName: '甲/乙:*?\u0001' }));
        try {
            assert.equal(doc.document.getElementsByTagNameNS(W, 'instrText').length, 0);
            assert.ok(doc.text.includes(malicious));
            assert.ok(doc.zip.getEntry('word/media/image1.png'));
        } finally { doc.close(); }
        const result = await app.build({ ...input(), studentName: '甲/乙:*?\u0001' });
        assert.equal(result.filename, '甲_乙_____11_待复习题_2026-10-12.docx');
    } finally { app.close(); }
});

test('empty exports and aborted downloads fail without producing a partial document', async () => {
    const app = harness();
    try {
        await assert.rejects(app.build(input([])), /没有待复习题目/);
        const controller = new AbortController();
        controller.abort();
        await assert.rejects(app.build(input(), { signal: controller.signal }), { name: 'AbortError' });
        await assert.rejects(app.build(input([question({ stem: '$\\frac{1}$' })])), /无法识别的公式/);
    } finally { app.close(); }
});

test('converts WebP and AVIF to embedded PNG and closes browser image resources', async () => {
    let decoded = 0;
    let closed = 0;
    const app = harness({ createImageBitmap: async (blob) => {
        assert.ok(['image/webp', 'image/avif'].includes(blob.type));
        decoded++;
        return { width: 1, height: 1, close: () => { closed++; } };
    } });
    const originalCreate = app.document.createElement.bind(app.document);
    app.document.createElement = (tag) => tag === 'canvas' ? {
        width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (callback) => callback(new Blob([png], { type: 'image/png' })),
    } : originalCreate(tag);
    const webp = Buffer.alloc(30);
    webp.write('RIFF', 0); webp.writeUInt32LE(22, 4); webp.write('WEBPVP8X', 8); webp.writeUInt32LE(10, 16);
    const avif = Buffer.alloc(44);
    avif.writeUInt32BE(24, 0); avif.write('ftypavif', 4); avif.write('avif', 16);
    avif.writeUInt32BE(20, 24); avif.write('ispe', 28); avif.writeUInt32BE(1, 36); avif.writeUInt32BE(1, 40);
    try {
        const doc = await unpack(await app.build(input([question({ stem: '![W](/a.webp)\n\n![A](/a.avif)' })]), {
            fetch: async (url) => new Response(url.endsWith('webp') ? webp : avif, { headers: { 'content-type': url.endsWith('webp') ? 'image/webp' : 'image/avif' } }),
        }));
        try {
            assert.equal(decoded, 2);
            assert.equal(closed, 2);
            assert.deepEqual(doc.zip.readFile('word/media/image1.png'), png);
            assert.deepEqual(doc.zip.readFile('word/media/image2.png'), png);
            assert.doesNotMatch(doc.zip.readAsText('[Content_Types].xml'), /image\/webp|image\/avif/);
        } finally { doc.close(); }
    } finally { app.close(); }
});

test('parses Markdown inside an inert template before validating image destinations', async () => {
    const app = harness();
    const tags = [];
    const originalCreate = app.document.createElement.bind(app.document);
    app.document.createElement = (tag) => { tags.push(tag); return originalCreate(tag); };
    try {
        await assert.rejects(app.build(input([question({ stem: '![图](https://outside.test/track.png)' })])), /站外/);
        assert.ok(tags.includes('template'));
        assert.equal(tags.includes('div'), false);
    } finally { app.close(); }
});

test('keeps question headings, prompts and options together while allowing a page break between questions', async () => {
    const app = harness();
    try {
        const doc = await unpack(await app.build(input([question(), question({ id: 'q2', title: '第二题' })])));
        try {
            const paragraphs = [...doc.document.getElementsByTagNameNS(W, 'p')];
            const answerIndex = paragraphs.findIndex((item) => item.textContent === '答案与解析');
            const firstQuestion = paragraphs.findIndex((item) => item.textContent === '1. 判断幂运算');
            const exercise = paragraphs.slice(firstQuestion, answerIndex);
            for (const item of exercise) {
                const props = item.getElementsByTagNameNS(W, 'pPr')[0];
                if (item.textContent.startsWith('作答：')) {
                    assert.equal(props.getElementsByTagNameNS(W, 'keepNext').length, 0);
                } else {
                    assert.equal(props.getElementsByTagNameNS(W, 'keepNext').length, 1);
                    assert.equal(props.getElementsByTagNameNS(W, 'keepLines').length, 1);
                }
            }
        } finally { doc.close(); }
    } finally { app.close(); }
});
