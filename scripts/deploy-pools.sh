#!/usr/bin/env bash
# Deploys the Private Yield privacy infrastructure with the Stellar Private
# Payments deploy script: ASP allowlist + blocklist, key registry, verifier,
# and USDC and EURC pools with a traceable view key.
#
#   SPP_DIR    checkout of NethermindEth/stellar-private-payments at ea39d0c
#              (the commit whose circuits match stellar-private-payments@0.2.1)
#   DEPLOYER   Stellar CLI identity; it becomes the admin of every contract
#   GVK_PUB    view key public file from `cargo run -p gvkey-gen -- generate`
#   KDF_DOMAIN text companies see in the message they sign to derive their keys
#
# Needs the Stellar CLI, Rust, jq and bc. On Windows, run in Git Bash with
# LF line endings. The manifest lands in $SPP_DIR/deployments/testnet/.
set -euo pipefail
: "${SPP_DIR:?set SPP_DIR}" "${DEPLOYER:?set DEPLOYER}" "${GVK_PUB:?set GVK_PUB}"
KDF_DOMAIN="${KDF_DOMAIN:-TroqPay}"

# Circle USDC and EURC on testnet, with their Stellar asset contracts.
USDC=classic:USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5:CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
EURC=classic:EURC:GB3Q6QDZYTHWT7E5PVS3W7FUT5GVAFC5KSZFFLPU25GO7VTC3NM2ZTVO:CCUUDM434BMZMYWYDITHFXHDMIVTGGD6T2I5UKNX5BSLXLW7HVR4MCGZ

cd "$SPP_DIR"
[[ "$(git rev-parse --short=7 HEAD)" == "ea39d0c" ]] || { echo "SPP_DIR must be at ea39d0c" >&2; exit 1; }
deployments/scripts/deploy.sh testnet \
  --deployer "$DEPLOYER" \
  --asp-levels 10 \
  --pool-levels 20 \
  --max-deposit 100000000000 \
  --kdf-domain "$KDF_DOMAIN" \
  --gvk-authority-pubkey-file "$GVK_PUB" \
  --pool "allowlist-blocklist:gvk-traceable:$USDC" \
  --pool "allowlist-blocklist:gvk-traceable:$EURC"
