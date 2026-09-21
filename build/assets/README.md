# OneByOne asset storage and CDN delivery

This layer moves public release assets and authorized media traffic away from the application server. Accounts, workspace boundaries, problem visibility, Scratch ownership and material recipients remain enforced by Hydro. It does not make the primary storage bucket public or replace the global storage backend.

## Public releases

`sync.mjs` publishes only committed files referenced by `packages/ui-default/public/manifest.json`, the Scratch build manifest, and the explicit favicon/default-avatar list. Built-in profile backgrounds are already in the UI manifest. It rejects missing, untracked, changed or unsafe files and verifies uploaded length, SHA-256 metadata, content type and cache policy with HEAD requests. An existing release name cannot be reused for different bytes.

Build UI and Scratch assets **locally**, commit the prepared `public` tree, and then upload the exact release. The following commands only inspect or upload prepared assets; they never build or install dependencies:

```sh
node build/assets/sync.mjs \
  --public-dir /absolute/release/packages/ui-default/public \
  --version RELEASE_ID

node build/assets/sync.mjs \
  --public-dir /absolute/release/packages/ui-default/public \
  --version RELEASE_ID \
  --config /absolute/private/assets.json \
  --apply
```

The first command is a dry run. The second writes `.cache/assets/RELEASE_ID.json` only after every object has been verified; `--output /absolute/manifest.json` overrides that location. Objects live below `static/RELEASE_ID/`. Keep earlier releases available for open browser tabs and rollback.

Templates call `assetUrl` only for known local images. External image URLs, dynamic `/resource/` responses, user attachments and unknown paths are not rewritten. When delivery is disabled, existing URLs and the previous `UiContext.cdn_prefix` fallback remain intact. The separately configured `server.cdn` UI prefix must not send generated language resources to a bucket unless those resources are independently published or routed to Hydro.

The Scratch iframe entry stays on the application origin. Its public bundle, lazy chunks, fonts and blocks media use the `SCRATCH_ASSET_BASE` recorded in its local build manifest; see [the Scratch build instructions](../scratch/README.md). `assetUrl` cannot change a compiled Scratch asset base after a build.

## Authorized media

Media routes first perform their existing login, workspace, object and permission checks. They only redirect after a matching remote object has been verified. Redirect responses use `302` and `Cache-Control: private, no-store`; the target URL uses CDN Type A signing with a 30-minute validity configured at the CDN. Origin URLs remain the API presented to clients, so each new request still checks access.

Legacy local objects can be copied by the bounded background mirror queue. The first request keeps its existing response while the copy runs. A failed, disabled, oversized or not-yet-ready mirror also falls back to the existing response. Mirroring does not delete the source. Keys include the logical path, source version, size, content type, disposition and optional transformation version, preventing overwrites from returning stale media.

AC previews include `badge-ac-png-area-v1-384` or `badge-ac-png-area-v1-768` in their identity. Their upload source is the generated PNG, with its actual byte length. They deliberately omit the original image's remote descriptor so a ready full-size image cannot be mistaken for a thumbnail.

| Asset | Delivery boundary |
| --- | --- |
| Home poster and lottery prize images | Current domain configuration and existing access middleware, then valid storage metadata |
| Domain avatar | Existing exact UUID PNG route and current domain path validation |
| Badge backgrounds, AC images/previews, theme audio | Existing legacy/modern badge scope and object checks |
| Account avatar | Exact avatar filename and matching raster MIME metadata after the existing file-route access checks and audit log |
| Other personal images | `noDisposition=true`, matching raster extension/MIME, existing access checks and audit log |
| Problem statement images | `additional_file` and `noDisposition=true` only, after all problem/contest/reference permission checks and audit log |
| Scratch projects and thumbnails | Existing file ownership, teacher/material/template checks; public playback additionally validates its share token |

Inline images support PNG, JPEG, GIF, WebP and AVIF. SVG/HTML and arbitrary attachments are excluded from the generic inline path. Requests for an ordinary attachment retain the original signed-download response and filename. Existing Markdown links without `noDisposition=true` retain their original delivery behavior.

Training/contest attachment downloads, problem testdata, submissions, judge files and arbitrary `/storage` requests are not newly exposed through this delivery layer. Scratch non-project material types continue through their existing route unless explicitly supported by the file source helper. External Gravatar/QQ/GitHub/custom URLs remain external.

## Mixed primary storage

