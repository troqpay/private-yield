#!/usr/bin/env bash
# Deploys the Private Yield pool: a standard SPP pool (pool-gvk) whose token is
# the vault share, a SEP-41 token. It reuses the ASP, verifier and view key of
# deploy-pools.sh, so one admission covers every pool.
#
#   SPP_DIR    the same checkout, after deploy-pools.sh built target/stellar/
#   ADMIN_ID   the identity deploy-pools.sh used as DEPLOYER
#   VAULT      vault address from create-yield-vault.sh
#   MANIFEST   deployments.json written by deploy-pools.sh
#   KDF_DOMAIN the same domain as the other pools
#
# Afterwards, add the pool to src/config/ with asset {"kind":"contract",
# "contractId":"<VAULT>","symbol":"tyUSDC"} and its deployment ledger.
set -euo pipefail
: "${SPP_DIR:?set SPP_DIR}" "${ADMIN_ID:?set ADMIN_ID}" "${VAULT:?set VAULT}" "${MANIFEST:?set MANIFEST}"
KDF_DOMAIN="${KDF_DOMAIN:-TroqPay}"
field() { jq -r "$1" "$MANIFEST"; }

cd "$SPP_DIR"
stellar ledger latest --network testnet | grep -E '^Sequence' # the pool's deployment ledger
stellar contract deploy --wasm target/stellar/pool-gvk.wasm --source-account "$ADMIN_ID" --network testnet -- \
  --admin "$(field .admin)" \
  --token "$VAULT" \
  --verifier "$(field .verifiers.AB_gvk_T)" \
  --asp-membership "$(field .asp_membership)" \
  --asp-non-membership "$(field .asp_non_membership)" \
  --asp-membership-wasm-hash "$(field .asp_membership_wasm_hash)" \
  --asp-non-membership-wasm-hash "$(field .asp_non_membership_wasm_hash)" \
  --maximum-deposit-amount 100000000000 \
  --levels 20 \
  --policy-flags 3 \
  --kdf-domain "$KDF_DOMAIN" \
  --admin-view-key "$(jq -c '.pools[0].gvkAuthorityPubKey' "$MANIFEST")" \
  --gvk-mode 2
