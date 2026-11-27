#!/bin/bash
# Run on the backend VM from /opt/app/BlackBear after git pull.
set -e
cd /opt/app/BlackBear
/opt/app/venv/bin/pip install -q -r requirements.txt
./sandbox/build.sh
# Build the React frontend against the real API (same origin)
(cd frontend && npm ci --silent && VITE_USE_MOCK=false VITE_API_BASE= npm run build --silent)
cp deploy/blackbear.service /etc/systemd/system/blackbear.service
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now blackbear
systemctl restart blackbear
systemctl reload caddy || systemctl restart caddy
