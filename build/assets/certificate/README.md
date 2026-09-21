# Certificate renewal and CDN synchronization

These are **two separate tasks**. Baota/ACME renews `static.onebyone.run` using automatic DNS validation; `install-cdn-cert.py` publishes the resulting full chain and key to Alibaba CDN. Installing this timer alone does not enable issuance or renewal.

On 2026-09-21, the active certificate was issued with manual DNS validation and expires on 2026-12-20. The authoritative DNS provider was DNSPod. Baota's global automatic-renewal checkbox does not replace the missing DNS API authorization. Do not trigger another renewal merely to inspect this setup.

## Runtime and credentials

Run on the **Linux host that owns the Baota certificate**, outside Hydro/Docker. Python 3.6+ and its standard library are sufficient; there is no `pip`, `aliyun` CLI, Node or UI build dependency. HTTPS calls require a working system CA store and accurate system time. The fixed endpoint is `https://cdn.aliyuncs.com/`; proxy environment variables and HTTP redirects are deliberately ignored.

Use a dedicated RAM identity with [ram-policy.example.json](ram-policy.example.json), replacing the account ID. Only these permissions are required, scoped to `static.onebyone.run`:

- `cdn:DescribeDomainCertificateInfo`
- `cdn:SetCdnDomainSSLCertificate`

Do not grant CDN full access, certificate purchase/CAS permissions, or alter the application's OSS identity. Keep [credentials.example.json](credentials.example.json) outside Git, owned by the service user with mode `0600`. Optional `sessionToken` supports manually supplied STS credentials, but there is no token-refresh mechanism; an unattended timer needs credentials whose lifecycle is managed separately. Existing owner-only Aliyun CLI `AK`/`StsToken` profiles can be read with `--profile NAME`; no CLI process is started.

The private key is read in process and sent only in an HTTPS POST body. The script never prints provider bodies, request parameters, private keys or access credentials. Key-pair validation uses a short-lived `0700` temporary directory and `0600` snapshots, removed after validation; systemd's private temporary directory isolates these. Do not enable HTTP debug tracing or dump process memory.

## Configure the source that Baota actually renews

Create `/etc/onebyone/cdn-cert-sync.json` from [sync.example.json](sync.example.json), owned by root with mode `0600`. Verify the real files rather than a downloaded/exported copy. The server's observed full-chain location was:

```text
/www/server/panel/vhost/letsencrypt/static.onebyone.run/fullchain.pem
```

The paired key was subsequently confirmed as `privkey.pem` in the same directory. Do not assume a certificate is deployed under `vhost/cert`. Both files must be readable by the service user. The key must be owner-only, and the certificate must not be writable by group/others. Symlinks to renewal files are supported; credentials/configuration files must be regular owner-only files without symlinks.

Configuration fields:

- `certPath`: absolute path to the renewed PEM full chain, leaf first.
- `keyPath`: absolute path to its unencrypted matching private key.
- `credentialsPath`: absolute path to the dedicated private RAM credentials JSON.
- `statePath`: `/var/lib/onebyone-cdn-cert/state.json` for the provided service installer.
- `warningDays`: remaining-validity alert threshold, default `21`, allowed `1–60`.

The script checks SAN hostname, current validity, key matching and the exact in-memory snapshot. It refuses to replace a live edge certificate with an older local certificate. It does not reload Nginx, restart Hydro or change DNS.

## Verify and install

From the prepared repository on the host:

```sh
# Offline: validates source material and credential-file shape; no cloud calls.
python3 build/assets/install-cdn-cert.py --check \
  --config /etc/onebyone/cdn-cert-sync.json

# Read-only HTTPS check: also compares the configured local certificate.
python3 build/assets/install-cdn-cert.py --status \
  --config /etc/onebyone/cdn-cert-sync.json

# Read-only API preflight for new credentials, even when the edge already matches.
python3 build/assets/install-cdn-cert.py --verify-access \
  --config /etc/onebyone/cdn-cert-sync.json

# Publishes only if necessary; verify this succeeds before enabling the timer.
python3 build/assets/install-cdn-cert.py --apply \
  --config /etc/onebyone/cdn-cert-sync.json

# Preview only; no installation.
sh build/assets/certificate/install-service.sh

# Explicit host installation: copies the script, installs units and starts timer.
sudo sh build/assets/certificate/install-service.sh --apply \
  --config /etc/onebyone/cdn-cert-sync.json
```

The installer performs the offline check first. It copies the script to `/usr/local/lib/onebyone-cdn-cert/`, creates the private state directory, and installs `onebyone-cdn-cert.service` / `.timer`. The timer checks shortly after boot and every six hours with jitter; an unchanged certificate causes no CDN API call. After changing the repository script, rerun this installer to update the copied runtime.

