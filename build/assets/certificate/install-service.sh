#!/bin/sh
# Host-only installer. Never touches Hydro, Docker, DNS or certificate issuance.
set -eu
mode=plan
config=/etc/onebyone/cdn-cert-sync.json
while [ "$#" -gt 0 ]; do
  case "$1" in
    --apply) mode=apply; shift ;;
    --config) config=${2:?configuration path required}; shift 2 ;;
    *) echo 'Usage: install-service.sh [--apply] [--config /absolute/config.json]' >&2; exit 1 ;;
  esac
done
case "$config" in
  /*) ;;
  *) echo 'Absolute configuration path required' >&2; exit 1 ;;
esac
case "$config" in
  *[!a-zA-Z0-9_./-]*) echo 'Service configuration path must not contain whitespace or shell metacharacters' >&2; exit 1 ;;
esac
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "$mode" = plan ]; then
  echo "Plan only: install host service and six-hour timer using $config"
  echo 'Requires root, Python 3.6+, systemd, a real renewed certificate path and dedicated CDN credentials.'
  echo 'This service synchronizes certificates; Baota/ACME must separately renew them.'
  exit 0
fi
[ "$(id -u)" = 0 ] || { echo 'Root is required for host service installation' >&2; exit 1; }
command -v systemctl >/dev/null
/usr/bin/python3 "$source_dir/install-cdn-cert.py" --config "$config" --check
# Fixed private state location is also the systemd writable-path boundary.
/usr/bin/python3 - "$config" <<'PY'
import json,sys
with open(sys.argv[1]) as f:
    c=json.load(f)
if c.get('statePath') != '/var/lib/onebyone-cdn-cert/state.json':
    raise SystemExit('statePath must be /var/lib/onebyone-cdn-cert/state.json for this installer')
if not c.get('credentialsPath'):
    raise SystemExit('credentialsPath is required')
PY
install -d -m 0700 /var/lib/onebyone-cdn-cert
install -d -m 0755 /usr/local/lib/onebyone-cdn-cert
install -m 0755 "$source_dir/install-cdn-cert.py" /usr/local/lib/onebyone-cdn-cert/install-cdn-cert.py
unit_tmp=$(mktemp)
trap 'rm -f "$unit_tmp"' EXIT HUP INT TERM
cat > "$unit_tmp" <<EOF
[Unit]
Description=OneByOne renewed certificate synchronization to Alibaba CDN
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
UMask=0077
ExecStart=/usr/bin/python3 /usr/local/lib/onebyone-cdn-cert/install-cdn-cert.py --apply --config $config
TimeoutStartSec=420
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/var/lib/onebyone-cdn-cert
EOF
install -m 0644 "$unit_tmp" /etc/systemd/system/onebyone-cdn-cert.service
cat > "$unit_tmp" <<'EOF'
[Unit]
Description=Check OneByOne CDN certificate synchronization every six hours

[Timer]
OnBootSec=2min
OnCalendar=*-*-* 00,06,12,18:17:00
RandomizedDelaySec=10min
Persistent=true
Unit=onebyone-cdn-cert.service

[Install]
WantedBy=timers.target
EOF
install -m 0644 "$unit_tmp" /etc/systemd/system/onebyone-cdn-cert.timer
systemctl daemon-reload
systemctl enable --now onebyone-cdn-cert.timer
echo 'Installed synchronization timer. Certificate renewal is still managed by the configured Baota/ACME task.'
echo 'Validate first run: systemctl start onebyone-cdn-cert.service'
echo 'Read status: systemctl status onebyone-cdn-cert.service; journalctl -u onebyone-cdn-cert.service'
