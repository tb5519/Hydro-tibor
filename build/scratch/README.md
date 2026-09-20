# OneByOne's local Scratch editor

The editor is a local production build of the official [TurboWarp GUI](https://github.com/TurboWarp/scratch-gui), pinned by `upstream.json`. It is served by Hydro from `packages/ui-default/public/scratch-editor`. There is no Python service, remote editor proxy, or external editor iframe.

## Rebuild on the developer's computer

Use Node 24 and npm 11.6.0:

```sh
node build/scratch/build.mjs
node build/scratch/verify.mjs
```

The script checks out the exact commit into a temporary directory, runs `npm ci --ignore-scripts` against upstream's committed package lock (including exact Git dependency revisions), copies the small integration files, and builds only the editor entry. `SCRATCH_BUILD_DIR` overrides the temporary directory; `SCRATCH_NPM_CLI` optionally points to npm's `bin/npm-cli.js`. `SCRATCH_SKIP_INSTALL=1` is only for rebuilding an already installed checkout. Dependencies are kept separate from the main project's yarn workspace.

The build records the complete upstream lock and the SHA-256 of every output in `build-manifest.json`. `source.tar.gz` contains the corresponding GUI source including local changes. Hashed JS and static assets can be cached long term. `editor.html` and the manifest should revalidate. A normal release must include the prepared static files. Never run this build or the main UI build on the production server.

To rebuild the extracted `source.tar.gz` directly, without the OneByOne repository:

```sh
npm ci --ignore-scripts --no-audit --no-fund
NODE_ENV=production ROOT=/scratch-editor/ CI=1 NODE_OPTIONS=--max-old-space-size=8192 node node_modules/webpack/bin/webpack.js --config onebyone.webpack.cjs --bail
```

Run those commands in the extracted source directory on a development machine; the generated browser files go into `build/`.

## Integration and boundaries

`scratch_editor.page.ts` loads the editor only on the editor page. The iframe uses `sandbox="allow-scripts allow-downloads"`, intentionally without `allow-same-origin`. Public editor resources need `Access-Control-Allow-Origin: *` so fonts and WebGL resources work from its opaque origin; private project APIs must retain ordinary authentication and origin checks.

The parent receives authenticated route configuration via `UiContext.scratchEditor`, fetches the current .sb3, and transfers its ArrayBuffer into the iframe. A random per-frame channel plus exact `message.source` verification identifies the bridge. No message can supply a URL, user ID, role or destination API. Only an outstanding parent-initiated export can cause a project upload. The save endpoint rechecks domain membership, owner permission and revision. The iframe never receives account cookies, credentials, signed file URLs or save URLs.

The local entry bypasses TurboWarp's homepage, cloud, addons, URL project importer and community shell. Custom JavaScript extensions are blocked at the VM loader, and the extension picker exposes only pen, music and makeymakey. The server must apply the same .sb3 extension policy. Scratch projects still execute inside the isolated VM iframe.

The parent's `init` message selects `mode: 'editor' | 'player' | 'thumbnail'`. Player mode opens a responsive stage and starts the green flag, with native stop/restart/fullscreen controls. Both player and thumbnail mode force read-only access and reject export requests. The iframe must be granted the fullscreen feature for browser fullscreen to be available.

Editor mode retains native local file import/download, editing and the project title. The misleading native new-project action is removed: creation belongs to the classroom. File System Access pickers are disabled in the opaque iframe; imports use a standard file input and exports download an `.sb3`. An in-frame dialog explains that importing replaces the current work's contents, and a successful import always emits `dirty`, including when its filename matches the current title. A committed native title edit emits `{type: 'titleChanged', title}`; initialization does not emit a title change. The parent includes the new title with its next authenticated project save. The native menu reserves its right edge for the parent's save buttons (264px, or 150px below 600px wide).

Thumbnail mode never starts the VM or green flag. Its initial `init` and later `{type: 'preview', id, project?: ArrayBuffer}` messages respond with `{type: 'thumbnail', id, thumbnail: dataURL | null}` after loading and drawing. Reuse a single frame sequentially to avoid loading a VM per card. Omitting `project` reloads a cached copy of the built-in default project, so the preceding work cannot leak into the next cover. The parent controls queueing, timeouts, file authorization and frame disposal; no thumbnail message can save a project.

The built-in default project, editor UI, drawing and sound editing are local. Upstream's stock costume/sound library can request Scratch's public asset service when selecting a stock asset; uploaded .sb3 files contain their own assets. This is distinct from loading an editor from an external website and can be vendored separately if fully offline classroom use is required.

## License and source

TurboWarp GUI and scratch-paint modifications are GPL-3.0; original Scratch notices and dependency licenses remain applicable. The exact official repository, commit and dependency integrity metadata are in `upstream.json` and `package-lock.upstream.json`. Local modifications are these integration files and the explicit extension-picker, embedded-mode, menu and local-import substitutions in `build.mjs`. The public output retains upstream LICENSE, README (including original Scratch copyright and asset attribution) and TRADEMARK. Keep this build directory and the pinned source available with any redistributed build; do not represent OneByOne as an official Scratch or TurboWarp service.
