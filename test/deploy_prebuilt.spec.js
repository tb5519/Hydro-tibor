const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { describe, it } = require('node:test');

const root = path.resolve(__dirname, '..');
const scriptPath = path.join(root, 'docker/deploy-prebuilt.sh');
const script = fs.readFileSync(scriptPath, 'utf8');

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
    });

    it('contains no server build, dependency install, or push command', () => {
        assert.doesNotMatch(script, /^\s*(?:docker\s+(?:compose\s+)?(?:build|up)|(?:corepack\s+)?yarn\s+(?:build:ui|install)|git\s+push)\b/m);
        const hydroRestart = script.indexOf('docker restart "$HYDRO_CONTAINER"');
        const hydroReady = script.indexOf('[ "$hydro_ready" -eq 1 ]');
        const judgeRestart = script.indexOf('docker restart "$judge_container"');
        assert.ok(hydroRestart >= 0 && hydroRestart < hydroReady && hydroReady < judgeRestart);
        assert.doesNotMatch(script, /Updating session/);
    });
});
