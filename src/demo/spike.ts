// DEMO-0 spike, development only: two disposable companies in one page and
// one SPP client. A pays B privately on the public SPP XLM pool (no
// admission), and A tries to buy test USDC on the testnet DEX. Driven by
// scripts/spike-demo.mjs.
import { Asset, Keypair, Networks, Operation, rpc, scValToNative, TransactionBuilder } from "@stellar/stellar-sdk";

import { prepareVaultCall } from "../../server/sponsor";
import { createPrivatePaySigner } from "../core/privy-signer";
import { contractConfig, getSppClient, NETWORK_PASSPHRASE, RPC_URL } from "../spp";
import { burnerRawHashSigner, createBurner, fundWithFriendbot, selfPaidTransactions } from "./burner";

const PUBLIC_XLM_POOL = "CA4J475XJXKSHL2RCFLNQSQEB5DN4NA5QHBVCACH2WKGZLZVXT2ZFMS7";
const USDC = new Asset("USDC", "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5");

type Step = { step: string; seconds: number; value?: unknown; error?: string };

async function timed(steps: Step[], step: string, action: () => Promise<unknown>) {
  const started = performance.now();
  try {
    const value = await action();
    steps.push({ step, seconds: Math.round((performance.now() - started) / 1000), value });
    return value;
  } catch (error) {
    steps.push({ step, seconds: Math.round((performance.now() - started) / 1000), error: String(error instanceof Error ? error.message : error) });
    throw error;
  }
}

// The first proof in a fresh browser can pass the SDK's 30 s timeout while
// the prover warms up; the worker keeps going, so a retry is fast. Right after
// an admission the pool can still answer aspNotReady. The SDK reports both as
// a failed result, not as an exception.
async function retryColdProver<T extends { status?: string; message?: string }>(action: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const result = await action();
    if (result.status !== "failed") return result;
    const retryable = /timed out after|aspNotReady/u.test(result.message ?? "");
    if (!retryable || attempt >= 3) throw new Error(result.message ?? "pool_call_failed");
    await new Promise((resolve) => setTimeout(resolve, 20_000));
  }
}

function openCompany(client: Awaited<ReturnType<typeof getSppClient>>["client"], keypair: Keypair) {
  const address = keypair.publicKey();
  return client.account(
    { networkPassphrase: NETWORK_PASSPHRASE, userAddress: address },
    createPrivatePaySigner({ address, signRawHash: burnerRawHashSigner(keypair), ...selfPaidTransactions(address) }),
  );
}

