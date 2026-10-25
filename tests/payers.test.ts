import { Account, Contract, Keypair, Networks, rpc, SorobanDataBuilder, TransactionBuilder, type xdr } from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import { findPayers } from "../server/payers";
import deployment from "../src/config/troqpay-testnet-deployments.json";

const pools = deployment.pools.map((pool) => pool.poolContractId);
const ledger = 5351653;

// A pool call signed by `payer` and wrapped in the sponsor fee bump.
function sponsoredPoolCall(payer: Keypair, sponsor: Keypair) {
  const inner = new TransactionBuilder(new Account(payer.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(pools[2]!).call("transact"))
    .setSorobanData(new SorobanDataBuilder().setResourceFee("2000000").build())
    .setTimeout(300)
    .build();
  inner.sign(payer);
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(sponsor, "1000000", inner, Networks.TESTNET);
  feeBump.sign(sponsor);
  return feeBump.toEnvelope();
}

function poolEvent(txHash: string, eventLedger = ledger) {
  return { ledger: eventLedger, ledgerClosedAt: "2026-10-23T18:57:32Z", txHash };
}

describe("Payer lookup over Stellar RPC", () => {
  it("names the wallet behind the pool calls in the note's ledger, never the company itself", async () => {
    const company = Keypair.random();
    const payer = Keypair.random();
    const sponsor = Keypair.random();
    const envelopes: Record<string, xdr.TransactionEnvelope> = {
      payer_tx: sponsoredPoolCall(payer, sponsor),
      own_tx: sponsoredPoolCall(company, sponsor),
    };
    const server = {
      getHealth: vi.fn(async () => ({ oldestLedger: ledger - 100 })),
      getEvents: vi.fn(async () => ({
        events: [poolEvent("payer_tx"), poolEvent("payer_tx"), poolEvent("own_tx"), poolEvent("later_tx", ledger + 1)],
      })),
      getTransaction: vi.fn(async (hash: string) => ({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        envelopeXdr: envelopes[hash],
      })),
    };

    await expect(
      findPayers({
        server: server as never,
        networkPassphrase: Networks.TESTNET,
        pools,
        walletAddress: company.publicKey(),
        ledgers: [ledger, ledger - 200],
      }),
    ).resolves.toEqual([
      { ledger, payers: [payer.publicKey()], closedAt: "2026-10-23T18:57:32Z" },
      { ledger: ledger - 200, payers: [], closedAt: null },
    ]);
    expect(server.getEvents).toHaveBeenCalledWith(expect.objectContaining({ startLedger: ledger, endLedger: ledger + 1 }));
    expect(server.getTransaction).toHaveBeenCalledTimes(2);
  });
});
