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

## Optional CDN assets

`SCRATCH_ASSET_BASE` changes the asset directory at build time. With no setting it remains `/scratch-editor/`. For example, build locally with:

```sh
SCRATCH_ASSET_BASE=https://cdn.example.com/releases/classroom-v1/scratch-editor/ node build/scratch/build.mjs
node build/scratch/verify.mjs
```

The value must be an absolute HTTPS URL or a same-site absolute path. Credentials, query strings, fragments, protocol-relative URLs, dot segments, encoded segments and backslashes are rejected. Directory segments may contain letters, digits, `.`, `_`, `~` and `-`; a trailing slash is added when omitted. Version directories are supported. `ROOT`, Webpack's public path, lazy chunks and the GUI's blocks-media base use this same directory; changing only the first script URL is insufficient. The build manifest records the actual `assetBase` and `publicPath`. To reproduce a CDN build from `source.tar.gz`, set `ROOT` in the extraction command above to the manifest's `assetBase`.

The iframe entry stays on this website at `/scratch-editor/editor.html` in editor, player and thumbnail modes. Only its public assets move to the configured directory. Upload the contents of the prepared `scratch-editor` directory under that exact CDN prefix before publishing the matching same-site HTML. Keep earlier hashed assets available for existing tabs. Initial and lazy-loaded scripts use anonymous CORS; the CDN must send `Access-Control-Allow-Origin: *` for public assets, including fonts, because the sandbox has an opaque origin. Do not enable credentialed CORS or put private projects, thumbnails or API responses in this public upload.

Serve JavaScript, SVG and font files with their correct content types and enable gzip/Brotli for compressible files. Hashed assets can use immutable long-term caching; an immutable version directory also covers otherwise stable blocks-media names. Revalidate the same-site `editor.html` and `build-manifest.json`. Source archives and license notices remain available with the release but are never preloaded by the editor. The CDN setting does not change the separate official Scratch costume/sound asset service, account requests, the save bridge or iframe sandbox.

## Integration and boundaries

`scratch_editor.page.ts` loads the editor only on the editor page. The iframe uses `sandbox="allow-scripts allow-downloads"`, intentionally without `allow-same-origin`. Public editor resources need `Access-Control-Allow-Origin: *` so fonts and WebGL resources work from its opaque origin; private project APIs must retain ordinary authentication and origin checks.

The parent receives authenticated route configuration via `UiContext.scratchEditor`, fetches the current .sb3, and transfers its ArrayBuffer into the iframe. A random per-frame channel plus exact `message.source` verification identifies the bridge. No message can supply a URL, user ID, role or destination API. Only an outstanding parent-initiated export can cause a project upload. The save endpoint rechecks domain membership, owner permission and revision. The iframe never receives account cookies, credentials, signed file URLs or save URLs.

The local entry bypasses TurboWarp's homepage, cloud, addons, URL project importer and community shell. Custom JavaScript extensions are blocked at the VM loader, and the extension picker exposes only pen, music and makeymakey. The server must apply the same .sb3 extension policy. Scratch projects still execute inside the isolated VM iframe.

The parent's `init` message selects `mode: 'editor' | 'player' | 'thumbnail'`. Player mode opens a responsive stage and starts the green flag, with native stop/restart/fullscreen controls. Both player and thumbnail mode force read-only access and reject export requests. The iframe must be granted the fullscreen feature for browser fullscreen to be available.

Editor mode retains native local file import/download, editing and the project title. The misleading native new-project action is removed: creation belongs to the classroom. File System Access pickers are disabled in the opaque iframe; imports use a standard file input and exports download an `.sb3`. An in-frame dialog explains that importing replaces the current work's contents, and a successful import always emits `dirty`, including when its filename matches the current title. A committed native title edit emits `{type: 'titleChanged', title}`; initialization does not emit a title change. The parent includes the new title with its next authenticated project save. The native menu reserves its right edge for the parent's save buttons (264px, or 150px below 600px wide).

Thumbnail mode never starts the VM or green flag. Its initial `init` and later `{type: 'preview', id, project?: ArrayBuffer}` messages respond with `{type: 'thumbnail', id, thumbnail: dataURL | null}` after loading and drawing. Reuse a single frame sequentially to avoid loading a VM per card. Omitting `project` reloads a cached copy of the built-in default project, so the preceding work cannot leak into the next cover. The parent controls queueing, timeouts, file authorization and frame disposal; no thumbnail message can save a project.

The built-in default project, editor UI, drawing and sound editing are local. Upstream's stock costume/sound library can request Scratch's public asset service when selecting a stock asset; uploaded .sb3 files contain their own assets. This is distinct from loading an editor from an external website and can be vendored separately if fully offline classroom use is required.

Paper's SVG importer normally creates a nested iframe and calls `contentDocument.open()`. A nested frame inherits the outer opaque sandbox, making that document inaccessible and crashing the costume tab. `paper-sandbox-loader.cjs` replaces only Paper's import container with a reusable detached HTML document. SVG nodes never enter the live editor DOM; ordinary presentation attributes, inline styles, shapes, clipping and gradients continue through Paper's existing parser. Styles that depend solely on a `<style>` stylesheet's class selectors cannot be resolved in that inert document; use presentation attributes or inline styles for imported SVG costumes. This patch does not change the outer iframe's sandbox or the separate renderer's SVG bounding-box measurement path.

## License and source

TurboWarp GUI and scratch-paint modifications are GPL-3.0; original Scratch notices and dependency licenses remain applicable. The exact official repository, commit and dependency integrity metadata are in `upstream.json` and `package-lock.upstream.json`. Local modifications are these integration files and the explicit extension-picker, embedded-mode, menu and local-import substitutions in `build.mjs`. The public output retains upstream LICENSE, README (including original Scratch copyright and asset attribution) and TRADEMARK. Keep this build directory and the pinned source available with any redistributed build; do not represent OneByOne as an official Scratch or TurboWarp service.
