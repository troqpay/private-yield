import { rpc, TransactionBuilder, type xdr } from "@stellar/stellar-sdk";

export type PayersRpc = Pick<rpc.Server, "getEvents" | "getHealth" | "getTransaction">;

/**
 * A received note carries no payer: the protocol has no memo. For each ledger
 * where the company's notes were created, the pool events on Stellar RPC point
 * to the transactions that called a pool, and the source of each one (inside
 * the sponsor fee bump) is the paying wallet, unless it is the company itself.
 * Pool calls are public anyway, so this reveals nothing new.
 *
 * RPC keeps about 7 days of history; older ledgers come back without a payer.
 * In production, record each pool call when the sponsor bumps it instead.
 */
export async function findPayers(input: {
  server: PayersRpc;
  networkPassphrase: string;
  pools: string[];
  walletAddress: string;
  ledgers: number[];
}): Promise<{ ledger: number; payers: string[]; closedAt: string | null }[]> {
  const { oldestLedger } = await input.server.getHealth();
  const ledgers = [...new Set(input.ledgers)].slice(0, 50);
  return Promise.all(
    ledgers.map(async (ledger) => {
      if (ledger < oldestLedger) return { ledger, payers: [], closedAt: null };
      const { events } = await input.server.getEvents({
        startLedger: ledger,
        endLedger: ledger + 1,
        filters: [{ type: "contract", contractIds: input.pools }],
        limit: 100,
      });
      const inLedger = events.filter((event) => event.ledger === ledger);
      const payers = new Set<string>();
      for (const hash of new Set(inLedger.map((event) => event.txHash))) {
        const transaction = await input.server.getTransaction(hash);
        if (transaction.status !== rpc.Api.GetTransactionStatus.SUCCESS) continue;
        const source = paidBy(transaction.envelopeXdr, input.networkPassphrase);
        if (source !== input.walletAddress) payers.add(source);
      }
      return { ledger, payers: [...payers], closedAt: inLedger[0]?.ledgerClosedAt ?? null };
    }),
  );
}

function paidBy(envelope: xdr.TransactionEnvelope, networkPassphrase: string): string {
  const transaction = TransactionBuilder.fromXDR(envelope, networkPassphrase);
  return "innerTransaction" in transaction ? transaction.innerTransaction.source : transaction.source;
}
