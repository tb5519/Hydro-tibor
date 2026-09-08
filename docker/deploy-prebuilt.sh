#!/usr/bin/env bash
set -Eeuo pipefail

readonly DEPLOY_ROOT='/www/hydro-tibor'
readonly HYDRO_CONTAINER='hydro-dev-hydro-emergency'
readonly COMPOSE_FILES=(docker-compose.yml docker-compose.judge.yml)

stop() {
    echo "已停止：$*" >&2
    exit 1
}

[[ ${1:-} =~ ^[0-9a-f]{40}$ ]] || stop '请提供完整的 40 位小写提交 SHA'
readonly EXPECTED_COMMIT="$1"

cd "$DEPLOY_ROOT"
[ "$(git rev-parse --show-toplevel)" = "$DEPLOY_ROOT" ] || stop '部署目录不是预期 Git 仓库'
[ "$(git branch --show-current)" = master ] || stop '当前分支不是 master'

docker inspect "$HYDRO_CONTAINER" >/dev/null 2>&1 || stop '找不到指定 Hydro 容器'
[ "$(docker inspect -f '{{.State.Running}}' "$HYDRO_CONTAINER")" = true ] || stop 'Hydro 当前未运行'

judge_container="$(docker ps -a --filter label=com.docker.compose.service=judge --format '{{.Names}}')"
if [ -z "$judge_container" ]; then
    judge_container="$(docker ps -a --format '{{.Names}}' | awk '/(^|[-_])judge([-_]|$)/ {print}')"
fi
[ -n "$judge_container" ] && [[ "$judge_container" != *$'\n'* ]] || stop '无法唯一识别 Judge 容器'
docker inspect "$judge_container" >/dev/null 2>&1 || stop 'Judge 容器不存在'

mount_info="$(docker inspect --format '{{range .Mounts}}{{if eq .Destination "/workspace"}}{{printf "%s|%s|%t\n" .Type .Source .RW}}{{end}}{{end}}' "$HYDRO_CONTAINER")"
[ -n "$mount_info" ] && [[ "$mount_info" != *$'\n'* ]] || stop 'Hydro 的 /workspace 挂载不唯一'
IFS='|' read -r mount_type mount_source mount_rw <<<"$mount_info"
[ "$mount_type" = bind ] && [ "$mount_rw" = true ] || stop 'Hydro 的 /workspace 不是可写 bind mount'
[ "$(readlink -f "$mount_source")" = "$(pwd -P)" ] || stop 'Hydro 挂载的不是当前仓库'

[ "$(docker inspect -f '{{json .Config.Entrypoint}}' "$HYDRO_CONTAINER")" = '["sh"]' ] \
    || stop 'Hydro 容器入口已改变'
[ "$(docker inspect -f '{{len .Config.Cmd}}' "$HYDRO_CONTAINER")" = 2 ] \
    || stop 'Hydro 容器启动参数数量已改变'
[ "$(docker inspect -f '{{index .Config.Cmd 0}}' "$HYDRO_CONTAINER")" = '-lc' ] \
    || stop 'Hydro 容器启动参数已改变'

readonly EXPECTED_STARTUP_CMD='
set -eu
mkdir -p "$HOME/.hydro" /data/file/hydro
printf "{\"url\":\"%s\"}" "$HYDRO_MONGODB_URL" > "$HOME/.hydro/config.json"
printf "%s" "$HYDRO_ADDONS_JSON" > "$HOME/.hydro/addon.json"

cd /workspace
until nc -z mongo 27017 2>/dev/null; do sleep 1; done

corepack enable
corepack prepare yarn@4.9.1 --activate
corepack yarn hydrooj cli system set server.host 0.0.0.0 || true

exec corepack yarn debug'
startup_cmd="$(docker inspect -f '{{index .Config.Cmd 1}}' "$HYDRO_CONTAINER")"
[ "$startup_cmd" = "$EXPECTED_STARTUP_CMD" ] || stop 'Hydro 容器不是已确认的安全启动方式'
unset startup_cmd

unmerged="$(git diff --name-only --diff-filter=U)"
[ -z "$unmerged" ] || stop '仓库存在未解决冲突'
unexpected="$( { git diff --name-only; git diff --cached --name-only; } \
    | sort -u | grep -Ev '^(docker-compose\.yml|docker-compose\.judge\.yml)$' || true)"
[ -z "$unexpected" ] || stop "存在非 Compose 的本地修改：$unexpected"

git -c core.hooksPath=/dev/null fetch --no-tags origin master
git cat-file -e "$EXPECTED_COMMIT^{commit}" 2>/dev/null || stop '目标提交不存在'
git merge-base --is-ancestor "$EXPECTED_COMMIT" origin/master \
    || stop '目标提交不在远端 master 中'
git merge-base --is-ancestor HEAD "$EXPECTED_COMMIT" \
    || stop '服务器 master 无法快进到目标提交'

dependency_changes="$(git diff --name-only HEAD "$EXPECTED_COMMIT" -- \
    ':(glob)**/package.json' yarn.lock package-lock.json pnpm-lock.yaml \
    .yarnrc.yml .npmrc .yarn/patches | grep -v '^package\.json$' || true)"
[ -z "$dependency_changes" ] || stop "依赖元数据发生变化，不能直接重启：$dependency_changes"

if ! docker exec -i "$HYDRO_CONTAINER" node - "$EXPECTED_COMMIT" <<'VERIFY_PACKAGE'
const assert = require('node:assert/strict');
const childProcess = require('node:child_process');

