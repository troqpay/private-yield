# TroqPay Private Yield

**Private B2B payments on Stellar that keep earning yield.**

When a company pays a supplier in stablecoins on a public chain, every
competitor can see who it pays, how much and how often. Shielded pools fix
that, but nobody leaves money in a pool that earns nothing, and a pool nobody
stays in protects nobody.

Private Yield puts the protected balance into a yield vault. A company's
protected money is held as shares of a [DeFindex](https://defindex.io) vault
inside a [Stellar Private Payments](https://github.com/NethermindEth/stellar-private-payments)
(SPP) pool. The shares keep earning while they stay private, and private
payments are paid in those shares. Staying protected becomes the default,
which also makes the pool larger and the privacy stronger for everyone.

TroqPay integrates it into its Global Account, a business account already in
production (Private Yield itself runs on testnet): the company picks **who**
and **how much** in the usual Send screen, confirms once, and the payment goes
out privately, with no XLM and no pool, keys or proofs on screen.

> Demo video: _link added at submission_ · Built for HackMeridian 2026 (Scale track)

## What it does

| | |
|---|---|
| Pay privately | One confirmation in Send. If the protected balance is short, public USDC enters the vault (rounded up to the next 100 USDC, so the entry does not reveal the payment) and the shares enter the pool before the private transfer. |
| Keep earning | Protected value is vault shares; their USDC value rises as the vault earns. The vault takes a 20% performance fee on yield. |
| Receive | The recipient sees the payment and who sent it, valued in USDC. |
| Prove | The recipient creates a selective-disclosure receipt for one payment. Anyone verifies it against the chain, with no wallet and no login. |
| Spend publicly | A public send larger than the public balance releases protected value first (pool, then vault), automatically. |
| Stay compliant | Only companies that passed KYB are admitted to the pool allowlist; the operator holds a traceable view key, like a bank sees its ledger; the pools' blocklist can freeze a key (supported, not yet exercised in this demo). |

## How it works

```
Company browser (Privy wallet, no XLM)
  ├─ SPP SDK: keys, notes, Groth16 proofs, pool transactions ──► Stellar RPC
  └─ Privy signer: signs raw hashes only (SEP-53 message, auth entry, tx hash)
Sponsor backend (operator)
  ├─ checks every transaction: one call, allowed contract, company's own wallet, fee cap
  ├─ wraps it in a fee bump, so the company pays no network fee
  └─ builds the vault deposit / withdrawal the wallet signs
Stellar Testnet
  ├─ DeFindex vault over Circle USDC (factory-created, not upgradable) → SEP-41 shares
  ├─ SPP pool holding the shares (allowlist + blocklist ASP, traceable view key)
  └─ SPP pools for USDC and EURC, key registry, ASP contracts, verifier
```

Nothing is forked. The vault is a standard DeFindex vault created by the public
factory, and the pools are standard SPP contracts from commit `ea39d0c`. The
new code is the product layer: the Private Yield rules, the Privy signer, the
sponsor checks and the payer lookup. Details in [docs/architecture.md](docs/architecture.md)
and [docs/private-yield.md](docs/private-yield.md).

## Stellar stack

- **Stellar RPC only, no Horizon.** Simulation, submission and polling;
  `getEvents` and `getTransaction` for the payer lookup; `getAccountEntry` and
  `getTrustline` for balances in the smoke tests.
- **Soroban contracts:** SPP pools with BN254 Groth16 verification, ASP
  membership and non-membership trees, a key registry, and a DeFindex vault.
- **SEP-41:** vault shares are the pool's token.
- **Fee bumps:** a sponsor pays every fee; companies hold no XLM.
- **SEP-53:** the message a company signs once to derive its privacy keys.
- **Stellar asset contracts** for Circle USDC and EURC.

## Repository

| Path | What |
|---|---|
| `src/core/` | Generic modules: `private-yield.ts` (payment and top-up rules), `privy-signer.ts` (SPP wallet over Privy raw-hash signing), `receipt.ts` (receipts and verification links) |
| `server/` | Sponsor checks and fee bump, vault calls, share price (`sponsor.ts`); payer lookup over RPC (`payers.ts`) |
| `src/` | Environment check page and the smoke-test hooks |
| `src/config/` | Testnet manifests (contract IDs are public) and the circuit lock |
| `scripts/` | Deploy scripts and `smoke.mjs` |
| `tests/` | Unit tests for `core` and `server` |
| `docs/` | Architecture, privacy model, Private Yield, evidence, roadmap |

The integration into the TroqPay Global Account (onboarding, KYB, admission,
compliance operations) is proprietary. This repository holds the open
components, the deploy scripts and a reproducible test flow.

## Run it

Node 20+ and Microsoft Edge or Chrome.

```bash
npm install
npm test              # unit tests
npm run typecheck
npm run dev           # environment check: SDK boot, pools, public feed
npm run smoke         # the same check in a headless browser
```

**Verify a receipt (no keys).** Open the verification link a recipient shares
(TroqPay verification page: _link added at submission_), or check the
transaction hashes in [docs/evidence.md](docs/evidence.md) on Stellar Expert.

**Pay privately with your own testnet identities.** Create and fund two
Stellar CLI identities named `privatepay-a` and `privatepay-b`
(`stellar keys generate --fund privatepay-a --network testnet`), then:

```bash
npm run smoke -- --transact             # public SPP XLM pool: register, deposit, pay, receipt, verify
npm run smoke -- --transact --fee-bump  # same, with a sponsor identity troqpay-hack-sponsor paying fees
```

The smoke test signs in Node with the CLI keys; no key enters the page.

**Deploy your own Private Yield.** `scripts/deploy-pools.sh`,
`scripts/create-yield-vault.sh` and `scripts/deploy-share-pool.sh` recreate the
ASP, pools, vault and share pool with you as admin (each script lists its
inputs). Then point `src/config/troqpay-testnet-deployments.json` at your
contracts and run `npm run smoke -- --yield`: admission, entry, private
payment, receipt, view-key audit, simulated yield and redemption. It expects
the Stellar CLI identities `troqpay-privatepay-admin` (the admin you deployed
with) and `troqpay-hack` (holds test USDC for the simulated yield), and the
view key file at `$PRIVATE_YIELD_KEYS_DIR/keys/troqpay-gvk-d.json`. The TroqPay pools only accept companies the
operator admitted, as a real institution would.

## Limits

- **Testnet only**, test assets only.
- **Not audited.** SPP is a preview protocol without a trusted-setup ceremony;
  the vault has no audit of this configuration.
- **Yield is simulated** on testnet (USDC sent to the vault); there is no
  strategy behind it.
- **Entries and exits are public.** The pool hides who pays whom and, for value
  that circulates between companies, how much. With few companies, an
  observer can still match an entry with an exit of the same size.
- **History window.** Stellar RPC keeps about 7 days. A new browser cannot
  rebuild a pool older than that without an SPP bootnode, and the payer lookup
  only covers that window; production records each pool call at the sponsor.
- **Keys.** A company's privacy keys come from one wallet signature and stay in
  its browser; the view key and the ASP admin key need an HSM or TEE in
  production.

More in [docs/privacy-model.md](docs/privacy-model.md) and [docs/roadmap.md](docs/roadmap.md).

## Credits

- [Stellar Private Payments](https://github.com/NethermindEth/stellar-private-payments)
  by Nethermind: pools, ASP, circuits and SDK.
- [DeFindex](https://github.com/paltalabs/defindex) by Paltalabs: the vault and
  its factory, used as deployed instances.
- [Privy](https://privy.io): embedded wallets with raw-hash signing.

See [NOTICE](NOTICE). Code in this repository: [Apache-2.0](LICENSE).
