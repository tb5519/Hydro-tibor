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
node onebyone-library/library-assets.mjs --workspace . --output build/library-assets
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

Serve JavaScript, SVG, PNG, WAV and font files with their correct content types and enable gzip/Brotli for compressible files. Hashed assets can use immutable long-term caching; an immutable version directory also covers otherwise stable blocks-media names. Revalidate the same-site `editor.html` and `build-manifest.json`. Source archives and license notices remain available with the release but are never preloaded by the editor. The build includes all four stock libraries in `library-assets/`: previews, sounds and VM downloads use the same configured asset base, without requests to MIT's asset service at runtime. Account requests, the save bridge and iframe sandbox are unchanged.

## Integration and boundaries

`scratch_editor.page.ts` loads the editor only on the editor page. The iframe uses `sandbox="allow-scripts allow-downloads"`, intentionally without `allow-same-origin`. Public editor resources need `Access-Control-Allow-Origin: *` so fonts and WebGL resources work from its opaque origin; private project APIs must retain ordinary authentication and origin checks.

The parent receives authenticated route configuration via `UiContext.scratchEditor`, fetches the current .sb3, and transfers its ArrayBuffer into the iframe. A random per-frame channel plus exact `message.source` verification identifies the bridge. No message can supply a URL, user ID, role or destination API. Only an outstanding parent-initiated export can cause a project upload. The save endpoint rechecks domain membership, owner permission and revision. The iframe never receives account cookies, credentials, signed file URLs or save URLs.

The local entry bypasses TurboWarp's homepage, cloud, addons, URL project importer and community shell. Custom JavaScript extensions are blocked at the VM loader, and the extension picker exposes only pen, music and makeymakey. The server must apply the same .sb3 extension policy. Scratch projects still execute inside the isolated VM iframe.

The parent's `init` message selects `mode: 'editor' | 'player' | 'thumbnail'`. Player mode opens a responsive stage and starts the green flag, with native stop/restart/fullscreen controls. Both player and thumbnail mode force read-only access and reject export requests. The iframe must be granted the fullscreen feature for browser fullscreen to be available.

Editor mode retains native local file import/download, editing and the project title. The misleading native new-project action is removed: creation belongs to the classroom. File System Access pickers are disabled in the opaque iframe; imports use a standard file input and exports download an `.sb3`. An in-frame dialog explains that importing replaces the current work's contents, and a successful import always emits `dirty`, including when its filename matches the current title. A committed native title edit emits `{type: 'titleChanged', title}`; initialization does not emit a title change. The parent includes the new title with its next authenticated project save. The native menu reserves its right edge for the parent's preset/save buttons (360px, or 220px below 600px wide).

Each of the four native libraries includes a teacher-preset button. In a loaded editable frame it sends `{type: 'openPresetLibrary', kind, targetId}`; the parent may also send `requestPresetLibrary` to open the sprite category. After domain authorization and byte download, the parent sends `{type: 'importPreset', id, kind, title, filename, mime, file: ArrayBuffer, targetId}`. Supported kinds are `sprite`, `costume`, `sound` and `backdrop`; supported bytes are complete `.sprite3`, SVG/PNG/JPEG/WebP images, and MP3/WAV sounds. The server must validate archives and cap uploads before delivery. Imports never receive an asset URL. Sprite archives must contain all referenced media and cannot use custom extensions or fonts. Images pass the native upload sanitizer/decoder; WebP has an explicit rejecting decoder. Imports append to the current project and acknowledge with `presetImported` or retryable `presetImportError`, never the fatal project-load error. Pending/completed request IDs prevent duplicate insertions. Costume/sound imports retain their original target and reject if it was deleted; a costume cannot target the stage, while backgrounds always target the stage. Read-only and unloaded frames do not import.

Thumbnail mode never starts the VM or green flag. Its initial `init` and later `{type: 'preview', id, project?: ArrayBuffer}` messages respond with `{type: 'thumbnail', id, thumbnail: dataURL | null}` after loading and drawing. Reuse a single frame sequentially to avoid loading a VM per card. Omitting `project` reloads a cached copy of the built-in default project, so the preceding work cannot leak into the next cover. The parent controls queueing, timeouts, file authorization and frame disposal; no thumbnail message can save a project.

The built-in default project, editor UI, drawing and sound editing are local. `library-assets.mjs` reads the four pinned catalogs and prepares 1,304 unique stock assets. Downloads are bounded and verified against their MD5 filenames and the committed SHA-256 lock before being included in the main release manifest. A private local `.cache/scratch-library` speeds up repeat builds; it is not required in deployment. Upload the entire prepared `scratch-editor` directory, including `library-assets`, before switching the matching editor HTML. Catalog load errors show an in-place retry action. Selection downloads finish before the VM is changed, the chooser stays open on failure, and repeated pending clicks cannot insert duplicates. Uploaded .sb3 files continue to carry their own assets.

Paper's SVG importer normally creates a nested iframe and calls `contentDocument.open()`. A nested frame inherits the outer opaque sandbox, making that document inaccessible and crashing the costume tab. `paper-sandbox-loader.cjs` replaces only Paper's import container with a reusable detached HTML document. SVG nodes never enter the live editor DOM; ordinary presentation attributes, inline styles, shapes, clipping and gradients continue through Paper's existing parser. Styles that depend solely on a `<style>` stylesheet's class selectors cannot be resolved in that inert document; use presentation attributes or inline styles for imported SVG costumes.

The renderer has a separate nested iframe for SVG bounding-box measurement, used by stock SVG costumes and SVGs without a viewBox. `svg-sandbox.js` replaces that module with an offscreen closed shadow tree. It measures only a sanitized copy: geometry and safe presentation attributes/styles remain; scripts, event handlers, non-SVG content, external URLs, custom CSS properties and stylesheet at-rules are excluded. Embedded images become rectangles of identical dimensions during measurement, so no image request or nested SVG execution occurs. Original asset bytes are unchanged. Native Chromium regression tests compare safe geometry against the original renderer and check the inherited opaque boundary, CSS isolation and absence of external requests. Neither fix enables `allow-same-origin` on the classroom iframe.

## License and source

TurboWarp GUI and scratch-paint modifications are GPL-3.0; original Scratch notices and dependency licenses remain applicable. The SVG renderer replacement preserves its MPL-2.0 attribution. The exact official repository, commit and dependency integrity metadata are in `upstream.json` and `package-lock.upstream.json`. Local modifications include these integration files and the checked substitutions in `build.mjs` and `patch-libraries.cjs`. The public output retains upstream LICENSE, README and TRADEMARK plus `LIBRARY-CREDITS.md` for Scratch's stock artwork and sounds. The source archive includes the mirror script, lock and pinned catalogs. Keep this build directory and the corresponding source available with any redistributed build; do not represent OneByOne as an official Scratch or TurboWarp service.

## Domain preset library

Scratch teachers can manage reusable sprites, costumes, sounds and backdrops at
`/d/<domainId>/domain/scratch-library`. The editor's **老师素材** button and native
library shortcuts open the same domain-scoped picker. Images have previews and
sounds load only when played or added. Uploads support multiple files, editable
names and individual results; one failure does not discard successful uploads.

Presets use the domain's existing Scratch storage quota and OSS primary storage
when enabled. Only domain members can fetch them; management requires the domain
editing permission. The parent page authenticates downloads and transfers bytes
to the sandboxed editor. Adding a preset copies it into the project, so deleting
the original preset does not break already-saved projects.
