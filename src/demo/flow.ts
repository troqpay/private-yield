import { rpc } from "@stellar/stellar-sdk";
import type { Account, Client } from "stellar-private-payments";

import {
  activatePrivatePayments,
  openPrivateYieldAccount,
  payPrivately,
  type PrivateYieldConfig,
  type PrivateYieldWallet,
  readSharePrice,
  releaseProtected,
  type SponsorApi,
} from "../core/private-yield";
import { createPaymentReceipt, receiptLink } from "../core/receipt";
import { contractConfig, getSppClient, NETWORK_PASSPHRASE, RPC_URL } from "../spp";
import { auditPool, type AuditedTransaction } from "./audit";
import { burnerRawHashSigner } from "./burner";
import { type Companies, fundCompanies, loadCompanies } from "./companies";
import { DISCLOSURE_VK_HASHES } from "./disclosure-keys";
import { createLocalSponsorApi, type DemoTransaction } from "./local-sponsor";
import { addTestUsdcTrustline, buyTestUsdc, readPublicUsdc } from "./test-usdc";

// The five steps of the open demo, over the same src/core the TroqPay
// integration uses. Errors from the core are passed on unchanged.

export const UNIT = BigInt(10_000_000);
export const PAYMENT_USDC = BigInt(25) * UNIT;
const ENTRY_USDC = BigInt(100) * UNIT;

export type CompanyName = "A" | "B";
export type PublicLabel =
  | "usdc-purchase"
  | "usdc-trustline"
  | "admission"
  | "registration"
  | "vault-deposit"
  | "pool-deposit"
  | "pool-transfer"
  | "yield"
  | "pool-withdraw"
  | "vault-withdraw";
export type PublicEvent = { company: CompanyName | "operator"; label: PublicLabel; hash: string };

export type DemoSession = {
  client: Client;
  server: rpc.Server;
  companies: Companies;
  config: PrivateYieldConfig;
  accounts: Record<CompanyName, Account>;
  wallets: Record<CompanyName, PrivateYieldWallet>;
  /** What the next pool transaction is, for the public panel. */
  poolLabel: { current: PublicLabel };
};

export type CompanyBalances = { publicUsdc: bigint; protectedShares: bigint; protectedUsdc: bigint };

export async function openDemoSession(onEvent: (event: PublicEvent) => void): Promise<DemoSession> {
  const { client } = await getSppClient();
  const server = new rpc.Server(RPC_URL);
  const companies = loadCompanies();
  const yieldPool = contractConfig.pools.find((pool) => pool.asset.kind === "contract");
  const vault = yieldPool?.asset.kind === "contract" ? yieldPool.asset.contractId : undefined;
  if (!yieldPool || !vault) throw new Error("demo_pool_missing");
  const config: PrivateYieldConfig = { yieldPool: yieldPool.poolContractId, networkPassphrase: NETWORK_PASSPHRASE };
  const poolLabel: { current: PublicLabel } = { current: "registration" };

  const wallet = (company: CompanyName): PrivateYieldWallet => {
    const keypair = company === "A" ? companies.a : companies.b;
    const report = (transaction: DemoTransaction) =>
      onEvent({ company, label: labelFor(transaction, poolLabel.current), hash: transaction.hash });
    return {
      stellarAddress: keypair.publicKey(),
      signRawHash: burnerRawHashSigner(keypair),
      api: createLocalSponsorApi({
        address: keypair.publicKey(),
        server,
        vault,
        registry: contractConfig.public_key_registry,
        admit: (args) => admit(args, (hash) => onEvent({ company: "operator", label: "admission", hash })),
        onTransaction: report,
      }),
    };
  };
  const wallets = { A: wallet("A"), B: wallet("B") };
  const [accountA, accountB] = await Promise.all([
    openPrivateYieldAccount(client, wallets.A, config),
    openPrivateYieldAccount(client, wallets.B, config),
  ]);
  return { client, server, companies, config, accounts: { A: accountA, B: accountB }, wallets, poolLabel };
}

