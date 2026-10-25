#!/usr/bin/env bash
# Runs the open demo locally against Stellar Testnet. The demo operator keys
# come from the Stellar CLI identities pyd-admin and pyd-treasury, and the
# demo view key from the local keys folder, straight into the environment;
# nothing is printed.
#
#   scripts/run-demo-local.sh         build, then serve page and operator on :8080
#   scripts/run-demo-local.sh --dev   operator on :8080 and Vite on :5173
#
#   PRIVATE_YIELD_KEYS_DIR  folder with keys/demo/demo-gvk-d.json
#                           (default: $LOCALAPPDATA/troqpay-hackmeridian)
set -euo pipefail
KEYS_DIR="${PRIVATE_YIELD_KEYS_DIR:-${LOCALAPPDATA:-$HOME}/troqpay-hackmeridian}"

DEMO_ASP_ADMIN_SECRET="$(stellar keys secret pyd-admin)"
DEMO_TREASURY_SECRET="$(stellar keys secret pyd-treasury)"
DEMO_VIEW_KEY="$(jq -r .privateKey "$KEYS_DIR/keys/demo/demo-gvk-d.json")"
export DEMO_ASP_ADMIN_SECRET DEMO_TREASURY_SECRET DEMO_VIEW_KEY

if [[ "${1:-}" == "--dev" ]]; then
  node server/demo/main.ts &
  operator=$!
  trap 'kill "$operator"' EXIT
  node node_modules/vite/bin/vite.js
else
  npm run build
  npm start
fi
