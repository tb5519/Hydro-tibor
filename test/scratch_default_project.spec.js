const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { describe, it } = require('node:test');
const { transformSync } = require('esbuild');

const root = path.resolve(__dirname, '..');
const sourceDir = path.join(root, 'build/scratch/default-project');
const archive = path.join(root, 'packages/ui-default/public/scratch-editor/source.tar.gz');
const classicCat = require('../build/scratch/classic-library.json').catalogs.sprites.find((sprite) => sprite.name === 'Cat');
const backdropName = 'cd21514d0531fdffb22204e0ec5ed84a.svg';
const json = (value) => JSON.parse(JSON.stringify(value));
const archived = (name) => execFileSync('tar', ['-xOf', archive, name], {
    stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, LC_ALL: 'C' },
});

function evaluateModule(source, dependencies, filename) {
    const module = { exports: {} };
    vm.runInNewContext(transformSync(source, { loader: 'js', format: 'cjs' }).code, {
        module, exports: module.exports, Uint8Array, ArrayBuffer, TextEncoder,
        require(name) {
            assert(Object.hasOwn(dependencies, name), `Unexpected default-project dependency: ${name}`);
            return dependencies[name];
        },
    }, { filename });
    return module.exports.default;
}

const intl = { defineMessages: (messages) => messages };
const sharedMessages = evaluateModule(archived('src/lib/shared-messages.js').toString(), { 'react-intl': intl }, 'shared-messages.js');
const projectData = evaluateModule(archived('src/lib/default-project/project-data.js').toString(), {
    'react-intl': intl, '../shared-messages': sharedMessages,
}, 'project-data.js');

function loadDefaultProject(source = fs.readFileSync(path.join(sourceDir, 'index.js'), 'utf8'), readAsset = (name) => (
    name === backdropName ? archived(`src/lib/default-project/${name}`) : fs.readFileSync(path.join(sourceDir, name))
)) {
    const cat = JSON.parse(fs.readFileSync(path.join(sourceDir, 'cat.json'), 'utf8'));
    const dependencies = { './project-data': projectData, './cat.json': cat, '../tw-text-encoder': { TextEncoder } };
    for (const name of [backdropName, ...classicCat.costumes.map((costume) => costume.md5ext)]) {
        dependencies[`!raw-loader!./${name}`] = readAsset(name).toString();
    }
    for (const sound of classicCat.sounds) {
        const bytes = readAsset(sound.md5ext);
        dependencies[`!arraybuffer-loader!./${sound.md5ext}`] = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    }
    return evaluateModule(source, dependencies, 'default-project/index.js');
}

const translate = (language) => (message, values = {}) => {
    const names = {
        'zh-cn': { sprite: '角色{index}', backdrop: '背景{index}', variable: '我的变量' },
        en: { sprite: 'Sprite{index}', backdrop: 'backdrop{index}', variable: 'my variable' },
    }[language];
    const name = message.id.split('.').at(-1);
    return (names[name] || message.defaultMessage).replace('{index}', String(values.index || ''));
};

function unpack(defaultProject, translator) {
    const assets = defaultProject(translator);
    const project = assets.find((asset) => asset.id === 0);
    assert.equal(project.assetType, 'Project');
    assert.equal(project.dataFormat, 'JSON');
    return { assets, project: JSON.parse(project.data) };
}