/** Step 1: both companies funded, A holds test USDC, B can receive USDC, both registered and admitted. */
export async function setupCompanies(
  session: DemoSession,
  onEvent: (event: PublicEvent) => void,
  onStage: (stage: "funding" | "buying-usdc" | "activating") => void,
): Promise<void> {
  const { server, companies } = session;
  onStage("funding");
  await fundCompanies(companies);
  onStage("buying-usdc");
  if ((await readPublicUsdc(server, companies.a.publicKey())) < ENTRY_USDC) {
    const bought = await buyTestUsdc(server, companies.a);
    if (bought.status !== "SUCCESS" || !bought.hash) throw new Error("usdc_purchase_failed");
    onEvent({ company: "A", label: "usdc-purchase", hash: bought.hash });
  }
  onEvent({ company: "B", label: "usdc-trustline", hash: await addTestUsdcTrustline(server, companies.b) });
  onStage("activating");
  session.poolLabel.current = "registration";
  await activatePrivatePayments(session.accounts.A, session.wallets.A.api);
  await activatePrivatePayments(session.accounts.B, session.wallets.B.api);
}

/** Step 2: A pays B privately; the core protects A's USDC first (rounded to 100). */
export async function payB(
  session: DemoSession,
  onStage: (stage: "protecting" | "paying" | "retrying") => void,
): Promise<string | null> {
  session.poolLabel.current = "pool-deposit";
  const { transactionHash } = await payPrivately({
    client: session.client,
    account: session.accounts.A,
    wallet: session.wallets.A,
    config: session.config,
    recipient: session.companies.b.publicKey(),
    amountUsdc: PAYMENT_USDC,
    publicUsdc: await readPublicUsdc(session.server, session.companies.a.publicKey()),
    onStage: (stage) => {
      if (stage === "paying") session.poolLabel.current = "pool-transfer";
      onStage(stage);
    },
  });
  return transactionHash;
}

/** Step 3: the demo treasury sends USDC to the vault; every share is worth more. */
export async function simulateYield(
  session: DemoSession,
  onEvent: (event: PublicEvent) => void,
): Promise<{ before: bigint; after: bigint }> {
  const before = await readSharePrice(session.wallets.A.api);
  const result = await postJson<{ transactionHash: string }>("/api/demo/yield", {});
  if (result.status !== "ok") throw new Error(result.code);
  onEvent({ company: "operator", label: "yield", hash: result.transactionHash });
  return { before, after: await readSharePrice(session.wallets.A.api) };
}

export type ReceiptChecks = {
  proofVerified: boolean;
  contextVerified: boolean;
  knownRootStatus: boolean;
  nullifiersUnspent: boolean;
};

/** Step 4: B discloses the received payment and the page verifies it against the chain. */
export async function proveForB(session: DemoSession): Promise<{ link: string; checks: ReceiptChecks; shares: bigint }> {
  await session.client.sync();
  const pool = await session.accounts.B.pool({ poolContract: session.config.yieldPool });
  const note = (await pool.notes()).find((candidate) => !candidate.spent && BigInt(candidate.amount) > BigInt(0));
  if (!note) throw new Error("no_received_payment");
  const receipt = await createPaymentReceipt({
    account: session.accounts.B,
    pool: session.config.yieldPool,
    noteId: note.id,
    authority: "Private Yield demo verifier",
  });
  return {
    link: receiptLink(receipt, `${window.location.origin}/verify`),
    checks: await verifyReceipt(session.client, receipt),
    shares: BigInt(note.amount),
  };
}

/** Walletless verification with the pinned verifying-key hash. */
export async function verifyReceipt(client: Client, receipt: unknown): Promise<ReceiptChecks> {
  const circuit = (receipt as { circuit?: { name?: string } }).circuit?.name ?? "";
  const vkHash = DISCLOSURE_VK_HASHES[circuit];
  if (!vkHash) throw new Error("receipt_circuit_unknown");
  const report = await client.verifySelectiveDisclosure(JSON.stringify(receipt), vkHash);
  return {
    proofVerified: report.proofVerified,
    contextVerified: report.contextVerified,
    knownRootStatus: report.knownRootStatus,
    nullifiersUnspent: report.nullifiersUnspent,
  };
}

