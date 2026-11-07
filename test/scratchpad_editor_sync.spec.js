const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const esbuild = require('esbuild');

const source = esbuild.transformSync(fs.readFileSync(path.resolve(__dirname,
    '../packages/ui-default/components/scratchpad/ScratchpadEditorContainer.tsx'), 'utf8'), {
    loader: 'tsx', format: 'cjs',
}).code;

function fixture() {
    const loads = [];
    const writes = [];
    const replacements = [];
    const settings = [];
    const createModel = (value, language) => ({
        value, language, disposed: false,
        getValue() { return this.value; },
        getFullModelRange() { return {}; },
        pushEditOperations(_selections, edits) {
            writes.push(edits[0].text);
            this.value = edits[0].text;
        },
        dispose() { this.disposed = true; },
    });
    const monaco = {
        Uri: { parse: (value) => value },
        editor: { EndOfLinePreference: { LF: 1 }, createModel },
    };
    const mod = { exports: {} };
    vm.runInNewContext(source, {
        module: mod, exports: mod.exports, UiContext: { pdoc: { pid: 'P1000' } },
        require(id) {
                if (id === '../ide/fontSize') return {}; // Standalone IDE preferences do not alter the problem editor.
            if (id === 'react-redux') return { connect: () => (component) => component };
            if (id === './themes') return { currentScratchpadTheme: () => ({}), scratchpadMonacoThemeName: () => 'cloud' };
            if (id === 'vj/context') return { ctx: {} };
            if (id === 'vj/components/monaco/loader') return {
                load: () => new Promise((resolve) => loads.push(() => resolve({ monaco }))),
            };
            return require(id);
        },
    });
    const initialProps = { value: 'original draft', language: 'python' };
    const component = new mod.exports.default(initialProps);
    component.model = createModel(initialProps.value, initialProps.language);
    component.modelLanguage = initialProps.language;
    component.editor = {
        pushUndoStop() {},
        setModel(model) { replacements.push(model); },
        updateOptions(options) { settings.push(options); },
    };
    return { component, loads, writes, replacements, settings, initialProps };
}

test('a delayed older render cannot broadcast stale whole-document text over the current draft', async () => {
    const { component, loads, writes, initialProps } = fixture();
    component.props = { value: 'earlier requested draft', language: 'python' };
    const older = component.componentDidUpdate(initialProps);
    const previousProps = component.props;
    component.props = { value: 'learner code\n# teacher annotation', language: 'python' };
    const latest = component.componentDidUpdate(previousProps);

    loads[0]();
    await older;
    assert.deepEqual(writes, [], 'the older continuation must not publish any destructive document replacement');
    assert.equal(component.model.getValue(), 'original draft');

    loads[1]();
    await latest;
    assert.deepEqual(writes, ['learner code\n# teacher annotation']);
    assert.equal(component.model.getValue(), component.props.value);
});

test('a superseded language render is applied once by the latest render, preserving the latest code', async () => {
    const { component, loads, replacements, settings, initialProps } = fixture();
    component.props = { value: 'int main() {}', language: 'cpp' };
    const languageChange = component.componentDidUpdate(initialProps);
    const previousProps = component.props;
    component.props = { ...component.props, value: 'int main() { /* teacher */ }', settings: { fontSize: 20 } };
    const settingsChange = component.componentDidUpdate(previousProps);

    loads[0]();
    await languageChange;
    assert.equal(replacements.length, 0);
    loads[1]();
    await settingsChange;
    assert.equal(replacements.length, 1, 'compare the applied language, not only the previous render props');
    assert.equal(component.model.language, 'cpp');
    assert.equal(component.model.getValue(), 'int main() { /* teacher */ }');
    assert.equal(settings.at(-1).fontSize, 20);
});

test('late obsolete language callbacks cannot dispose a newly installed collaborative model', async () => {
    const { component, loads, replacements, initialProps } = fixture();
    component.props = { value: 'cpp draft', language: 'cpp' };
    const older = component.componentDidUpdate(initialProps);
    const previousProps = component.props;
    component.props = { value: 'new python draft', language: 'python' };
    const latest = component.componentDidUpdate(previousProps);

    loads[1]();
    await latest;
    const currentModel = component.model;
    loads[0]();
    await older;
    assert.equal(component.model, currentModel);
    assert.equal(currentModel.disposed, false);
    assert.equal(currentModel.language, 'python');
    assert.equal(currentModel.getValue(), 'new python draft');
    assert.equal(replacements.length, 0, 'the original Python model can stay in place');
});
