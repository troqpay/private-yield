import {
  Account,
  Address,
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc,
  SorobanDataBuilder,
  type Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";
import { describe, expect, it, vi } from "vitest";

import { createLocalSponsorApi, type DemoTransaction } from "../src/demo/local-sponsor";
import deployment from "../src/config/demo-testnet-deployments.json";

const sharePool = deployment.pools.find((pool) => pool.asset.kind === "contract")!;
const vault = sharePool.asset.contractId!;

function call(company: Keypair, contract: string, method: string, args: xdr.ScVal[] = []): Transaction {
  return new TransactionBuilder(new Account(company.publicKey(), "1"), { fee: "100", networkPassphrase: Networks.TESTNET })
    .addOperation(new Contract(contract).call(method, ...args))
    .setSorobanData(new SorobanDataBuilder().setResourceFee("2000000").build())
    .setTimeout(300)
    .build();
}

function sponsorFor(company: Keypair, server: object, reported: DemoTransaction[]) {
  return createLocalSponsorApi({
    address: company.publicKey(),
    server: server as never,
    vault,
    registry: deployment.public_key_registry,
    admit: vi.fn(),
    onTransaction: (transaction) => reported.push(transaction),
  });
}

describe("Demo SponsorApi", () => {
  it("returns minted shares on deposit and USDC on withdrawal, and reports each vault transaction", async () => {
    const company = Keypair.random();
    const reported: DemoTransaction[] = [];
    const returnValues = [
      xdr.ScVal.scvVec([nativeToScVal([BigInt(100)], { type: "i128" }), nativeToScVal(BigInt(91), { type: "i128" })]),
      xdr.ScVal.scvVec([nativeToScVal(BigInt(101), { type: "i128" })]),
    ];
    const server = {
      sendTransaction: vi.fn(async () => ({ status: "PENDING", hash: `hash_${server.sendTransaction.mock.calls.length}` })),
      pollTransaction: vi.fn(async () => ({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        returnValue: returnValues.shift(),
      })),
    };
    const api = sponsorFor(company, server, reported);
    const signed = (method: string) => {
      const transaction = call(company, vault, method, [new Address(company.publicKey()).toScVal()]);
      return { transactionXdr: transaction.toXDR(), signature: company.sign(transaction.hash()).toString("hex") };
    };

    await expect(api.submitVaultDeposit(signed("deposit"))).resolves.toEqual({
      status: "ok",
      transactionHash: "hash_1",
      shares: "91",
    });
    await expect(api.submitVaultWithdrawal(signed("withdraw"))).resolves.toEqual({
      status: "ok",
      transactionHash: "hash_2",
      usdc: "101",
    });
    expect(reported).toEqual([
      { kind: "vault", method: "deposit", hash: "hash_1" },
      { kind: "vault", method: "withdraw", hash: "hash_2" },
    ]);
  });

  it("signs pool transactions with the company's own key and reports them", async () => {
    const company = Keypair.random();
    const reported: DemoTransaction[] = [];
    const api = sponsorFor(company, {}, reported);
    const transaction = call(company, sharePool.poolContractId, "transact");

    const prepared = await api.prepareTransaction({ transactionXdr: transaction.toXDR() });
    if (prepared.status !== "ok") throw new Error(prepared.code);
    const hash = Buffer.from(prepared.transactionHash.slice(2), "hex");
    const result = await api.feeBumpTransaction({
      transactionXdr: transaction.toXDR(),
      signature: company.sign(hash).toString("hex"),
    });
    if (result.status !== "ok") throw new Error(result.code);

    const signed = TransactionBuilder.fromXDR(result.feeBumpXdr, Networks.TESTNET) as Transaction;
    expect(signed.signatures).toHaveLength(1);
    expect(company.verify(signed.hash(), signed.signatures[0]!.signature())).toBe(true);
    expect(reported).toEqual([{ kind: "pool", hash: signed.hash().toString("hex") }]);
  });
});