async function buyTestUsdc(keypair: Keypair) {
  const server = new rpc.Server(RPC_URL);
  const transaction = new TransactionBuilder(await server.getAccount(keypair.publicKey()), {
    fee: "100000",
    networkPassphrase: Networks.TESTNET,
  })
    .addOperation(Operation.changeTrust({ asset: USDC }))
    .addOperation(
      Operation.pathPaymentStrictReceive({
        sendAsset: Asset.native(),
        sendMax: "2000",
        destination: keypair.publicKey(),
        destAsset: USDC,
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
    usdc: result.status === "SUCCESS" ? (await server.getTrustline(keypair.publicKey(), USDC)).balance().toBigInt().toString() : null,
  };
}

const VAULT = "CANERND5MTY6QZN6FBDNY4TAMIIEKMYO4MCGLFESIY5O7XF6ILUDWANB";
const UNIT = BigInt(10_000_000);

/** Vault deposit or withdrawal signed and paid by the demo account itself. */
async function vaultCall(keypair: Keypair, method: "deposit" | "withdraw", amount: bigint) {
  const server = new rpc.Server(RPC_URL);
  const config = { networkPassphrase: Networks.TESTNET, privacyContracts: new Set<string>(), vault: VAULT };
  const { transactionXdr } = await prepareVaultCall({
    server,
    config,
    walletAddress: keypair.publicKey(),
    method,
    amount: amount.toString(),
  });
  const transaction = TransactionBuilder.fromXDR(transactionXdr, Networks.TESTNET);
  transaction.sign(keypair);
  const sent = await server.sendTransaction(transaction);
  if (sent.status === "ERROR") throw new Error(`vault_${method}_rejected`);
  const result = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS || !result.returnValue) throw new Error(`vault_${method}_failed`);
  const value = scValToNative(result.returnValue) as [bigint[], bigint] | bigint[];
  const out = method === "deposit" ? (value as [bigint[], bigint])[1] : (value as bigint[])[0];
  return { hash: sent.hash, amount: BigInt(out ?? 0) };
}

// Phase 2 state: the companies live in this page between the runner's calls.
let demo: {
  a: Keypair;
  b: Keypair;
  accountA: Awaited<ReturnType<typeof openCompany>>;
  accountB: Awaited<ReturnType<typeof openCompany>>;
} | null = null;

const spike = {
  /** Phase 2, on ?deployment=demo: companies with USDC, registered, ASP leaves for the runner to admit. */
  async setupDemo() {
    const steps: Step[] = [];
    try {
      const { client } = (await timed(steps, "sdk ready", () => getSppClient())) as Awaited<ReturnType<typeof getSppClient>>;
      const a = createBurner();
      const b = createBurner();
      await timed(steps, "friendbot A and B", () => Promise.all([fundWithFriendbot(a.publicKey()), fundWithFriendbot(b.publicKey())]));
      await timed(steps, "A buys 100 USDC on the DEX", () => buyTestUsdc(a));
      const [accountA, accountB] = await Promise.all([openCompany(client, a), openCompany(client, b)]);
      demo = { a, b, accountA, accountB };
      const leaves: Record<string, string> = {};
      for (const [name, account] of [["A", accountA], ["B", accountB]] as const) {
        await timed(steps, `register ${name}`, async () => {
          await account.derivePrivacyKeys();
          if (!(await account.isRegistered())) await account.registerPublicKeys();
          leaves[name] = String(await account.deriveAspUserLeaf());
          return { registered: await account.isRegistered() };
        });
      }
      return { steps, addresses: { a: a.publicKey(), b: b.publicKey() }, leaves };
    } catch {
      return { steps };
    }
  },
  /** Phase 2 after admission: protect, pay privately, balances; the runner passes the demo view key for the audit. */
  async protectAndPay(viewKeyHex: string) {
    const steps: Step[] = [];
    if (!demo) return { steps, error: "run setupDemo first" };
    const { a, b, accountA, accountB } = demo;
    const pool = contractConfig.pools.find((candidate) => candidate.asset.kind === "contract")!.poolContractId;
    try {
      const { client } = await getSppClient();
      const shares = (await timed(steps, "A: 100 USDC into the vault", () => vaultCall(a, "deposit", BigInt(100) * UNIT))) as { amount: bigint };
      await client.sync();
      const poolA = await accountA.pool({ poolContract: pool });
      await timed(steps, "A: shares into the pool", () => retryColdProver(() => poolA.deposit(shares.amount)));
      await timed(steps, "A pays B 20 shares privately", () => retryColdProver(() => poolA.transfer(b.publicKey(), BigInt(20) * UNIT)));
      await client.sync();
      const poolB = await accountB.pool({ poolContract: pool });
      await timed(steps, "balances", async () => ({ a: (await poolA.balance()).toString(), b: (await poolB.balance()).toString() }));
      await timed(steps, "auditor", async () => {
        const cursor = await poolA.audit(viewKeyHex);
        let count = 0;
        try {
          for (let tx = await cursor.nextTx(); tx; tx = await cursor.nextTx()) count += 1;
        } finally {
          cursor.free();
        }
        return { auditedTransactions: count };
      });
      await timed(steps, "B: out of the pool", () => retryColdProver(() => poolB.withdraw(BigInt(20) * UNIT)));
      await timed(steps, "B: shares back to USDC", async () => {
        const out = await vaultCall(b, "withdraw", BigInt(20) * UNIT);
        return { hash: out.hash, usdc: out.amount.toString() };
      });
    } catch {
      // The failing step is already recorded.
    }
    return { steps: JSON.parse(JSON.stringify(steps, (_key, value) => (typeof value === "bigint" ? value.toString() : value))) };
  },
  async run() {
    const steps: Step[] = [];
    try {
      const { client } = await timed(steps, "sdk ready", () => getSppClient()) as Awaited<ReturnType<typeof getSppClient>>;
      const a = createBurner();
      const b = createBurner();
      await timed(steps, "friendbot A and B", () => Promise.all([fundWithFriendbot(a.publicKey()), fundWithFriendbot(b.publicKey())]));
      const [accountA, accountB] = await timed(steps, "two accounts, one client", () =>
        Promise.all([openCompany(client, a), openCompany(client, b)]),
      ) as Awaited<ReturnType<typeof openCompany>>[];
      for (const [name, account] of [["A", accountA], ["B", accountB]] as const) {
        await timed(steps, `register ${name}`, async () => {
          await account.derivePrivacyKeys();
          if (!(await account.isRegistered())) await account.registerPublicKeys();
          return { registered: await account.isRegistered(), notePublicKey: (await account.privacyKeys()).notePublicKey };
        });
      }
      await client.sync();
      const poolA = await accountA.pool({ poolContract: PUBLIC_XLM_POOL });
      await timed(steps, "A deposits 2 XLM", () => retryColdProver(() => poolA.deposit(BigInt(20_000_000))));
      await timed(steps, "A pays B 1 XLM privately", () => retryColdProver(() => poolA.transfer(b.publicKey(), BigInt(10_000_000))));
      await client.sync();
      const poolB = await accountB.pool({ poolContract: PUBLIC_XLM_POOL });
      await timed(steps, "balances", async () => ({ a: (await poolA.balance()).toString(), b: (await poolB.balance()).toString() }));
      await timed(steps, "A buys 100 USDC on the DEX", () => buyTestUsdc(a));
    } catch {
      // The failing step is already recorded.
    }
    return JSON.parse(JSON.stringify(steps, (_key, value) => (typeof value === "bigint" ? value.toString() : value)));
  },
};

declare global {
  interface Window {
    __demoSpike?: typeof spike;
  }
}

export function installDemoSpike() {
  if (!import.meta.env.DEV) return;
  if (new URLSearchParams(window.location.search).get("spike") !== "1") return;
  window.__demoSpike = spike;
}
