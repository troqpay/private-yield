# Privacy model

The promise is narrow and honest: **outsiders cannot tell who pays whom.**
Amounts are hidden too while value circulates between companies inside the
pool.

## What is public and what is hidden

| Situation | The public sees | Hidden |
|---|---|---|
| Payment from protected shares | That the payer's wallet called the pool | Recipient and amount |
| Payment with a top-up | The payer's vault deposit and pool entry, with their amounts (rounded up to the next 100 USDC) | Who was paid, and how much of the entry |
| Release to the public balance | The pool exit and the vault redemption, with amounts | Which payments the value came from |
| Receipt | Nothing, unless the company shares it | Everything not in the receipt |

The pool, the vault and the share token are ordinary contracts: their calls,
and the token movements in and out of the pool, are on chain.

## What leaks, and how it shrinks

- **Small anonymity set.** With few companies, an observer can match an entry
  with an exit of a similar size and time. Privacy grows with the number of
  companies and with the value that stays protected. Paying yield on
  protected value is what keeps it there.
- **Timing.** A payment's ledger is public. Rounded top-ups and payments from
  existing shares avoid an entry that mirrors the payment.
- **Payer identification.** The recipient learns the payer from the public
  source of the pool transaction in the note's ledger. That is public
  already; it only shows to the recipient what anyone could see.

## Who can see what

| Party | Sees |
|---|---|
| Payer and recipient | Their own notes: amounts, counterparties they know |
| Operator, with the view key | The whole pool ledger: amounts, recipients, spent inputs (traceable mode) |
| Receipt holder (accountant, bank) | Exactly the disclosed payment, bound to its authority label and nonce |
| Everyone else | Pool calls and pool entries and exits |

The operator's view is the same as a bank's view of its own ledger. It is
the condition for running private payments for businesses under KYB and AML
rules, and it means the operator's key custody is critical (HSM or TEE in
production).

## Keys

A company's privacy keys are derived from one signature over a fixed SEP-53
message. That signature can spend the company's notes, so it never leaves the
browser. Recovering on another device repeats the signature; rebuilding the
pool history there needs RPC history or a bootnode (see the roadmap).
