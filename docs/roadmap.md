# Roadmap

## Before real money

1. **Audits.** SPP contracts and circuits, and this vault configuration.
2. **Trusted setup.** A public ceremony for the SPP circuits.
3. **History beyond 7 days.** Run or use an SPP bootnode so new devices can
   rebuild pools older than the RPC window, and record each pool call at the
   sponsor so payer identification never depends on RPC history.
4. **Key custody.** View key and ASP admin key in an HSM or TEE, with every
   access logged.
5. **Freeze drill.** Exercise the blocklist end to end and document the
   procedure.

## Product

1. **Mainnet**, with TroqPay's Stellar rail on mainnet.
2. **Real yield.** Attach a strategy to the vault (for example Blend on Circle
   USDC) and agree the DeFindex share of the fee.
3. **Fewer transactions.** "Enter and pay" in one transaction when the SDK
   allows it, halving the cost of a payment with a top-up.
4. **EURC Private Yield**, with the same rules.
5. **Proof of funds** for banks and suppliers, once receipts cover more than
   two notes.
6. **Invites.** A public payment to a non-customer suggests receiving
   privately next time; every new company grows everyone's privacy.

## Research

A confidential mode with OpenZeppelin's Confidential Token once its
zero-knowledge verifier ships: hidden amounts and balances, visible parties,
an operator auditor. It suits payroll and treasury flows that need address
monitoring.
