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
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertVaultCall,
  readSharePrice,
  readSponsoredTransaction,
  type SponsorConfig,
  sponsorTransaction,
  submitVaultCall,
} from "../server/sponsor";
import deployment from "../src/config/troqpay-testnet-deployments.json";

const sharePool = deployment.pools.find((pool) => pool.asset.kind === "contract")!;
const config: SponsorConfig = {
  networkPassphrase: Networks.TESTNET,
  privacyContracts: new Set([...deployment.pools.map((pool) => pool.poolContractId), deployment.public_key_registry]),
  vault: sharePool.asset.contractId!,
};

let wallet: Keypair;
let sponsor: Keypair;

beforeEach(() => {
  wallet = Keypair.random();
  sponsor = Keypair.random();
});

// Shaped like the SDK's prepared transactions: a small inclusion fee plus the
// resource fee (about 9.5 XLM in total on the pools).
function contractCall(
  input: { contract?: string; source?: string; resourceFee?: string; method?: string; args?: xdr.ScVal[] } = {},
): Transaction {
  return new TransactionBuilder(new Account(input.source ?? wallet.publicKey(), "1"), {
    fee: "100",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(new Contract(input.contract ?? sharePool.poolContractId).call(input.method ?? "transact", ...(input.args ?? [])))
    .setSorobanData(new SorobanDataBuilder().setResourceFee(input.resourceFee ?? "94999900").build())
    .setTimeout(300)
    .build();
}

function vaultCall(method: string, from = wallet.publicKey()) {
  return contractCall({
    contract: config.vault,
    method,
    resourceFee: "2000000",
    args: [
      nativeToScVal([BigInt(100)], { type: "i128" }),
      nativeToScVal([BigInt(100)], { type: "i128" }),
      new Address(from).toScVal(),
      nativeToScVal(false),
    ],
  });
}

describe("Sponsor checks", () => {
  it("accepts a single pool call from the company's own wallet", () => {
    const transaction = contractCall();
    expect(
      readSponsoredTransaction(transaction.toXDR(), wallet.publicKey(), Networks.TESTNET, config.privacyContracts).hash(),
    ).toEqual(transaction.hash());
  });

  it("refuses calls the sponsor must not pay for", () => {
    const read = (transaction: Transaction) =>
      readSponsoredTransaction(transaction.toXDR(), wallet.publicKey(), Networks.TESTNET, config.privacyContracts);
    expect(() => read(contractCall({ contract: config.vault }))).toThrow("transaction_rejected");
    expect(() => read(contractCall({ source: Keypair.random().publicKey() }))).toThrow("transaction_rejected");
    expect(() => read(contractCall({ resourceFee: "299999900" }))).toThrow("fee_too_high");
  });

  it("wraps a transaction the wallet signed in a fee bump paid by the sponsor", () => {
    const transaction = contractCall();
    const feeBump = sponsorTransaction({
      transactionXdr: transaction.toXDR(),
      signatureHex: wallet.sign(transaction.hash()).toString("hex"),
      walletAddress: wallet.publicKey(),
      sponsor,
      config,
    });
    expect(feeBump.feeSource).toBe(sponsor.publicKey());
    expect(feeBump.innerTransaction.signatures).toHaveLength(1);
  });

  it("rejects a signature that is not the wallet's", () => {
    const transaction = contractCall();
    expect(() =>
      sponsorTransaction({
        transactionXdr: transaction.toXDR(),
        signatureHex: Keypair.random().sign(transaction.hash()).toString("hex"),
        walletAddress: wallet.publicKey(),
        sponsor,
        config,
      }),
    ).toThrow();
  });
});

describe("Private Yield vault calls", () => {
  it("accepts only the expected vault method on behalf of the company's own wallet", () => {
    expect(() => assertVaultCall(vaultCall("deposit"), wallet.publicKey(), "deposit")).not.toThrow();
    expect(() => assertVaultCall(vaultCall("withdraw"), wallet.publicKey(), "deposit")).toThrow("transaction_rejected");
    expect(() =>
      assertVaultCall(vaultCall("deposit", Keypair.random().publicKey()), wallet.publicKey(), "deposit"),
    ).toThrow("transaction_rejected");
  });

  it("submits the signed deposit with a sponsor fee bump and returns the minted shares", async () => {
    const transaction = vaultCall("deposit");
    const sendTransaction = vi.fn(async () => ({ status: "PENDING", hash: "deposit_hash" }));
    const server = {
      sendTransaction,
      pollTransaction: vi.fn(async () => ({
        status: rpc.Api.GetTransactionStatus.SUCCESS,
        returnValue: xdr.ScVal.scvVec([
          nativeToScVal([BigInt(100)], { type: "i128" }),
          nativeToScVal(BigInt(91), { type: "i128" }),
          xdr.ScVal.scvVoid(),
        ]),
      })),
    };

    await expect(
      submitVaultCall({
        server: server as never,
        config,
        walletAddress: wallet.publicKey(),
        method: "deposit",
        transactionXdr: transaction.toXDR(),
        signatureHex: wallet.sign(transaction.hash()).toString("hex"),
        sponsor,
      }),
    ).resolves.toEqual({ transactionHash: "deposit_hash", amount: "91" });
    const [feeBump] = sendTransaction.mock.calls[0] as unknown as [{ feeSource: string }];
    expect(feeBump.feeSource).toBe(sponsor.publicKey());
  });

  it("reads the USDC value of one share by simulation", async () => {
    const server = {
      getAccount: vi.fn(async () => new Account(sponsor.publicKey(), "1")),
      simulateTransaction: vi.fn(async () => ({
        transactionData: new SorobanDataBuilder(),
        minResourceFee: "100",
        result: { retval: nativeToScVal([BigInt(11_000_000)], { type: "i128" }) },
      })),
    };

    await expect(
      readSharePrice({ server: server as never, config, readerAddress: sponsor.publicKey() }),
    ).resolves.toBe(BigInt(11_000_000));
  });
});