The first real `--apply` must be verified with the dedicated credential. An already matching edge certificate can finish without a cloud API call, so that result alone does not prove write permission. `--verify-access` proves the credentials can call the read API; the configured narrow RAM policy and the first actual renewed-certificate update provide the update-permission and edge-deployment checks. No forced duplicate upload is performed just to test permissions.

For a confirmed Baota successful-renewal hook, invoke `systemctl start onebyone-cdn-cert.service`; the timer remains the retry fallback. Do not replace Baota's renewal logic with this command. If no hook is available, six-hour polling is sufficient to pick up changed files. A per-state-file `flock` prevents overlapping hook/timer runs; normal process exit releases it automatically.

If systemd is unavailable, the equivalent root cron command is the same `python3 ... --apply --config ...` invocation at a six-hour cadence, with protected logs and independent failure/staleness monitoring. The supplied installer does not install cron or platform reminders.

## Health, logs and alerts

Each run emits one JSON summary with the fixed domain, operation, timestamp, status, exit code, and local/edge certificate fingerprint and validity timestamps. It never includes PEM material or credential values. State updates use private `0600` files, atomic replacement and `fsync`; failures preserve `lastSuccessAt` from the previous healthy check while recording the new failure.

| Exit | Meaning |
| --- | --- |
| `0` | Local check passed, or trusted edge is current and safely outside the warning threshold |
| `1` | Configuration, permissions, TLS, cloud call, locking or local-material failure |
| `2` | Provider accepted/configured the certificate but the edge fingerprint is not yet verified, or status detected a mismatch |
| `3` | Certificate is valid but within the expiry warning window; renewal needs attention |

A successful API response is never treated as edge deployment success. The script checks the system trust chain, hostname, actual leaf fingerprint and expiry. It polls up to 180 seconds by default (`--wait-seconds`, maximum 600). A delayed rollout returns `2` and is checked again by the next run. The supplied unit allows 420 seconds total; keep its default wait or increase `TimeoutStartSec` if using a longer custom wait.

Integrate with the existing monitoring system using:

- `systemctl is-failed onebyone-cdn-cert.service` / a locally configured `OnFailure=` drop-in.
- `journalctl -u onebyone-cdn-cert.service`.
- Private `state.json`: alert on nonzero `exitCode`, `checkedAt` older than 12 hours, or the expiry threshold. Also alert if the file is missing.

No notification destination or external reminder is configured automatically. To stop synchronization: `systemctl disable --now onebyone-cdn-cert.timer`; stop an active service if required. This leaves the deployed certificate intact and does not disable Baota renewal. Do not delete credentials/source certificates as a rollback shortcut.

## Complete automatic renewal before calling this unattended

Configure Baota's DNS provider for the existing DNSPod zone and attach it to this certificate's renewal order. Prefer a dedicated DNS identity limited to the `onebyone.run` DomainId and necessary record query/create/delete operations. The installed panel offers both `DNSPod` (legacy ID/Token) and `腾讯云DNS` (`secret_id` / `secret_key`); use the latter with a dedicated CAM identity. Start with [dnspod-policy.example.json](dnspod-policy.example.json), scoped to the existing zone. The observed DomainId was `98100986`; substitute the verified account ID. Do not add `DescribeDomainList`, `ModifyRecord`, or `ModifyRecordStatus` by default; inspect the installed provider's initialization and renewal path if it requests an additional action. Record-level restriction to only `_acme-challenge.static` is not asserted by the domain-level policy. Do not grant the application's OSS RAM user DNS rights: it is a different cloud/provider.

After a successful automated renewal, verify all three: the source certificate's expiry/fingerprint changed, the CDN synchronization finished successfully, and a trusted HTTPS handshake sees the new certificate. Manual DNS renewal plus automatic upload must continue to be labeled **manual renewal, automatic synchronization**.

This design does not require purchasing a commercial certificate or paid certificate-management service. Existing CDN HTTPS requests and traffic retain their existing billing. It does require narrowly scoped DNS and CDN authorization.

Official references, reviewed 2026-09-21:

- [Alibaba CDN certificate update API](https://help.aliyun.com/zh/cdn/developer-reference/api-cdn-2018-05-10-setcdndomainsslcertificate/)
- [Alibaba CDN certificate query API](https://help.aliyun.com/zh/cdn/developer-reference/api-cdn-2018-05-10-describedomaincertificateinfo)
- [Alibaba RPC signing reference and test vector](https://help.aliyun.com/zh/sdk/product-overview/rpc-mechanism)
- [Baota DNS interface configuration](https://docs.bt.cn/user-guide/ssl/domain)
- [Baota deployment scope, including CDN integration limitation](https://docs.bt.cn/user-guide/ssl/auto-deploy)
- [DNSPod resource-level permissions](https://cloud.tencent.com/document/product/302/105719)
- [Let's Encrypt DNS-01 automation](https://letsencrypt.org/docs/challenge-types/)
