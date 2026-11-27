#!/bin/bash
# Run on the backend VM from /opt/app/BlackBear after git pull.
set -e
cd /opt/app/BlackBear
/opt/app/venv/bin/pip install -q -r requirements.txt
./sandbox/build.sh
cp deploy/blackbear.service /etc/systemd/system/blackbear.service
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now blackbear
systemctl restart blackbear
systemctl reload caddy || systemctl restart caddy
