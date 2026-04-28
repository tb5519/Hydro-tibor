#!/bin/sh
set -eu

HYDRO_HOME="${HYDRO_HOME:-/data/hydro}"
export HOME="$HYDRO_HOME"
FILE_ROOT="${HYDRO_FILE_STORAGE:-/data/file}"

mkdir -p "$HOME/.hydro" "$FILE_ROOT/hydro"

MONGO_HOST="${HYDRO_MONGO_HOST:-mongo}"
echo "Waiting for MongoDB at ${MONGO_HOST}:27017..."
until nc -z "$MONGO_HOST" 27017 2>/dev/null; do
    sleep 1
done

export HYDRO_MONGODB_URL="${HYDRO_MONGODB_URL:-mongodb://mongo:27017/hydro}"
export HYDRO_ADDONS_JSON="${HYDRO_ADDONS_JSON:-}"
export YARN_ENABLE_INLINE_BUILDS="${YARN_ENABLE_INLINE_BUILDS:-1}"

YARN_VERSION="${HYDRO_YARN_VERSION:-}"
if [ -z "$YARN_VERSION" ]; then
    YARN_VERSION="$(node -e "try{const p=require('/workspace/package.json');const pm=p.packageManager||'';const m=pm.match(/^yarn@(.+)$/);if(m)process.stdout.write(m[1]);}catch(e){}")"
fi
if [ -z "$YARN_VERSION" ]; then
    YARN_VERSION="4.9.1"
fi

echo "Preparing package manager: yarn@${YARN_VERSION}"
corepack enable
corepack prepare "yarn@${YARN_VERSION}" --activate

node <<'NODE'
const fs = require('fs');
const path = require('path');
const home = process.env.HOME;
const dir = path.join(home, '.hydro');
fs.mkdirSync(dir, { recursive: true });
const url = process.env.HYDRO_MONGODB_URL || 'mongodb://mongo:27017/hydro';
fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ url }));
let addons = process.env.HYDRO_ADDONS_JSON;
if (!addons || !String(addons).trim()) {
    addons = JSON.stringify(['@hydrooj/ui-default']);
} else {
    try {
        JSON.parse(addons);
    } catch {
        console.error('HYDRO_ADDONS_JSON must be a valid JSON array string, e.g. ["@hydrooj/ui-default"]');
        process.exit(1);
    }
}
fs.writeFileSync(path.join(dir, 'addon.json'), addons);
NODE

cd /workspace

if [ ! -f "/workspace/yarn.lock" ] && [ ! -f "/workspace/pnpm-lock.yaml" ] && [ ! -f "/workspace/package-lock.json" ]; then
    echo "WARNING: No lockfile found in /workspace."
    echo "If this repo should include a lockfile, please re-download via 'git clone' (zip downloads often miss git-managed lockfiles)."
fi

echo "==== Hydro dependency diagnostics ===="
echo "pwd: $(pwd)"
echo "node: $(node -v)"
echo "yarn: $(corepack yarn -v)"
if [ -d "/workspace/node_modules" ]; then
    echo "node_modules: present"
else
    echo "node_modules: missing"
fi
if [ -f "/workspace/.yarn/install-state.gz" ]; then
    echo ".yarn/install-state.gz: present"
else
    echo ".yarn/install-state.gz: missing"
fi
if [ -f "/workspace/node_modules/.yarn-state.yml" ]; then
    echo "node_modules/.yarn-state.yml: present"
else
    echo "node_modules/.yarn-state.yml: missing"
fi

INSTALL_META_FILE="/workspace/node_modules/.hydro-install-meta"
CURRENT_INSTALL_META="$(node <<'NODE'
const fs = require('fs');
const crypto = require('crypto');
const files = [
  '/workspace/package.json',
  '/workspace/.yarnrc.yml',
  '/workspace/.npmrc',
];
const patchDir = '/workspace/.yarn/patches';
const hash = crypto.createHash('sha256');
for (const file of files) {
  if (fs.existsSync(file)) hash.update(fs.readFileSync(file));
}
if (fs.existsSync(patchDir)) {
  const entries = fs.readdirSync(patchDir).sort();
  for (const file of entries) {
    const p = `${patchDir}/${file}`;
    if (fs.statSync(p).isFile()) hash.update(fs.readFileSync(p));
  }
}
process.stdout.write(hash.digest('hex'));
NODE
)"
PREV_INSTALL_META=""
if [ -f "$INSTALL_META_FILE" ]; then
    PREV_INSTALL_META="$(cat "$INSTALL_META_FILE" 2>/dev/null || true)"
fi

STATE_FILE_FOUND="0"
if [ -f "/workspace/node_modules/.yarn-state.yml" ] || [ -f "/workspace/.yarn/install-state.gz" ]; then
    STATE_FILE_FOUND="1"
fi

if [ "${HYDRO_SKIP_YARN_INSTALL:-0}" = "1" ]; then
    echo "Skipping dependency installation (HYDRO_SKIP_YARN_INSTALL=1)."
elif [ "$STATE_FILE_FOUND" = "1" ] && [ "$CURRENT_INSTALL_META" = "$PREV_INSTALL_META" ]; then
    echo "Dependencies and install meta unchanged, skipping yarn install."
else
    if [ "$STATE_FILE_FOUND" = "1" ] && [ "$CURRENT_INSTALL_META" != "$PREV_INSTALL_META" ]; then
        echo "Detected package manager config change, reinstalling dependencies."
    else
        echo "Dependency state files missing, running initial install."
    fi
    echo "Running: corepack yarn install --inline-builds"
    corepack yarn install --inline-builds
    mkdir -p "/workspace/node_modules"
    printf '%s' "$CURRENT_INSTALL_META" > "$INSTALL_META_FILE"
fi

UI_PUBLIC_DIR="/workspace/packages/ui-default/public"
NEED_UI_PRODUCTION_BUILD="0"

if [ ! -f "${UI_PUBLIC_DIR}/default.theme.js" ]; then
    NEED_UI_PRODUCTION_BUILD="1"
fi
if ! ls "${UI_PUBLIC_DIR}"/hydro-*.js >/dev/null 2>&1; then
    NEED_UI_PRODUCTION_BUILD="1"
fi
if ! ls "${UI_PUBLIC_DIR}"/theme-*.css >/dev/null 2>&1; then
    NEED_UI_PRODUCTION_BUILD="1"
fi
if [ -f "${UI_PUBLIC_DIR}/default.theme.js" ] && grep -q "module.hot.data" "${UI_PUBLIC_DIR}/default.theme.js"; then
    NEED_UI_PRODUCTION_BUILD="1"
fi

if [ "$NEED_UI_PRODUCTION_BUILD" = "1" ]; then
    echo "UI production assets missing or dev-HMR assets detected, running corepack yarn build:ui:production..."
    corepack yarn build:ui:production
else
    echo "UI production assets found, skipping build:ui:production."
fi

if [ "${HYDRO_SET_SERVER_HOST:-1}" = "1" ]; then
    echo "Ensuring Hydro server.host is 0.0.0.0 for Docker port mapping..."
    if ! corepack yarn hydrooj cli system set server.host 0.0.0.0; then
        echo "WARN: Failed to set server.host automatically. You can set it manually via:"
        echo "      corepack yarn hydrooj cli system set server.host 0.0.0.0"
    fi
fi

exec "$@"
