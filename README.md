# TroqPay Private Yield

**Private B2B payments on Stellar, with protected balances represented by yield-vault shares.**

When a company pays a supplier with a public-chain stablecoin, competitors can
observe counterparties, amounts and frequency. Stellar Private Payments (SPP)
can hide payment details, but idle shielded balances do not earn. Private Yield
composes SPP with a DeFindex vault: vault shares are held and transferred inside
the private pool, so privacy and the yield-bearing representation coexist.

The judged product is this flow inside the existing TroqPay Global Account. The
TroqPay application and API remain proprietary. This repository is the public,
reproducible core and evaluator harness: rules, signer, sponsor checks, receipt
verification, deployment manifests, tests and a browser smoke test.

- [Hosted TroqPay testnet product](https://troqpay-app-stellar-testnet.up.railway.app/)
- [Walletless receipt verifier](https://troqpay-app-stellar-testnet.up.railway.app/privatepay/verify)
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

TroqPay entered the Scale category as an existing Global Account product.
During HackMeridian, we completed and validated the Private Yield product
experience: global testnet onboarding, simulated Etherfuse approval, Privy
wallet activation, automatic protected balances, private recipient discovery,
the Send flow, sponsor hardening, payer attribution, receipts, walletless
verification, balance UX and end-to-end payments between distinct companies.

The judge-ready evaluator, reproducible public repository, complete
cross-company tests and final evidence were also built and run during the
event. The existing TroqPay platform and the upstream SPP and DeFindex
components are not claimed as hackathon work.

AI-assisted development used Codex and Claude Code for implementation,
debugging, tests, documentation and submission preparation. The team reviewed
and validated the resulting code and testnet transactions.

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
