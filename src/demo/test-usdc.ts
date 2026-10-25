import { Asset, type Keypair, Networks, Operation, type rpc, TransactionBuilder } from "@stellar/stellar-sdk";

// Circle's test USDC on Stellar Testnet. A disposable company buys it on the
// testnet DEX with Friendbot XLM, so the demo needs no faucet of its own.
export const TEST_USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

type UsdcRpc = Pick<rpc.Server, "getAccount" | "getAccountEntry" | "getTrustline" | "pollTransaction" | "sendTransaction">;

/** Trustline plus 100 USDC bought for at most 2,000 XLM, in one transaction. */
export async function buyTestUsdc(server: UsdcRpc, keypair: Keypair) {
  const transaction = new TransactionBuilder(await server.getAccount(keypair.publicKey()), {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: TEST_USDC }))
    .addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: "2000",
        destination: keypair.publicKey(),
        destAsset: TEST_USDC,
        destAmount: "100",
        path: [],
      }),
    )
    .setTimeout(60)
    .build();
  transaction.sign(keypair);
  const before = (await server.getAccountEntry(keypair.publicKey())).balance().toBigInt();
  const sent = await server.sendTransaction(transaction);
  if (sent.status === "ERROR") return { status: "rejected", error: sent.errorResult?.result().switch().name };
  const result = await server.pollTransaction(sent.hash, { attempts: 30 });
  const after = (await server.getAccountEntry(keypair.publicKey())).balance().toBigInt();
  return {
    status: result.status,
    hash: sent.hash,
    xlmSpent: Number(before - after) / 1e7,
    usdc: result.status === "SUCCESS" ? (await readPublicUsdc(server, keypair.publicKey())).toString() : null,
  };
}

/** The trustline a company needs to receive USDC back from the vault. */
export async function addTestUsdcTrustline(server: UsdcRpc, keypair: Keypair): Promise<string> {
  const transaction = new TransactionBuilder(await server.getAccount(keypair.publicKey()), {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: TEST_USDC }))
    .setTimeout(60)
    .build();
  transaction.sign(keypair);
  const sent = await server.sendTransaction(transaction);
  if (sent.status === "ERROR") throw new Error("usdc_trustline_rejected");
  const result = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (result.status !== "SUCCESS") throw new Error("usdc_trustline_failed");
  return sent.hash;
}

/** Public USDC in stroops; zero without a trustline. */
export async function readPublicUsdc(server: Pick<rpc.Server, "getTrustline">, address: string): Promise<bigint> {
  try {
    return (await server.getTrustline(address, TEST_USDC)).balance().toBigInt();
  } catch {
    return BigInt(0);
  }
}