const expected = process.argv[2];
const readPackage = (revision) => JSON.parse(childProcess.execFileSync(
  'git', ['show', `${revision}:package.json`], { cwd: '/workspace' },
));
const withoutTestScripts = (value) => {
  const copy = structuredClone(value);
  for (const key of Object.keys(copy.scripts || {})) {
    if (key === 'test' || key.startsWith('test:')) delete copy.scripts[key];
  }
  return copy;
};
assert.deepStrictEqual(withoutTestScripts(readPackage('HEAD')), withoutTestScripts(readPackage(expected)));
VERIFY_PACKAGE
then
    stop 'package.json 除测试入口外发生变化，不能直接重启'
fi

git rev-parse HEAD > .last-safe-deploy-commit

compose_stash=''
restore_compose() {
    [ -n "$compose_stash" ] || return 0
    local saved_oid="$compose_stash"
    compose_stash=''
    git stash apply --index "$saved_oid" \
        || { echo "Compose 恢复冲突；未重启，备份保留：$saved_oid" >&2; return 1; }
    echo "Compose 已恢复，备份保留：$saved_oid"
}
trap 'deploy_status=$?; trap - EXIT; restore_compose || deploy_status=1; exit "$deploy_status"' EXIT

if ! git diff --quiet -- "${COMPOSE_FILES[@]}" \
    || ! git diff --cached --quiet -- "${COMPOSE_FILES[@]}"; then
    git stash push -m "server-compose-before-${EXPECTED_COMMIT:0:10}" -- "${COMPOSE_FILES[@]}"
    compose_stash="$(git rev-parse refs/stash)"
fi

git -c core.hooksPath=/dev/null merge --ff-only "$EXPECTED_COMMIT"
restore_compose
trap - EXIT
[ "$(git rev-parse HEAD)" = "$EXPECTED_COMMIT" ] || stop '部署版本不符合预期'

docker exec -i "$HYDRO_CONTAINER" node <<'VERIFY_ASSETS'
const childProcess = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = '/workspace/packages/ui-default/public';
const manifestPath = path.join(root, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const uiPackage = JSON.parse(fs.readFileSync('/workspace/packages/ui-default/package.json', 'utf8'));
if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || Object.keys(manifest).length === 0) {
  throw new Error('UI manifest must be a non-empty object');
}
for (const key of [`hydro-${uiPackage.version}.js`, 'theme.css', 'default.theme.js']) {
  if (typeof manifest[key] !== 'string' || !manifest[key]) throw new Error(`UI manifest is missing: ${key}`);
}
const tracked = new Set(childProcess.execFileSync(
  'git', ['ls-files', '-z', '--', 'packages/ui-default/public'], { cwd: '/workspace' },
).toString().split('\0').filter(Boolean));
const checked = new Set();

for (const value of Object.values(manifest)) {
  if (typeof value !== 'string' || !value.startsWith('/')) throw new Error(`Invalid manifest asset: ${value}`);
  const pathname = decodeURIComponent(value.split(/[?#]/, 1)[0]);
  if (pathname.endsWith('.map')) continue;
  const relative = pathname.replace(/^\/+/, '');
  const target = path.resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error(`Unsafe manifest asset: ${pathname}`);
  const repoPath = path.posix.join('packages/ui-default/public', relative.split(path.sep).join('/'));
  if (!tracked.has(repoPath)) throw new Error(`Manifest asset is not committed: ${repoPath}`);
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size === 0) throw new Error(`Manifest asset is empty: ${repoPath}`);
  if (target.endsWith('.js') && fs.readFileSync(target, 'utf8').includes('module.hot.data')) {
    throw new Error(`Development asset found: ${repoPath}`);
  }
  checked.add(repoPath);
}
console.log(`已验证 ${checked.size} 个预构建运行资源。`);
VERIFY_ASSETS

docker restart "$HYDRO_CONTAINER" >/dev/null
hydro_ready=0
for _ in $(seq 1 60); do
    if docker exec "$HYDRO_CONTAINER" node -e \
        "const q=require('http').get({host:'127.0.0.1',port:8888,path:'/login'},r=>process.exit(r.statusCode===200?0:1));q.setTimeout(2000,()=>q.destroy());q.on('error',()=>process.exit(1))" \
        >/dev/null 2>&1; then
        hydro_ready=1
        break
    fi
    sleep 2
done
[ "$hydro_ready" -eq 1 ] \
    || { docker logs --tail 100 "$HYDRO_CONTAINER"; stop 'Hydro 未就绪，未重启 Judge'; }

judge_since="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
docker restart "$judge_container" >/dev/null
judge_ready=0
for _ in $(seq 1 30); do
    judge_logs="$(docker logs --since="$judge_since" "$judge_container" 2>&1 || true)"
    if [ "$(docker inspect -f '{{.State.Running}}' "$judge_container")" = true ] \
        && printf '%s\n' "$judge_logs" | grep -Ei '已连接|[[:space:]]connected([[:space:]]|$)' >/dev/null; then
        judge_ready=1
        break
    fi
    sleep 2
done
[ "$judge_ready" -eq 1 ] \
    || { docker logs --tail 100 "$judge_container"; stop '尚未确认 Judge 连接'; }

echo "更新完成：$(git rev-parse --short HEAD)；未执行生产 UI 或 Docker 镜像构建。"
