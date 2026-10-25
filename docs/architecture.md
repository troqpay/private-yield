# Architecture

## Components and trust boundaries

| Component | Holds | Trusted for |
|---|---|---|
| Company browser | The Privy session, the SPP SDK, the company's privacy keys and notes (browser storage) | Everything about the company's own money. Proofs are made here. |
| Privy wallet | The company's Stellar key | Signing raw 32-byte hashes. It never sees a pool, a note or a key derivation input. |
| Sponsor backend | A fee-paying account | Paying fees only. It checks every transaction before wrapping it, and cannot move a company's funds: it never holds the company's key or privacy keys. |
| Operator (compliance) | The ASP admin key and the pool view key | Admitting companies that passed KYB, freezing a key, and reading the pool's ledger with the traceable view key. |
| Stellar Testnet | Vault, pools, ASP trees, key registry, verifier | Settlement and proof verification. |

## Contracts

| Contract | Role |
|---|---|
| DeFindex vault (`tyUSDC`) | Turns Circle USDC into SEP-41 shares; factory-created, `upgradable = false`; 20% performance fee |
| Private Yield pool | SPP pool whose token is the vault share; allowlist + blocklist; traceable view key |
| USDC and EURC pools | SPP pools over the Circle assets, same policy and view key |
| ASP membership / non-membership | Allowlist and blocklist Merkle trees shared by every pool |
| Public key registry | Maps a Stellar address to the keys a payer encrypts notes to |
| Groth16 verifier | Verifies pool transaction proofs |

Addresses are in [evidence.md](evidence.md) and `src/config/troqpay-testnet-deployments.json`.

## Flows

Every transaction has the company's wallet as source and the sponsor as fee
payer.

1. **Activation**, once per company. The wallet signs one SEP-53 message; the
   SDK derives the privacy keys from the signature, registers the public keys
   and derives the company's ASP leaf. The operator, which already did KYB,
   inserts the leaf in the allowlist. Until the leaf reaches RPC the SDK
   answers `aspNotReady` and the app retries.
2. **Private payment.** The app checks with `recipientLookup` that the
   recipient registered keys. It converts the amount into shares at the vault
   price (`sharesFor`, rounding up). If the protected shares are short, it
   tops up (`topUpAmount`): the sponsor builds a vault `deposit` of the
   shortfall rounded up to the next 100 USDC, the wallet signs its hash, the
   sponsor bumps and submits it, and the minted shares enter the pool with
   `pool.deposit`. Then `pool.transfer` pays the recipient in shares.
3. **Receipt of a payment.** The recipient's SDK finds the new note on sync.
   The app values it at the current share price and finds the payer: the
   source of the pool transactions in the note's ledger
   (`server/payers.ts`, RPC `getEvents` + `getTransaction`).
4. **Receipt for a third party.** `pool.disclose` with one note, an authority
   label, a purpose and a field nonce. The receipt travels in the URL fragment
   (`#r=`), so it never reaches a server. The verifier checks the proof
   against a verifying-key hash pinned in the app, never the one inside the
   receipt.
5. **Release.** A public payment larger than the public balance first takes
   the missing shares out of the pool (`pool.withdraw`) and redeems them at the
   vault (`withdraw`), then sends publicly.
6. **Audit.** The operator decrypts every pool transaction with the view key:
   amounts, recipients and spent inputs.

## What the sponsor accepts

`server/sponsor.ts`, before any signature or fee bump:

1. A v1 `Transaction` with exactly one `InvokeHostFunction` operation.
2. Source (and operation source, if set) equal to the company's wallet.
3. A call to an allowed contract: the pools and the key registry, or only the
   vault for vault calls, and then only the expected method on behalf of the
   wallet.
4. A wallet signature that verifies against the wallet's key.
5. An inner fee under 20 XLM.

## Data

No new database. Notes and keys live in the company's browser (SPP storage).
Receipts are JSON the company shares. Payer names come from the operator's
existing customer records.
