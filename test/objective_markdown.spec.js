const assert = require('node:assert/strict');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const code = buildSync({
    entryPoints: [path.resolve(__dirname, '../packages/ui-default/common/objective-markdown.ts')],
    bundle: true, write: false, packages: 'external', platform: 'node', format: 'cjs',
}).outputFiles[0].text;
const mod = { exports: {} };
vm.runInNewContext(code, { module: mod, exports: mod.exports, require });
const markdown = mod.exports.createObjectiveMarkdown();
const parse = (value) => JSDOM.fragment(markdown.render(value));

test('the reported judgment analysis keeps both power operators and the correct numerical explanation', () => {
    const analysis = '左侧 4**2=16，右侧先算 2**2=4，再乘2得8。16 与8不相等，所以实际输出 False。';
    const rendered = parse(`**答案：B（错误）。**\n\n${analysis}`);
    assert.equal(rendered.querySelectorAll('p')[1].textContent, analysis);
    assert.equal(rendered.querySelectorAll('strong').length, 1);
    assert.equal(rendered.querySelector('strong').textContent, '答案：B（错误）。');
});

test('numeric powers are preserved in repeated, chained, decimal and signed expressions', () => {
    for (const value of ['4**2=16；2**2=4', '2**3**2=512', '2**3**-2', '2**3**.5', '2.5**2=6.25；4**0.5=2', '2**-3=0.125；2**+3=8', '4**.5=2']) {
        const rendered = parse(value);
        assert.equal(rendered.textContent.trim(), value);
        assert.equal(rendered.querySelector('strong, em'), null);
    }
});

test('real bold, numeric bold, emphasis and bold italic retain normal Markdown semantics', () => {
    const rendered = parse('**答案**：**2**。**4 个选项**；*斜体*；***重点***。\n\n- **第一项**\n- 第二项');
    assert.deepEqual([...rendered.querySelectorAll('strong')].map((node) => node.textContent), ['答案', '2', '4 个选项', '重点', '第一项']);
    assert.equal(rendered.querySelector('em strong').textContent, '重点');
    assert.equal(rendered.querySelectorAll('li').length, 2);
    for (const value of ['**2**3', '**2.5**3', '**-2**3']) {
        const adjacent = parse(value);
        assert.equal(adjacent.querySelector('strong').textContent, value.slice(2, -3));
        assert.equal(adjacent.textContent.trim(), value.replaceAll('**', ''));
    }
    for (const value of ['4**2**', '4**2.5**']) {
        const adjacent = parse(value);
        assert.equal(adjacent.querySelector('strong').textContent, value.slice(3, -2));
        assert.equal(adjacent.textContent.trim(), value.replaceAll('**', ''));
    }
});

test('code spans and fences preserve the exact Python expression and escaped operators stay literal', () => {
    const expression = 'print(4 ** 2 == 2 * 2 ** 2)';
    const rendered = parse(`Python 代码 \`${expression}\`。\n\n\`\`\`python\n${expression}\n4**2\n\`\`\`\n\n4\\*\\*2；2\\*\\*2`);
    assert.equal(rendered.querySelector('p code').textContent, expression);
    assert.equal(rendered.querySelector('pre code').textContent, `${expression}\n4**2\n`);
    assert.equal(rendered.querySelector('pre strong, code strong'), null);
    assert.match(rendered.textContent, /4\*\*2；2\*\*2/);
});

test('math is still rendered by KaTeX and ordinary variable emphasis is not reinterpreted', () => {
    const rendered = parse('$4^{2}=16$，$2^{2}=4$；a**b**c。');
    assert.deepEqual([...rendered.querySelectorAll('annotation[encoding="application/x-tex"]')].map((node) => node.textContent), ['4^{2}=16', '2^{2}=4']);
    assert.equal(rendered.querySelector('.katex-error'), null);
    assert.equal(rendered.querySelector('strong').textContent, 'b');
});

test('raw HTML and unsafe links stay disabled while ordinary links preserve destinations', () => {
    const rendered = parse('<script>alert(1)</script><img src=x onerror=alert(1)> [坏链接](javascript:alert(1)) [数字路径](https://example.test/4**2)\n\n4**2');
    assert.equal(rendered.querySelector('script, img, a[href^="javascript:"]'), null);
    assert.match(rendered.textContent, /<script>alert\(1\)<\/script>/);
    assert.equal(rendered.querySelector('a').getAttribute('href'), 'https://example.test/4**2');
    assert.match(rendered.textContent, /4\*\*2/);
});
