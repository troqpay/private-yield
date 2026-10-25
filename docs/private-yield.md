# Private Yield: DeFindex shares inside an SPP pool

## Why

A shielded pool is only as private as it is large. Companies do not leave
money in a pool that earns nothing, so shielded balances stay small and
short-lived, and the privacy stays weak. Private Yield makes the protected
balance a yield position: protected value is held as vault shares, which keep
earning inside the pool.

## Composition, not a fork

| Piece | Source | Changed? |
|---|---|---|
| Vault | Standard DeFindex vault, created by the public factory with `upgradable = false` | No code change. Configuration only: Circle USDC, roles, a 20% performance fee (`lock_fees`). |
| Share pool | Standard SPP `pool-gvk` contract from commit `ea39d0c`, constructed with the vault share as its token | No code change. |
| Product layer | This repository | New |

Because the vault cannot be upgraded, nobody can change the code behind the
shares the pool holds. The vault shares are SEP-41 tokens with 7 decimals,
which is all the SPP pool needs from its token.

## Rules

All amounts are in stroops (7 decimals) for both USDC and shares.

- **Price.** `usdcPerShare` comes from simulating the vault's
  `get_asset_amounts_per_shares(1 share)`.
- **Shares for a payment.** `sharesFor(usdc) = ceil(usdc × 10^7 / usdcPerShare)`,
  so the recipient never gets less than the amount.
- **Top-up.** If the protected shares are short, the USDC shortfall (plus one
  stroop for vault rounding) is rounded up to the next 100 USDC and capped by
  the public balance. The entry does not reveal the payment, and the rest stays
  protected and earning.
- **Release.** A public payment that needs protected value takes
  `sharesFor(missing) + 1` shares out of the pool and redeems them.
- **Value shown.** Protected balance = shares × `usdcPerShare` / 10^7.

## Fees

The vault charges a performance fee of 20% of the yield. DeFindex keeps a part
of that fee, set by its factory, not by the vault. On testnet the vault has no
strategy, so there is no yield to charge; the demo simulates yield by sending
USDC to the vault, which raises the share price for every holder, protected
shares included.

## Measured on testnet

A company with 5 USDC to pay and no protected balance: a 90 USDC vault entry
(capped by its public balance), the shares into the pool, and a private
transfer of 4.5454546 shares at 1.1 USDC per share, i.e. 5.00 USDC. Hashes in
[evidence.md](evidence.md). Network fees, paid by the sponsor: about 0.25 XLM
for the vault deposit and 6 to 6.5 XLM per pool transaction.
