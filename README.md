# TroqPay Private Yield

**Private B2B payments on Stellar, with protected balances represented by yield-vault shares.**

When a company pays a supplier with a public-chain stablecoin, competitors can
observe counterparties, amounts and frequency. Stellar Private Payments (SPP)
can hide payment details, but idle shielded balances do not earn. Private Yield
composes SPP with a DeFindex vault: vault shares are held and transferred inside
the private pool, so privacy and the yield-bearing representation coexist.

## Who this is for

TroqPay serves Brazilian companies that sell locally and operate globally: an
importer paying a supplier in Asia, a software company paying contractors
abroad, an exporter being paid by a buyer in Mexico. Today they pay in public
USDC from the TroqPay Global Account, and every transfer leaves a public record
of the supplier, the price and the cadence, which a competitor, a customer or
the supplier's other clients can read on any explorer. The alternative, a
shielded pool, leaves the money idle, and a treasury that already earns on its
Digital Dollar balance will not park it where it earns nothing.

With Private Yield the company keeps the normal Send screen and chooses only
who and how much. If the recipient is another TroqPay company, the payment
leaves privately, from a protected balance that keeps earning. If not, it goes
out publicly as before. Nothing else changes for the user: no XLM, no pool, no
keys on screen. The recipient sees the payer's name on its statement and can
prove one payment to an accountant or a bank with a receipt that reveals
nothing else.

## Why this is new

Private pools on public chains stay small because a shielded balance does not
earn, and a small pool protects nobody. Private Yield removes that trade-off:
the protected balance **is** the yield position (DeFindex vault shares held
inside the SPP pool), so staying protected becomes the default rather than a
sacrifice, and every company that joins makes the pool larger and the privacy
stronger for everyone already in it. The privacy layer is paid for by the
20% performance fee on yield and a per-payment fee, not by locking capital.

It also fits how regulated B2B payments work: only companies that passed KYB
are admitted, the operator holds a traceable view key (as a bank sees its own
ledger), and the recipient, not the operator, chooses what to disclose and to
whom. Private for the market, auditable by TroqPay.

The judged product is this flow inside the existing TroqPay Global Account. The
TroqPay application and API remain proprietary. This repository is the public,
reproducible core and evaluator harness: rules, signer, sponsor checks, receipt
verification, deployment manifests, tests and a browser smoke test.

