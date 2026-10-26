#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ $EUID -ne 0 ]]; then echo 'Run this installer with sudo.' >&2; exit 1; fi
source_dir=$(cd -- "$(dirname -- "$0")/../.." && pwd)
case "$(uname -m)" in x86_64) node_arch=x64 ;; aarch64) node_arch=arm64 ;; *) echo 'Unsupported CPU.' >&2; exit 1 ;; esac
if systemctl is-active --quiet chamber-farm; then echo 'Stop the existing service before upgrading.' >&2; exit 1; fi
if ! id chamber-farm &>/dev/null; then
    useradd --system --user-group --home-dir /var/lib/chamber-farm --shell /usr/sbin/nologin chamber-farm
fi
install -d -m 755 /opt/chamber-farm /opt/chamber-farm/app /opt/chamber-farm/node
install -d -o chamber-farm -g chamber-farm -m 700 /var/lib/chamber-farm
apt-get update -qq
DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends ca-certificates curl xz-utils
download_dir=$(mktemp -d /tmp/chamber-node.XXXXXXXX)
trap 'rm -f -- "$download_dir/SHASUMS256.txt" "$download_dir/selected.sha256" "$download_dir"/*.tar.xz; rmdir -- "$download_dir"' EXIT
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$download_dir/SHASUMS256.txt"
mapfile -t matching_files < <(awk '{print $2}' "$download_dir/SHASUMS256.txt" | grep -E "^node-v24\.[0-9]+\.[0-9]+-linux-${node_arch}\.tar\.xz$")
if [[ ${#matching_files[@]} -ne 1 ]]; then echo 'Cannot select a unique official Node 24 binary.' >&2; exit 1; fi
node_archive=${matching_files[0]}
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 \
    "https://nodejs.org/dist/latest-v24.x/$node_archive" -o "$download_dir/$node_archive"
awk -v file="$node_archive" '$2==file {print}' "$download_dir/SHASUMS256.txt" > "$download_dir/selected.sha256"
(cd "$download_dir" && sha256sum --check selected.sha256)
tar -xJf "$download_dir/$node_archive" --strip-components=1 -C /opt/chamber-farm/node
source_files=(index.js config.js state.js strategy.js decision.js interactions.js post-guard.js parser.js engine.js transport.js session.js betting-controls.js wallet-actions.js package.json package-lock.json README.md STRATEGY.md .env.example)
for file in "${source_files[@]}"; do install -m 644 "$source_dir/$file" "/opt/chamber-farm/app/$file"; done
export PATH=/opt/chamber-farm/node/bin:$PATH
(umask 022; cd /opt/chamber-farm/app && npm ci --omit=dev --ignore-scripts --no-audit --no-fund)
install -m 755 "$source_dir/deploy/lightsail/start-service.sh" /opt/chamber-farm/start-service.sh
install -m 644 "$source_dir/deploy/lightsail/status.js" /opt/chamber-farm/status.js
install -m 755 "$source_dir/deploy/lightsail/chamberctl" /usr/local/bin/chamberctl
install -m 644 "$source_dir/deploy/lightsail/chamber-farm.service" /etc/systemd/system/chamber-farm.service
if [[ ! -e /var/lib/chamber-farm/.env ]]; then
    install -o chamber-farm -g chamber-farm -m 600 "$source_dir/.env.example" /var/lib/chamber-farm/.env
fi
if [[ ! -e /var/lib/chamber-farm/state.json ]]; then
    runuser -u chamber-farm -- /opt/chamber-farm/node/bin/node -e '
        const fs=require("node:fs");
        const file="/var/lib/chamber-farm/state.json";
        fs.writeFileSync(file, JSON.stringify({version:1,baseBet:1,nextBet:1,lossStreak:0,rounds:0,pending:null,daily:null,paused:true,nextRoundAt:0,betting:{mode:"martingale",sequence:[],resetAt:32,step:0}},null,2)+"\n",{mode:0o600});
    '
fi
systemd-analyze verify /etc/systemd/system/chamber-farm.service
systemctl daemon-reload
systemctl enable chamber-farm
echo 'Installed and enabled. Service has NOT been started; configure credentials and verify the paused state first.'
