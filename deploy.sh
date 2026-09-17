#!/usr/bin/env bash
set -euo pipefail
# API/backend only. Frontend, workers and bots are never implicitly redeployed.
REPO_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$REPO_DIR/scripts/security/safe_release.py" "$@"
