# Agent guide

Rules for any coding agent working in this repository.

## Scope

- **Stellar Testnet only.** Never add mainnet configuration, real keys or real
  assets. Signers refuse any network other than testnet; keep it that way.
- **No secrets in the repository.** Private keys, view keys and admin keys are
  read from the environment or from a local keys directory outside the
  repository, and never printed. Contract IDs and public keys in
  `src/config/` are public.
- **Stellar RPC only.** Do not add Horizon calls.
- **Compose, do not fork.** Stellar Private Payments and DeFindex are used as
  published packages and deployed contracts. Do not copy their code here.

## Layout

| Path | What |
|---|---|
| `src/core/` | Generic Private Yield modules: payment and top-up rules, raw-hash signer, receipts |
| `server/` | Operator-side checks: sponsor fee bump, vault calls, share price, payer lookup |
| `src/` | Pages and smoke-test hooks |
| `src/config/` | Testnet manifests and the circuit lock |
| `scripts/` | Deploy scripts and `smoke.mjs` |
| `tests/` | Unit tests |
| `docs/` | Architecture, privacy model, Private Yield, evidence, roadmap |

## Before every commit

```bash
npm test
npm run typecheck
gitleaks dir .
```

Shell scripts run in Git Bash on Windows too: keep LF line endings.

## Claims

Docs and UI copy must not claim an audit, full anonymity, real yield on
testnet or production readiness. See the Limits section of the README.
