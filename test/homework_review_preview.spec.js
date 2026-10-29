const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const nunjucks = require('nunjucks');
const { JSDOM } = require('jsdom');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'packages/ui-default/templates/problem_detail.html'), 'utf8');
const previewTemplate = template.slice(template.indexOf('{% if homeworkReview and isMistakeSupported %}'))
    .split('{% endif %}\n{% if badgeAcFirstEligible %}')[0] + '{% endif %}';
const renderPreview = (context) => nunjucks.renderString(previewTemplate, context);

describe('homework code preview', () => {
    it('renders authorized review code as text, preserving leading newlines and markup', () => {
        const code = '\n<script>window.compromised = true</script>\nif (a < b) &x';
        const html = renderPreview({
            homeworkReview: { name: '<teacher>', rid: 'record', code, returnUrl: '/homework/1' },
            isMistakeSupported: true,
        });
        const dom = new JSDOM(html);
        try {
            assert.equal(dom.window.document.querySelector('pre code').textContent, code);
            assert.equal(dom.window.document.querySelector('strong').textContent, '<teacher>的代码（只读）');
            assert.equal(dom.window.document.querySelector('pre script'), null);
        } finally { dom.window.close(); }
    });

    it('is limited to programming reviews and shows an empty-submission message', () => {
        const review = { name: '学生', rid: '', code: '', returnUrl: '/homework/1' };
        assert.match(renderPreview({ homeworkReview: review, isMistakeSupported: true }), /该学员尚未提交这道题/);
        assert.doesNotMatch(renderPreview({ homeworkReview: review, isMistakeSupported: false }), /homework-review-preview/);
        assert.doesNotMatch(renderPreview({ isMistakeSupported: true }), /homework-review-preview/);
    });

    it('keeps the preview until both the editor is ready and the work area is visible', () => {
        const dom = new JSDOM('<div id="homework-review-preview"><span class="homework-review-preview__status"></span></div><div class="scratchpad-container"><div id="scratchpad" style="opacity:0"><div class="ScratchpadMonacoEditor"></div></div></div>');
        try {
            const $ = require('jquery')(dom.window);
            const source = fs.readFileSync(path.join(root, 'packages/ui-default/pages/problem_detail.page.tsx'), 'utf8');
            const start = source.indexOf('  function hideReviewPreviewWhenReady()');
            const end = source.indexOf('\n  async function enterScratchpadMode()', start);
            assert.ok(start >= 0 && end > start);
            vm.runInNewContext(source.slice(start, end), { $, console });
            $('.ScratchpadMonacoEditor').trigger('homework-review-editor-ready');
            assert.equal($('#homework-review-preview').length, 1);
            $('.ScratchpadMonacoEditor').trigger('homework-review-editor-failed');
            assert.match($('.homework-review-preview__status').text(), /加载失败/);
            $('.ScratchpadMonacoEditor').attr('data-editor-ready', 'true');
            $('.ScratchpadMonacoEditor').trigger('homework-review-editor-ready');
            assert.equal($('#homework-review-preview').length, 1);
            $('#scratchpad').css('opacity', 1);
            $('.ScratchpadMonacoEditor').trigger('homework-review-editor-ready');
            assert.equal($('#homework-review-preview').length, 0);
        } finally { dom.window.close(); }
    });

    it('signals failure without discarding the preview when Monaco cannot load', async () => {
        const dom = new JSDOM('<div class="scratchpad-container"><div class="ScratchpadMonacoEditor"></div></div>');
        try {
            const source = fs.readFileSync(path.join(root, 'packages/ui-default/components/scratchpad/ScratchpadEditorContainer.tsx'), 'utf8');
            const mod = { exports: {} };
            vm.runInNewContext(transformSync(source, { loader: 'tsx', format: 'cjs' }).code, {
                module: mod, exports: mod.exports, window: dom.window, Event: dom.window.Event,
                UiContext: { homeworkReview: { uid: 20, rid: 'record' }, pdoc: { pid: 'P1' } },
                console: { error() {} },
                require(id) {
                    if (id === 'react-redux') return { connect: () => (component) => component };
                    if (id === 'vj/components/monaco/loader') return { load: () => Promise.reject(new Error('offline')) };
                    if (id === 'vj/context') return { ctx: {} };
                    if (id === './themes') return {};
                    return require(id);
                },
            });
            const editor = new mod.exports.default({ value: 'student code', language: 'python' });
            editor.containerElement = dom.window.document.querySelector('.ScratchpadMonacoEditor');
            let failed = 0;
            editor.containerElement.parentElement.addEventListener('homework-review-editor-failed', () => { failed += 1; });
            await editor.componentDidMount();
            assert.equal(failed, 1);
            assert.equal(editor.containerElement.hasAttribute('data-editor-ready'), false);
        } finally { dom.window.close(); }
    });
});
