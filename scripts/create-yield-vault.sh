#!/usr/bin/env bash
# Creates the Private Yield vault through the public DeFindex factory: a
# standard DeFindex vault over Circle USDC, not upgradable, so nobody can
# change the code behind the shares the pool holds. Then sets the performance
# fee to 20% of the yield.
#
#   ADMIN_ID   Stellar CLI identity that takes every vault role
#
# No strategy is attached on testnet, so yield is simulated by sending USDC to
# the vault. On mainnet, attach a strategy (for example Blend) at creation.
set -euo pipefail
: "${ADMIN_ID:?set ADMIN_ID}"
FACTORY=CDSCWE4GLNBYYTES2OCYDFQA2LLY4RBIAX6ZI32VSUXD7GO6HRPO4A32 # DeFindex factory, testnet
USDC_SAC=CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA
SOROSWAP_ROUTER=CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD
ADMIN=$(stellar keys address "$ADMIN_ID")

# Roles: 0 emergency manager, 1 fee receiver, 2 manager, 3 rebalance manager.
# The vault name must stay short: long names trap the constructor.
VAULT=$(stellar contract invoke --id "$FACTORY" --source-account "$ADMIN_ID" --network testnet -- \
  create_defindex_vault \
  --roles "{\"0\":\"$ADMIN\",\"1\":\"$ADMIN\",\"2\":\"$ADMIN\",\"3\":\"$ADMIN\"}" \
  --vault_fee 1000 \
  --assets "[{\"address\":\"$USDC_SAC\",\"strategies\":[]}]" \
  --soroswap_router "$SOROSWAP_ROUTER" \
  --name_symbol '{"name":"TroqPay Yield","symbol":"tyUSDC"}' \
  --upgradable false | tr -d '"\r')
echo "vault: $VAULT"

stellar contract invoke --id "$VAULT" --source-account "$ADMIN_ID" --network testnet -- lock_fees --new_fee_bps 2000
echo "fees: $(stellar contract invoke --id "$VAULT" --source-account "$ADMIN_ID" --network testnet --send=no -- get_fees)"
