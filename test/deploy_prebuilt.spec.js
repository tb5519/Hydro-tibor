const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const vm = require('node:vm');
const { describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'docker/deploy-prebuilt.sh');
const script = fs.readFileSync(scriptPath, 'utf8');
const expectedCommit = 'a'.repeat(40);

function packageGuard(before, after, runtime = {}, guard = 'VERIFY_HYDRO_PACKAGE') {
    const source = script.match(new RegExp(`<<'${guard}'\\n([\\s\\S]*?)\\n${guard}`))[1];
    const calls = [];
    const appRequire = (name) => {
        calls.push(name);
        if (name === 'pngjs/package.json') return { version: runtime.version === undefined ? '5.0.0' : runtime.version };
        if (name === 'semver') return require('semver');
        if (name === 'pngjs') return { PNG: runtime.PNG || { sync: { read() {}, write() {} } } };
        throw new Error(`Unexpected runtime module ${name}`);
    };
    appRequire.resolve = (name) => {
        assert.equal(name, 'pngjs');
        calls.push('resolve:pngjs');
        if (runtime.missing) throw new Error('MODULE_NOT_FOUND');
        return '/workspace/node_modules/pngjs/lib/png.js';
    };
    const run = () => vm.runInNewContext(`globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));\n${source}`, {
        process: { argv: ['node', '-', expectedCommit] },
        console: { log() {} },
        require: (name) => {
            if (name === 'node:child_process') return {
                execFileSync(command, args, options) {
                    assert.equal(command, 'git');
                    assert.equal(options.cwd, '/workspace');
                    assert.equal(args[0], 'show');
                    const file = guard === 'VERIFY_PACKAGE' ? 'package.json' : 'packages/hydrooj/package.json';
                    assert.ok(args[1] === `HEAD:${file}` || args[1] === `${expectedCommit}:${file}`);
                    return JSON.stringify(args[1].startsWith('HEAD:') ? before : after);
                },
            };
            if (name === 'node:module') return {
                createRequire(filename) {
                    assert.equal(filename, '/workspace/packages/hydrooj/package.json');
                    return appRequire;
                },
            };
            return require(name);
        },
    });
    return { run, calls };
}

function faviconGuard(options = {}) {
    const source = script.match(/<<'VERIFY_FAVICON_TOOL'\n([\s\S]*?)\nVERIFY_FAVICON_TOOL/)[1];
    const files = ['build/favicon/package.json', 'build/favicon/pnpm-lock.yaml'];
    const toolPackage = options.toolPackage || JSON.parse(fs.readFileSync(path.join(root, files[0]), 'utf8'));
    const rootPackage = options.rootPackage || { workspaces: ['packages/*', 'framework/*', 'plugins/*', 'modules/*'], scripts: { start: 'node app' } };
    const lock = options.lock === undefined ? fs.readFileSync(path.join(root, files[1])) : Buffer.from(options.lock);
    const changes = options.changes === undefined ? files.map((file) => `A\t${file}`).join('\n') : options.changes;
    return () => vm.runInNewContext(source, {
        process: { argv: ['node', '-', expectedCommit] }, console: { log() {} },
        require: (name) => {
            if (name !== 'node:child_process') return require(name);
            return { execFileSync(command, args, opts) {
                assert.equal(command, 'git');
                assert.equal(opts.cwd, '/workspace');
                if (args[0] === 'diff') return Buffer.from(changes);
                assert.equal(args[0], 'show');
                if (args[1] === `${expectedCommit}:package.json`) return JSON.stringify(rootPackage);
                if (args[1] === `${expectedCommit}:${files[0]}`) return JSON.stringify(toolPackage);
                assert.equal(args[1], `${expectedCommit}:${files[1]}`);
                return lock;
            } };
        },
    });
}

function scratchAssetFixture(t, modify = () => {}) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'scratch-deploy-assets-'));
    t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
    const editorRoot = 'packages/ui-default/public/scratch-editor';
    const write = (relative, body) => {
        fs.mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true });
        fs.writeFileSync(path.join(directory, relative), body);
    };
    const git = (...args) => {
        const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
    };
    const digest = (data) => crypto.createHash('sha256').update(data).digest('hex');
    const outputs = { 'editor.html': '<!doctype html>Editor', 'source.tar.gz': 'source archive fixture', 'UPSTREAM-LICENSE': 'license fixture', 'js/editor.abcd.js': 'console.log("editor");' };
    const manifest = { commit: '123abc', lockSHA256: digest('pinned lock'), files: Object.fromEntries(Object.entries(outputs).map(([name, data]) => [name, digest(data)])) };
    write('build/scratch/upstream.json', JSON.stringify({ commit: manifest.commit }));
    write('build/scratch/package-lock.upstream.json', 'pinned lock');
    for (const [name, data] of Object.entries(outputs)) write(`${editorRoot}/${name}`, data);
    write(`${editorRoot}/build-manifest.json`, JSON.stringify(manifest));
    git('init', '--quiet');
    git('add', '--all');
    modify({ directory, editorRoot, write, git, manifest });
    const source = script.match(/<<'VERIFY_SCRATCH_ASSETS'\n([\s\S]*?)\nVERIFY_SCRATCH_ASSETS/)[1]
        .replace("const checkout = '/workspace';", `const checkout = ${JSON.stringify(directory)};`);
    return spawnSync(process.execPath, ['-'], { input: source, encoding: 'utf8' });
}