describe('classic Scratch cat default project', () => {
    it('starts with one classic cat, both original costumes and the Meow sound', () => {
        const { project } = unpack(loadDefaultProject(), translate('zh-cn'));
        const sprites = project.targets.filter((target) => !target.isStage);
        assert.equal(sprites.length, 1);
        assert.equal(sprites[0].name, '角色1');
        assert.deepEqual(sprites[0].costumes, classicCat.costumes);
        assert.deepEqual(sprites[0].sounds, classicCat.sounds);
        assert.equal(sprites[0].currentCostume, 0);
        assert.equal(JSON.stringify(project).includes('927d672925e7b99f7813735c484c6922'), false, 'The former Dango Cat must not remain the default');
    });

    it('preserves the blank stage, variable, empty scripts and original sprite geometry', () => {
        const translator = translate('zh-cn');
        const original = json(projectData(translator));
        const { project } = unpack(loadDefaultProject(), translator);
        const expected = json(original);
        expected.targets[1].costumes = classicCat.costumes;
        expected.targets[1].sounds = classicCat.sounds;
        assert.deepEqual(project, expected, 'Only the default sprite artwork and sound may change');
        assert.equal(project.targets[1].x, 0);
        assert.equal(project.targets[1].y, 0);
        assert.equal(project.targets[1].size, 100);
        assert.deepEqual(project.targets[1].blocks, {});
    });

    it('retains localized default sprite, backdrop and variable names', () => {
        const defaults = loadDefaultProject();
        for (const language of ['zh-cn', 'en']) {
            const translator = translate(language);
            const original = json(projectData(translator));
            const { project } = unpack(defaults, translator);
            assert.equal(project.targets[1].name, original.targets[1].name);
            assert.equal(project.targets[0].costumes[0].name, original.targets[0].costumes[0].name);
            assert.deepEqual(project.targets[0].variables, original.targets[0].variables);
        }
    });

    it('embeds every referenced asset with its canonical MD5, data type and format', () => {
        const { assets, project } = unpack(loadDefaultProject(), translate('zh-cn'));
        assert.equal(assets.length, 5, 'Project, backdrop, two costumes and one sound are self-contained');
        const ids = assets.map((asset) => asset.id);
        assert.equal(new Set(ids).size, ids.length);
        const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
        for (const target of project.targets) {
            for (const [items, type, format] of [[target.costumes, 'ImageVector', 'SVG'], [target.sounds, 'Sound', 'WAV']]) {
                for (const item of items) {
                    const asset = assetsById.get(item.assetId);
                    assert(asset, `Missing embedded default asset: ${item.md5ext}`);
                    assert.equal(asset.assetType, type);
                    assert.equal(asset.dataFormat, format);
                    const bytes = Buffer.from(asset.data);
                    assert(bytes.length > 0);
                    assert.equal(createHash('md5').update(bytes).digest('hex'), item.assetId, item.md5ext);
                }
            }
        }
    });

    it('creates independent projects without polluting the classic metadata or later defaults', () => {
        const defaults = loadDefaultProject();
        const first = unpack(defaults, translate('zh-cn')).project;
        first.targets[1].name = 'Changed by an existing work';
        first.targets[1].costumes[0].rotationCenterX = 999;
        first.targets[1].sounds.length = 0;
        first.targets[0].variables.extra = ['custom', 42];
        const next = unpack(defaults, translate('zh-cn')).project;
        assert.equal(next.targets[1].name, '角色1');
        assert.deepEqual(next.targets[1].costumes, classicCat.costumes);
        assert.deepEqual(next.targets[1].sounds, classicCat.sounds);
        assert.deepEqual(next.targets[0].variables, json(projectData(translate('zh-cn'))).targets[0].variables);
        assert.deepEqual(JSON.parse(fs.readFileSync(path.join(sourceDir, 'cat.json'), 'utf8')), classicCat);
    });

    it('ships the same self-contained cat template and binary assets in the prepared source archive', {
        skip: process.env.SCRATCH_VERIFY_PREPARED !== '1',
    }, () => {
        const source = archived('src/lib/default-project/index.js').toString();
        assert.equal(source, fs.readFileSync(path.join(sourceDir, 'index.js'), 'utf8'));
        assert.deepEqual(JSON.parse(archived('src/lib/default-project/cat.json').toString()), classicCat);
        const defaults = loadDefaultProject(source, (name) => archived(`src/lib/default-project/${name}`));
        const { project } = unpack(defaults, translate('zh-cn'));
        assert.deepEqual(project.targets[1].costumes, classicCat.costumes);
        assert.deepEqual(project.targets[1].sounds, classicCat.sounds);
        for (const asset of [...classicCat.costumes, ...classicCat.sounds]) {
            assert.deepEqual(archived(`src/lib/default-project/${asset.md5ext}`), fs.readFileSync(path.join(sourceDir, asset.md5ext)));
        }
    });
});