/** Step 5: B's protected value back to public USDC (pool, then vault). */
export async function cashOutB(session: DemoSession): Promise<{ before: bigint; after: bigint }> {
  const address = session.companies.b.publicKey();
  await session.client.sync();
  const shares = await (await session.accounts.B.pool({ poolContract: session.config.yieldPool })).balance();
  if (shares <= BigInt(2)) throw new Error("nothing_to_cash_out");
  const usdcPerShare = await readSharePrice(session.wallets.B.api);
  // releaseProtected adds one share stroop for the vault's rounding, so ask
  // for two stroops less than the whole balance.
  const usdc = ((shares - BigInt(2)) * usdcPerShare) / UNIT;
  const before = await readPublicUsdc(session.server, address);
  session.poolLabel.current = "pool-withdraw";
  await releaseProtected({
    client: session.client,
    account: session.accounts.B,
    wallet: session.wallets.B,
    config: session.config,
    usdc,
  });
  return { before, after: await readPublicUsdc(session.server, address) };
}

export async function readBalances(session: DemoSession): Promise<Record<CompanyName, CompanyBalances>> {
  await session.client.sync();
  // Before step 1 the accounts do not exist yet: show zero, not a spinner.
  const usdcPerShare = await readSharePrice(session.wallets.A.api).catch(() => BigInt(0));
  const read = async (company: CompanyName): Promise<CompanyBalances> => {
    const address = (company === "A" ? session.companies.a : session.companies.b).publicKey();
    const pool = await session.accounts[company].pool({ poolContract: session.config.yieldPool });
    const protectedShares = await pool.balance().catch(() => BigInt(0));
    return {
      publicUsdc: await readPublicUsdc(session.server, address),
      protectedShares,
      protectedUsdc: (protectedShares * usdcPerShare) / UNIT,
    };
  };
  const [a, b] = await Promise.all([read("A"), read("B")]);
  return { A: a, B: b };
}

/** The auditor panel: the demo pool decrypted with the demo view key. */
export async function auditDemoPool(session: DemoSession): Promise<AuditedTransaction[]> {
  const viewKey = await fetch("/api/demo/view-key").then(async (response) => {
    if (!response.ok) throw new Error("view_key_unavailable");
    return ((await response.json()) as { privateKey: string }).privateKey;
  });
  await session.client.sync();
  const [keysA, keysB] = await Promise.all([session.accounts.A.privacyKeys(), session.accounts.B.privacyKeys()]);
  return auditPool({
    account: session.accounts.A,
    pool: session.config.yieldPool,
    viewKey,
    names: { [keysA.notePublicKey]: "Company A", [keysB.notePublicKey]: "Company B" },
  });
}

function labelFor(transaction: DemoTransaction, poolLabel: PublicLabel): PublicLabel {
  if (transaction.kind === "registry") return "registration";
  if (transaction.kind === "vault") return transaction.method === "deposit" ? "vault-deposit" : "vault-withdraw";
  return poolLabel;
}

async function admit(
  args: { aspLeaf: string },
  onAdmitted: (hash: string) => void,
): ReturnType<SponsorApi["admitAccount"]> {
  const result = await postJson<{ alreadyAdmitted: boolean; transactionHash?: string | null }>("/api/demo/admit", args);
  if (result.status === "ok" && result.transactionHash) onAdmitted(result.transactionHash);
  return result.status === "ok" ? { status: "ok", alreadyAdmitted: result.alreadyAdmitted } : result;
}

async function postJson<T>(path: string, body: unknown): Promise<({ status: "ok" } & T) | { status: "error"; code: string }> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json().catch(() => ({}))) as { status?: string; code?: string } & T;
    if (!response.ok || payload.status !== "ok") return { status: "error", code: payload.code ?? `http_${response.status}` };
    return { ...payload, status: "ok" };
  } catch {
    return { status: "error", code: "demo_service_unavailable" };
  }
}