describe('prebuilt production deployment script', () => {
    it('is valid Bash', () => {
        const result = spawnSync('bash', ['-n', scriptPath], { encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr);
    });

    it('pins a full commit and preserves both tracked Compose files', () => {
        assert.match(script, /\^\[0-9a-f\]\{40\}\$/);
        assert.match(script, /COMPOSE_FILES=\(docker-compose\.yml docker-compose\.judge\.yml\)/);
        assert.match(script, /merge-base --is-ancestor "\$EXPECTED_COMMIT" origin\/master/);
        assert.match(script, /merge --ff-only "\$EXPECTED_COMMIT"/);
        assert.match(script, /git stash apply --index "\$saved_oid"/);
    });

    it('allows only the confirmed emergency shell command', () => {
        assert.match(script, /HYDRO_CONTAINER='hydro-dev-hydro-emergency'/);
        assert.match(script, /\{\{json \.Config\.Entrypoint\}\}.*= '\["sh"\]'/);
        assert.match(script, /readonly EXPECTED_STARTUP_CMD='/);
        assert.match(script, /exec corepack yarn debug/);
        assert.match(script, /\[ "\$startup_cmd" = "\$EXPECTED_STARTUP_CMD" \]/);
        assert.doesNotMatch(script, /\/usr\/local\/bin\/entrypoint-dev\.sh|HYDRO_REBUILD_UI_ON_SOURCE_CHANGE/);
    });

    it('validates every committed manifest runtime asset before restarting', () => {
        assert.match(script, /Object\.values\(manifest\)/);
        assert.match(script, /UI manifest must be a non-empty object/);
        assert.match(script, /`hydro-\$\{uiPackage\.version\}\.js`/);
        assert.match(script, /'theme\.css', 'default\.theme\.js'/);
        assert.match(script, /Manifest asset is not committed/);
        assert.match(script, /module\.hot\.data/);
        assert.ok(script.indexOf('VERIFY_ASSETS') < script.indexOf('docker restart "$HYDRO_CONTAINER"'));
        assert.ok(script.indexOf('VERIFY_SCRATCH_ASSETS') < script.indexOf('docker restart "$HYDRO_CONTAINER"'));
    });

    it('contains no server build, dependency install, or push command', () => {
        assert.doesNotMatch(script, /^\s*(?:docker\s+(?:compose\s+)?(?:build|up)|(?:corepack\s+)?yarn\s+(?:build:ui|install)|git\s+push)\b/m);
        const hydroRestart = script.indexOf('docker restart "$HYDRO_CONTAINER"');
        const hydroReady = script.indexOf('[ "$hydro_ready" -eq 1 ]');
        const judgeRestart = script.indexOf('docker restart "$judge_container"');
        assert.ok(hydroRestart >= 0 && hydroRestart < hydroReady && hydroReady < judgeRestart);
        assert.doesNotMatch(script, /Updating session/);
    });

    it('checks the Hydro package and its existing runtime before any merge or restart', () => {
        assert.ok(script.indexOf("<<'VERIFY_HYDRO_PACKAGE'") < script.indexOf('git rev-parse HEAD > .last-safe-deploy-commit'));
        assert.ok(script.indexOf("<<'VERIFY_HYDRO_PACKAGE'") < script.indexOf('git -c core.hooksPath=/dev/null merge'));
        assert.match(script, /if ! docker exec -i "\$HYDRO_CONTAINER" node - "\$EXPECTED_COMMIT" <<'VERIFY_HYDRO_PACKAGE'/);
        assert.match(script, /stop 'Hydro 依赖变化超出允许范围/);
    });

    it('retains blocking for other package metadata and lock/configuration files', () => {
        const filter = script.match(/dependency_changes="\$\(([\s\S]*?)\)"\n\[ -z "\$dependency_changes"/)[1];
        const names = [
            'package.json', 'packages/hydrooj/package.json', 'build/favicon/package.json', 'build/favicon/pnpm-lock.yaml',
            'packages/ui-default/package.json', 'packages/example/pnpm-lock.yaml', 'build/unrelated/package.json',
            'plugins/example/package.json', 'yarn.lock', 'package-lock.json', 'pnpm-lock.yaml',
            '.yarnrc.yml', '.npmrc', '.yarn/patches/a.patch',
        ];
        const result = spawnSync('bash', ['-c', `git() { printf '%s\\n' "$TEST_CHANGED"; }; ${filter}`], {
            encoding: 'utf8', env: { ...process.env, EXPECTED_COMMIT: expectedCommit, TEST_CHANGED: names.join('\n') },
        });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(result.stdout.trim().split('\n'), names.slice(4));
    });
});

describe('local-only favicon metadata deployment exception', () => {
    it('allows only the initial audited resvg tool addition without resolving or installing it on the server', () => {
        assert.doesNotThrow(faviconGuard());
        assert.doesNotThrow(faviconGuard({ changes: '' }));
        assert.ok(script.indexOf("<<'VERIFY_FAVICON_TOOL'") < script.indexOf('git -c core.hooksPath=/dev/null merge'));
    });

    it('rejects modifications, removals and incomplete additions of the two metadata files', () => {
        for (const changes of [
            'A\tbuild/favicon/package.json', 'A\tbuild/favicon/pnpm-lock.yaml',
            'M\tbuild/favicon/package.json\nM\tbuild/favicon/pnpm-lock.yaml',
            'D\tbuild/favicon/package.json\nD\tbuild/favicon/pnpm-lock.yaml',
            'A\tbuild/favicon/package.json\nM\tbuild/favicon/pnpm-lock.yaml',
        ]) assert.throws(faviconGuard({ changes }), /first addition/);
    });

    it('rejects lifecycle hooks, extra dependencies, altered locks, and runtime workspace or startup references', () => {
        const current = JSON.parse(fs.readFileSync(path.join(root, 'build/favicon/package.json'), 'utf8'));
        for (const toolPackage of [
            { ...current, private: false },
            { ...current, scripts: { ...current.scripts, postinstall: 'node generate.mjs' } },
            { ...current, scripts: { start: 'node generate.mjs' } },
            { ...current, dependencies: { ...current.dependencies, other: '^1' } },
            { ...current, dependencies: { '@resvg/resvg-js': '^2.6.2' } },
        ]) assert.throws(faviconGuard({ toolPackage }));
        assert.throws(faviconGuard({ lock: 'unreviewed dependencies' }), /audited resvg/);
        const workspaces = ['packages/*', 'framework/*', 'plugins/*', 'modules/*'];
        assert.throws(faviconGuard({ rootPackage: { workspaces: [...workspaces, 'build/*'] } }), /outside the runtime workspaces/);
        assert.throws(faviconGuard({ rootPackage: { workspaces, scripts: { start: 'pnpm --dir build/favicon run build' } } }), /must not invoke/);
    });
});

describe('prepared Scratch editor deployment verification', () => {
    it('accepts every tracked non-empty artifact with its pinned source, lock and SHA-256', (t) => {
        const result = scratchAssetFixture(t);
        assert.equal(result.status, 0, result.stderr);
        assert.match(result.stdout, /4 个已提交/);
    });

    it('blocks untracked manifests and assets, missing or empty files, and changed bytes before restarting', (t) => {
        const variants = [
            ({ git, editorRoot }) => git('rm', '--cached', `${editorRoot}/build-manifest.json`),
            ({ git, editorRoot }) => git('rm', '--cached', `${editorRoot}/js/editor.abcd.js`),
            ({ directory, editorRoot }) => fs.unlinkSync(path.join(directory, editorRoot, 'editor.html')),
            ({ write, editorRoot }) => write(`${editorRoot}/editor.html`, ''),
            ({ write, editorRoot }) => write(`${editorRoot}/source.tar.gz`, 'changed source archive'),
            ({ write }) => write('build/scratch/package-lock.upstream.json', 'different dependency lock'),
        ];
        for (const modify of variants) {
            const result = scratchAssetFixture(t, modify);
            assert.notEqual(result.status, 0, result.stdout);
        }
    });

    it('rejects unsafe paths, omitted required release assets, symbolic links and mismatched source commits', (t) => {
        const variants = [
            ({ write, editorRoot, manifest }) => {
                manifest.files['../outside.js'] = 'a'.repeat(64);
                write(`${editorRoot}/build-manifest.json`, JSON.stringify(manifest));
            },
            ({ write, editorRoot, manifest }) => {
                delete manifest.files['source.tar.gz'];
                write(`${editorRoot}/build-manifest.json`, JSON.stringify(manifest));
            },
            ({ directory, editorRoot }) => {
                const file = path.join(directory, editorRoot, 'editor.html');
                fs.unlinkSync(file);
                fs.symlinkSync('UPSTREAM-LICENSE', file);
            },
            ({ write }) => write('build/scratch/upstream.json', JSON.stringify({ commit: 'unmatched-source' })),
        ];
        for (const modify of variants) {
            const result = scratchAssetFixture(t, modify);
            assert.notEqual(result.status, 0, result.stdout);
        }
    });
});

describe('prebuilt Hydro dependency metadata exception', () => {
    const before = { name: 'hydrooj', version: '1', dependencies: { lodash: '^4.0.0' }, scripts: { start: 'node app' } };
    const promoted = { ...before, dependencies: { ...before.dependencies, pngjs: '^5.0.0' } };

    it('allows only promotion of existing pngjs 5, checking resolution, installed version and both sync functions', () => {
        const h = packageGuard(before, promoted);
        assert.doesNotThrow(h.run);
        assert.deepEqual(h.calls, ['resolve:pngjs', 'pngjs/package.json', 'semver', 'pngjs']);
    });

    it('allows identical package metadata and still validates an already declared pngjs runtime', () => {
        const ordinary = packageGuard(before, before, { missing: true });
        assert.doesNotThrow(ordinary.run);
        assert.equal(ordinary.calls.length, 0);
        const declared = packageGuard(promoted, promoted);
        assert.doesNotThrow(declared.run);
        assert.equal(declared.calls[0], 'resolve:pngjs');
        assert.throws(packageGuard(promoted, promoted, { missing: true }).run, /MODULE_NOT_FOUND/);
    });

    it('rejects every other metadata change even when pngjs promotion is also included', () => {
        const variants = [
            { ...promoted, version: '2' },
            { ...promoted, scripts: { start: 'npm install && node app' } },
            { ...promoted, dependencies: { ...promoted.dependencies, lodash: '^5.0.0' } },
            { ...promoted, dependencies: { ...promoted.dependencies, newPackage: '^1.0.0' } },
            { ...promoted, devDependencies: { pngjs: '^5.0.0' } },
            { ...promoted, engines: { node: '>=24' } },
            { ...promoted, overrides: { lodash: '^5.0.0' } },
        ];
        for (const after of variants) assert.throws(packageGuard(before, after).run);
    });

    it('rejects removal or replacement of an existing direct pngjs dependency and different proposed ranges', () => {
        assert.throws(packageGuard(promoted, before).run, /Existing pngjs requirements cannot be changed/);
        for (const version of ['^4.0.0', '^6.0.0', '5.0.0', '*', null]) {
            assert.throws(packageGuard(before, { ...before, dependencies: { ...before.dependencies, pngjs: version } }).run);
        }
        assert.throws(packageGuard({ ...before, dependencies: { pngjs: '^4.0.0' } }, promoted).run);
        assert.throws(packageGuard({ ...before, dependencies: undefined }, promoted).run);
    });

    it('requires the running container to already have a compatible usable pngjs installation', () => {
        for (const runtime of [
            { missing: true }, { version: '4.0.0' }, { version: '6.0.0' }, { version: '5.0.0-beta.1' },
            { version: 'not-semver' }, { version: null }, { PNG: {} }, { PNG: { sync: {} } },
            { PNG: { sync: { read() {} } } }, { PNG: { sync: { write() {} } } },
        ]) assert.throws(packageGuard(before, promoted, runtime).run);
        assert.doesNotThrow(packageGuard(before, promoted, { version: '5.1.2' }).run);
    });

    it('leaves root package.json rules unchanged: test script edits only', () => {
        const rootBefore = { name: 'hydro', dependencies: { lodash: '^4.0.0' }, scripts: { test: 'node test', build: 'node build' } };
        const rootAfter = { ...rootBefore, scripts: { ...rootBefore.scripts, test: 'node new-test', 'test:new': 'node new' } };
        assert.doesNotThrow(packageGuard(rootBefore, rootAfter, {}, 'VERIFY_PACKAGE').run);
        assert.throws(packageGuard(rootBefore, { ...rootAfter, dependencies: { lodash: '^5.0.0' } }, {}, 'VERIFY_PACKAGE').run);
        assert.throws(packageGuard(rootBefore, { ...rootAfter, scripts: { build: 'changed' } }, {}, 'VERIFY_PACKAGE').run);
    });
});
