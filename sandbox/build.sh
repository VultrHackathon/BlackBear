#!/bin/bash
# Build sandbox images on the sandbox host (run from the backend: DOCKER context "sandbox").
set -e
cd "$(dirname "$0")"
CTX=${SANDBOX_DOCKER_CONTEXT:-sandbox}
docker --context "$CTX" build -q -t blackbear/browser:latest browser
docker --context "$CTX" build -q -t blackbear/proxy:latest proxy
docker --context "$CTX" network inspect bb-egress >/dev/null 2>&1 || docker --context "$CTX" network create bb-egress