For the small application disk, `storageEnabled` selects **OSS primary storage for the explicitly allowed media types**, rather than retaining two permanent byte copies. The database still stores logical paths, sizes, versions and ownership. An OSS-backed file carries a `remoteAsset` descriptor with `key`, `sha256`, `size`, `contentType`, `bucket` and `region`; reads use that descriptor even when CDN redirects and new remote writes are disabled. Existing local files continue to work alongside remote files.

The primary-storage allowlist is separate from the direct-CDN route allowlist. It covers the recognized Scratch object paths, personal images/audio, account/domain avatars, domain posters, badge images/audio, lottery prize media, training media, problem `additional_file` media and contest `public` media. It excludes problem `testdata`, contest `private`, judge/submission objects and non-media personal files. A route without a direct CDN integration still uses its existing authorized signed-download or streaming behavior when its underlying object is remote. PDF/TXT materials, archives, video and unsupported media retain the configured original storage backend.

New remote uploads are verified before their database entry becomes active. Ordinary downloads use a short-lived OSS signed URL when necessary and preserve the requested attachment filename. Renames keep the object identity; copies share the remote object. Reference gates and the existing deletion grace period prevent cleanup from deleting an object still used by another record. A failed remote write must not replace an existing valid object.

Uploads stream or use a temporary spool instead of retaining a permanent local copy. The primary uploader bounds media at 512 MB, with the existing 20 MB Scratch-project limit, two active uploads per process and eight waiting uploads; the application still applies its existing file quotas first. Completed and failed spool files are removed in `finally`.

On Linux, startup/maintenance recovery identifies abandoned writers and deletion locks using the recorded hostname, kernel boot ID, PID and process start time. It clears an owner only when the prior process is proven to have exited, without expiring a slow live writer by age. Abandoned temporary spools use the same proof. Foreign hosts, changed boot identities and platforms without this evidence are retained for an operator review rather than guessed dead; never manually reset their writer counters while another process may still be using them.

Changing the CDN delivery switch must never make an OSS-backed file unreadable. Retain the private storage configuration and OSS read credentials when rolling delivery back. A migration may remove a local source only after the remote upload has been verified and the database now points to that object. Existing copy/link references and deletion grace periods must be preserved. Never delete the entire local storage directory or historical Scratch revisions as an asset migration shortcut.

`backfill.ts` uses a standalone Mongo client and the same minimal storage factory as the application. It never starts Hydro, runs a build or installs packages. Its default is a read-only inventory. Pass the real local storage root and private database/asset configuration explicitly:

```sh
node -r @hydrooj/register build/assets/backfill.ts \
  --database-config /absolute/private/config.json \
  --storage-root /absolute/local/file/root \
  --asset-config /absolute/private/assets.json

node -r @hydrooj/register build/assets/backfill.ts \
  --database-config /absolute/private/config.json \
  --storage-root /absolute/local/file/root \
  --asset-config /absolute/private/assets.json \
  --apply --manifest /absolute/private/asset-migration.jsonl

node -r @hydrooj/register build/assets/backfill.ts \
  --database-config /absolute/private/config.json \
  --storage-root /absolute/local/file/root \
  --asset-config /absolute/private/assets.json \
  --cleanup --manifest /absolute/private/asset-migration.jsonl
```

`--apply` only uploads, verifies and changes the corresponding database record with a compare-and-set operation; it requires `storageEnabled`. `--cleanup` is a separate stage and never uploads new files. These flags are mutually exclusive. Applying requires an absolute private journal path; its JSONL entries are written with mode `0600` and flushed before proceeding. Use the same journal for normal cleanup.

Cleanup checks **all** original/copy references, including retained historical records, and HEAD-verifies the remote primary again before deleting a local physical object. A later-batch alias or unsupported reference keeps the local object. The database retains `localMirrorId` across a migration interruption, including the case where a successful database update precedes the journal's final entry. Cleanup can recover those markers with a new private journal if the original is unavailable. It also recognizes physical identities from previous verified journal entries; it must not guess an old copied object's identity from its new record ID.

`--limit` defaults to 500, with a maximum of 10000. After inspecting the first batches, continue with `--after-id <nextId>` while the summary's `hasMore` is true. Do not substitute raw database updates or bulk file deletion. The journal and its lock are private runtime files and must not enter Git.

## Configuration

The optional private configuration is read from an absolute `HYDRO_ASSET_CONFIG_PATH`, or `~/.hydro/assets.json`. Delivery reloads it within 30 seconds. Do not put credentials, signing keys or the runtime mirror index into Git. Keep the file readable only by the Hydro runtime account.