- [Hosted TroqPay testnet product](https://troqpay-app-stellar-testnet.up.railway.app/)
- [Walletless receipt verifier](https://troqpay-app-stellar-testnet.up.railway.app/privatepay/verify)
  · [verify a real receipt now](https://troqpay-app-stellar-testnet.up.railway.app/privatepay/verify#r=eyJ2ZXJzaW9uIjoxLCJjaXJjdWl0Ijp7Im5hbWUiOiJzZWxlY3RpdmVEaXNjbG9zdXJlXzEiLCJsZXZlbHMiOjIwLCJuTm90ZXMiOjEsInZrSGFzaCI6IjB4NmZjMTFlMjgxYTc0OTYzOTc2MmRmNzIwNDUwYmUxMTgyMDUxYzkzZDgzZTZjZmYzNjI0ODg5NjUwOGQ4NWVlMiJ9LCJjb250ZXh0Ijp7Im5ldHdvcmsiOiJ0ZXN0bmV0IiwicG9vbEFkZHJlc3MiOiJDQlZWQTdMSjZQSjJDRzQ3UkE0SkxLRVJIVVZPNTZBQUlUNERMVEJMRFdaVkFCTTNHVzI2N0EyNCIsImF1dGhvcml0eUxhYmVsIjoiVHJvcVBheSBDb21wbGlhbmNlIChkZW1vKSIsImF1dGhvcml0eUlkZW50aXR5UGF5bG9hZEhleCI6IjB4NDJlMDEyN2U3ZWEwMjgwOTk5NzRkOTU5ZjA1ZDcxMmEiLCJwdXJwb3NlIjoiYjJiLXBheW1lbnQtZXZpZGVuY2UiLCJjb250ZXh0Tm9uY2UiOiIweDExNjZmYWMxODA4MDFhYjMxZDhiZTZhYzUwNDRmMjcwY2RhMjBmMzdlZGFlNDc1MTg1ODg4NzlmMmI4OTMwMjYifSwicHVibGljSW5wdXRzIjp7InJvb3RzIjpbIjB4MjUxOTRkZDhkNTNiY2ZkZGJiZWZmZDNmMzE0MTNkZDczYTg0NTk1YjJlMzAwYjgzMGM1NjY4MDM1MGI5ZmVjOSJdLCJub3RlQ29tbWl0bWVudHMiOlsiMHgyMWNkODQ3YzAyMTZlYjdiNzMwYjg1NTkyMDJmNjRjYjRjOWFmZGYxZmYzYWU5ZmQ1Mjc0ZGM5NzA3YzY5MWM1Il0sImV4dENvbnRleHRIYXNoIjoiMHgxMWZiYTQ2MDk3NjA2NGNkZWFiYWMwMjg0MGUyNDNkZWYwNTk0NDdlNDhmOTk2Y2M3NzI0ZmFkOTMzNDdmZGZiIiwibnVsbGlmaWVycyI6WyIweDIzMGNkODc4NDI5NTQ5MjVkZDVmMjU2OWE2YTViMGVlMDRkNWJhN2FiNDEwYTVjZDJkMzAyYjhlMDQ3N2NiZTUiXSwiYW1vdW50cyI6WyI0MDAwMDAwMCJdfSwicHJvb2ZDb21wcmVzc2VkSGV4IjoiMHg1MGU0ZTk2OGM5ODU5MDEzNmU0NGJjOTdmMjFmYjI0ZDRkMTMwNjljOWE5M2YyOTlkOGQyYzBkMWJjNTEwOWFmMzNkMzlhMDRhNWQwNjVjNzI1MTk3NjM3ZmUxM2I2YzgzOTQwNDA5ZDdlY2Y1ZTZhNWU4NmM1YTgxM2U1YTkyYzA5ZjEwMzJjNzQxYmQ5MzU4YmRhNmNhMzg5NDUxZWMzYzAyOGVhYmRjM2JkMjY5NTI3Y2U3NzYwYjBlYWFlOTc3YmRjYjZlNzE4NTM4Zjk2MzBhMjRhNTdmMjlmMDc2NmIyYzhmNjA0Yjc1MDBiNTc1Njk2MTQ4NTYzNjFjNzA3IiwiaXNzdWVkQXQiOiIyMDI2LTEwLTIzVDE3OjA0OjIzWiJ9)
  (a 4-share private payment on the Private Yield pool; the receipt JSON is in
  [docs/receipt-example.json](docs/receipt-example.json))
- [Latest private payment on Stellar Expert](https://stellar.expert/explorer/testnet/tx/88363ba321522aabbfe380e03c170e4d20d9e8e5c1e215385a8cf710cd5b6bd1)
- Built for HackMeridian 2026, Scale path

## Judge quick start

Requirements: Node.js 22.18+ and Chrome or Microsoft Edge.

```bash
git clone https://github.com/troqpay/private-yield.git
cd private-yield
npm ci
npm run check
npm start
```

`npm start` builds and serves the evaluator page at `http://localhost:8080`.
In a second terminal, run the browser smoke test:

```bash
npm run smoke -- --url http://127.0.0.1:8080/
```

Expected result: `stage: "ready"`, a non-empty public feed and no console
errors. This path needs no wallet, API key, operator key or environment file.
Without operator keys the server intentionally serves the evaluator pages only;
transactional operator endpoints return `503` and are not part of this check.

For a self-contained testnet transaction using disposable in-memory accounts:

```bash
npm run smoke:transactional
```

That command uses Friendbot to fund two ephemeral testnet accounts, registers
their privacy keys, deposits 5 test XLM, transfers 2 privately, creates a
selective-disclosure receipt and verifies its four checks. Secret keys stay in
the Node process and are never printed or written to the repository.

Set `PLAYWRIGHT_CHANNEL=chrome` or
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium` when automatic browser
detection is not suitable.

## Product flow

| Step | What happens |
|---|---|
| Activate | A TroqPay company gets a sponsored Stellar wallet and registers its private-payment keys. |
| Protect | Public test USDC enters a DeFindex vault; the resulting SEP-41 shares enter an SPP pool. |
| Pay | The company chooses a recipient and amount in the normal Send flow and confirms once. |
| Receive | An admitted recipient sees the payment and identified payer inside TroqPay. |
| Prove | The recipient creates a selective-disclosure receipt for one payment. Anyone can verify it without a wallet or login. |
| Spend | A public send can release protected value through the pool and vault when necessary. |

The production design admits companies after compliance approval. For the
HackMeridian testnet demo, Etherfuse approval is simulated because its sandbox
approval flow changed during the event. Wallets, USDC trustlines, contract
calls, private payments, receipts and verification remain real testnet actions.

## Architecture

```text
Company browser (Privy wallet, no XLM)
  ├─ SPP SDK: keys, notes, Groth16 proofs and pool calls ──► Stellar RPC
  └─ Privy signer: SEP-53 message, auth-entry and transaction hashes

Sponsor backend
  ├─ accepts one allowed contract call from the company's wallet
  ├─ enforces the contract and fee cap
  └─ wraps the signed transaction in a fee bump

Stellar Testnet
  ├─ DeFindex vault over Circle test USDC → SEP-41 shares
  ├─ SPP pool holding the shares
  └─ allowlist, blocklist, key registry and Groth16 verifier contracts
```

Nothing is forked. The vault is a standard DeFindex vault created through its
factory. The pools are standard SPP contracts from commit `ea39d0c`. TroqPay's
code is the composition and product layer: Private Yield rules, Privy signer,
sponsor validation, payer lookup, receipts and the Global Account experience.

The implementation uses Stellar RPC for simulation, submission, polling,
events and ledger-entry reads. It does not depend on Horizon.

## Repository map

| Path | Contents |
|---|---|
| `src/core/` | Private Yield rules, Privy-compatible signer and receipt helpers |
| `server/` | Sponsor validation, fee bump, vault calls, payer lookup and evaluator server |
| `src/demo/` | Public evaluator UI and disposable-company flow |
| `src/config/` | Public testnet contract manifests and pinned circuit metadata |
| `scripts/` | Deployment, fee measurement and browser smoke tests |
| `tests/` | Unit and service tests for the public core |
| `docs/` | Architecture, privacy model, evidence and roadmap |

## Testnet evidence

The latest end-to-end TroqPay payment used a new US company and paid an
existing TroqPay company 2 test USDC privately:

- public USDC funding: `67abf12fbc1c6c5de3e0faf68858d1bd7563781cbeb13f00917c5355e2bef2e1`
- protected-balance entry: `eec84219e71a1b08824d367524590bcb7e30664da132ea813586799c9455d105`
- private payment: `88363ba321522aabbfe380e03c170e4d20d9e8e5c1e215385a8cf710cd5b6bd1`

The private payment is successful in ledger `5,391,271`. Public observers see
the payer call the pool, but not a plain recipient or amount. Additional
transactions and contract addresses are in [docs/evidence.md](docs/evidence.md).

## HackMeridian delivery

TroqPay entered the Scale category as an existing Global Account product. The
table is the honest starting point and end point of the hackathon work; the
existing TroqPay platform and the upstream SPP and DeFindex components are not
claimed as hackathon work.

| | Starting point (built 21–24 Oct, before the event) | Delivered during HackMeridian (25–26 Oct) |
|---|---|---|
| Product | Global Account in production; on testnet, SPP + DeFindex composed (pools, vault, share pool) and private payments wired into the Send flow, the statement and a receipt page, tested with one real company and a CLI test identity | The experience finished and validated end to end by **two distinct TroqPay companies** onboarded during the event, with the fixes that made it hold up for real users |
| Paying | Automatic private routing and sponsor fee bump in place; first-use failures (Privy signing stalls, cold prover timeouts, silent activation errors) | Privy wallet proxy wait and signing timeout, proof warm-up, visible activation state with retry, balance UX aligned with automatic protection |
| Receiving | Statement lines with the payer recorded from the chain | Trust states for the receiving side, protected-balance synchronisation made clear, internal metadata hidden from receipts |
| Trust | Sponsor validated contract, method, source wallet, fee cap and signature | Internal rate limits sized for two live companies; security review of the public repository run and its three findings closed |
| Onboarding | Brazilian company only | Country-adaptive onboarding exercised with a new company; Etherfuse approval simulated for the demo |
| Evaluator | Nothing public | This repository: public core, deployment scripts, tests, browser smoke, open demo page, evidence and a verifiable receipt |

AI-assisted development used Codex and Claude Code for implementation,
debugging, tests, documentation and submission preparation. The team reviewed
and validated the resulting code and testnet transactions.

## Security notes

- **No secret is in this repository or its history.** Contract IDs, authority
  public keys, hashes and the hosted demo URL are public testnet evidence.
- **The demo view key is not the TroqPay view key.** The open demo runs on its
  own pools, allowlist and viewing key. Publishing the demo key reveals demo
  pool activity only, never the TroqPay pools.
- **Privileged smoke modes stay on this machine.** `--transact`,
  `--troqpay-pools`, `--yield`, `--inspect` and `--pay-to` sign with local
  Stellar CLI identities and read the local view key, so they refuse any target
  that is not `http://localhost` or `http://127.0.0.1`. A remote `--url` is
  read-only and a remote `--demo` behaves as a visitor, with no local keys.
- **The demo operator is meant for local use.** Its admission limit (20 valid
  admissions per peer per hour) only counts well-formed requests, forgets
  idle peers and caps how many it tracks. Put it behind an edge rate limit and
  a trusted-proxy setup before exposing it on the Internet.

## Limits

- **Testnet only.** All assets and accounts are test assets.
- **Not audited.** SPP is a preview protocol without a trusted-setup ceremony;
  this vault configuration is also unaudited.
- **Yield is simulated.** Test USDC is sent to the vault; there is no live
  investment strategy behind the demo yield.
- **KYB approval is simulated only in the demo.** It must use real provider and
  compliance decisions before production.
- **Entries and exits are public.** The pool hides payment details, but a small
  anonymity set can still allow correlation.
- **RPC history is bounded.** A production service must persist the indexed
  events required for recovery and payer attribution.
- **Operator secrets are not distributed.** Sponsor, ASP admin and view keys
  require controlled production custody such as an HSM or TEE.

More detail: [architecture](docs/architecture.md),
[privacy model](docs/privacy-model.md),
[Private Yield design](docs/private-yield.md) and
[roadmap](docs/roadmap.md).

## Credits and license

- [Stellar Private Payments](https://github.com/NethermindEth/stellar-private-payments)
  by Nethermind: pools, ASP, circuits and SDK.
- [DeFindex](https://github.com/paltalabs/defindex) by Paltalabs: vault and factory.
- [Privy](https://privy.io): embedded wallet and raw-hash signing.

See [NOTICE](NOTICE). Code in this repository is licensed under
[Apache-2.0](LICENSE).
