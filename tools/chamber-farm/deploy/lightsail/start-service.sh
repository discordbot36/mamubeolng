#!/usr/bin/env bash
set -euo pipefail
umask 077
fifo=/run/chamber-farm/commands
if [[ -e "$fifo" && ! -p "$fifo" ]]; then
    echo 'Control path is not a FIFO; refusing to start.' >&2
    exit 1
fi
if [[ ! -p "$fifo" ]]; then mkfifo -m 600 "$fifo"; fi
# A read/write descriptor prevents stdin from closing between SSH commands.
# exec leaves Node as systemd's main process so SIGTERM reaches the runner.
exec 3<>"$fifo"
exec /opt/chamber-farm/node/bin/node --env-file=/var/lib/chamber-farm/.env /opt/chamber-farm/app/index.js <&3