```json
{
  "enabled": false,
  "storageEnabled": false,
  "publicBaseUrl": "https://static.example.com/static/RELEASE_ID/",
  "mediaBaseUrl": "https://static.example.com/",
  "mediaSigningKey": "REPLACE_WITH_PRIVATE_CDN_SIGNING_KEY",
  "bucket": "PRIVATE_ASSET_BUCKET",
  "region": "cn-wulanchabu",
  "endpoint": "https://s3.oss-cn-wulanchabu.aliyuncs.com",
  "accessKeyId": "REPLACE_WITH_PRIVATE_ACCESS_KEY_ID",
  "secretAccessKey": "REPLACE_WITH_PRIVATE_ACCESS_KEY_SECRET"
}
```

`enabled` controls optional delivery; `storageEnabled` independently opts allowed new writes and migration into OSS primary storage. Setting both to `false` preserves reads of existing remote records. `publicBaseUrl` must be HTTPS with `/static/<release>/`; `mediaBaseUrl` and the S3-compatible `endpoint` must be HTTPS origin roots. `mediaSigningKey` must match the CDN Type A key and contain 16–128 alphanumeric characters. `sessionToken` is optional for temporary credentials. The upload tool needs the bucket, region, endpoint and upload credentials even when delivery is still disabled.

Keep `endpoint` publicly reachable: browser-facing OSS download signatures always use it. After verifying same-region internal connectivity on the production server, optionally add `"internalEndpoint": "https://s3.oss-cn-wulanchabu-internal.aliyuncs.com"` to that server's configuration. Server PUT/HEAD/GET/DELETE and background mirrors then use the internal endpoint; browser signatures continue to use the public endpoint. The internal hostname must exactly match the configured region, with no path, credentials, query or fragment. Leave it unset on a developer computer or any host without that internal network access.

The mirror index is `asset-mirror-index.json` beside the configuration, written with mode `0600`. It records verified object identities and is not a replacement for the application database or OSS backups.

The CDN must permit anonymous requests only under the public `/static/` namespace. Media requires the configured Type A signature; bucket origin access remains private. The CDN needs the correct content types, public asset CORS (`Access-Control-Allow-Origin: *`, without credentials), and gzip/Brotli for compressible static assets. Signed project downloads fetched by the main application also need appropriate CORS. Never forward application cookies to OSS or make the bucket public to work around a CORS error.

## Validation and rollback

Before switching a release, verify an authenticated teacher/student image, a denied cross-workspace request, a missing file, a cold mirror and a ready signed redirect. Check the editor's initial and lazy-loaded assets plus public playback. Disabling optional delivery must restore local URLs or application-proxied OSS reads without changing account or file permissions.

To stop CDN redirects, set `enabled` to `false`, retain the OSS primary-storage credentials, and allow the configuration cache to expire or restart Hydro. Also set `storageEnabled` to `false` to stop new remote writes; this does not migrate existing objects back. Restore the previous `server.cdn` setting separately if it was changed. A Scratch build with a compiled CDN asset base needs the previously prepared local asset release restored; the delivery switch alone does not rewrite compiled bundles. Keep the old CDN release until existing tabs have drained.

For a code rollback, use a release that understands `remoteAsset` records once remote primary writes or migration have begun. Rolling back to code that only reads local files requires a verified reverse migration first. Production updates only pull prepared commits, restart Hydro, wait for health, and restart Judge. Never build UI or Docker images on the production server.

Actual cloud domain, bucket permissions, CORS rules and migration completion are deployment state and must be verified during rollout; this document is not proof that they are configured.

## Cloud verification on 2026-09-21

`static.onebyone.run` is served over trusted HTTPS with the exact certificate issued through Baota for that hostname; the current certificate expires on 2026-12-20. Certificate renewal and publishing the renewed certificate to CDN are separate steps; this rollout does not claim that a Baota-only renewal automatically updates CDN.

Real probes verified public static `200`, gzip, and cache hits. Private media returned `403` without a signature, with an expired signature, and with an incorrect signature, including after warming the cache. Valid signatures returned matching bytes and cache hits even with a new nonce, while browser headers remained `Cache-Control: private, no-store` and CORS was `*`. Four literal/encoded dot-segment attempts returned `404` with OSS retaining the path below `static/`; none returned private media. Probe objects were deleted and OSS absence was verified.

This account does not enable `origin_response_header` (function 229). The verified media edge cache uses `path_based_ttl_set` with origin cache priority disabled and the ignore-no-cache flag enabled; do not silently depend on function 229. Server-to-OSS internal HTTPS PUT/HEAD/GET/DELETE was independently verified. Application rollout and migration completion must still be recorded after their own checks.
