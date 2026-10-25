import type { Account, Client, PoolExecuteResult } from "stellar-private-payments";

import { createPrivatePaySigner, type PrivyRawHashSigner } from "./privy-signer";

// Private Yield: the protected balance is made of DeFindex vault shares inside
// an SPP pool, so it keeps earning while it stays private. Amounts are in
// stroops (7 decimals) for both USDC and shares.

const UNIT = BigInt(10_000_000);
// A shortfall enters the pool rounded up to the next 100 USDC, so the public
// entry does not reveal the payment amount; the rest stays protected, earning.
const ENTRY_ROUNDING = BigInt(100) * UNIT;

type ActionResult<T> = ({ status: "ok" } & T) | { status: "error"; code: string };

/**
 * The operator's backend (see server/). It checks each transaction, returns
 * the hash the wallet signs and pays the network fee with a fee bump. It
 * never holds the company's keys.
 */
export type SponsorApi = {
  prepareTransaction: (args: { transactionXdr: string }) => Promise<ActionResult<{ transactionHash: string }>>;
  feeBumpTransaction: (args: { transactionXdr: string; signature: string }) => Promise<ActionResult<{ feeBumpXdr: string }>>;
  admitAccount: (args: { aspLeaf: string }) => Promise<ActionResult<{ alreadyAdmitted: boolean }>>;
  sharePrice: () => Promise<ActionResult<{ usdcPerShare: string }>>;
  prepareVaultDeposit: (args: { amount: string }) => Promise<ActionResult<{ transactionXdr: string; transactionHash: string }>>;
  submitVaultDeposit: (args: { transactionXdr: string; signature: string }) => Promise<ActionResult<{ transactionHash: string; shares: string }>>;
  prepareVaultWithdrawal: (args: { shares: string }) => Promise<ActionResult<{ transactionXdr: string; transactionHash: string }>>;
  submitVaultWithdrawal: (args: { transactionXdr: string; signature: string }) => Promise<ActionResult<{ transactionHash: string; usdc: string }>>;
};

export type PrivateYieldWallet = {
  stellarAddress: string;
  signRawHash: PrivyRawHashSigner;
  api: SponsorApi;
};

/** The SPP pool that holds the vault shares. */
export type PrivateYieldConfig = { yieldPool: string; networkPassphrase: string };

export function openPrivateYieldAccount(
  client: Client,
  wallet: PrivateYieldWallet,
  config: PrivateYieldConfig,
): Promise<Account> {
  return client.account(
    { networkPassphrase: config.networkPassphrase, userAddress: wallet.stellarAddress },
    createPrivatePaySigner({
      address: wallet.stellarAddress,
      signRawHash: wallet.signRawHash,
      prepareTransaction: wallet.api.prepareTransaction,
      feeBumpTransaction: wallet.api.feeBumpTransaction,
    }),
  );
}

/** Keys from an earlier activation live in this browser; reading them needs no signature. */
export async function hasPrivacyKeys(account: Account): Promise<boolean> {
  return account
    .privacyKeys()
    .then(() => account.isRegistered())
    .catch(() => false);
}

/**
 * Creates the company's keys (one wallet signature), registers them and asks
 * the operator to admit the company to the allowlist. Every step is idempotent.
 */
export async function activatePrivatePayments(account: Account, api: SponsorApi): Promise<void> {
  await account.derivePrivacyKeys();
  if (!(await account.isRegistered())) await account.registerPublicKeys();
  const admission = await api.admitAccount({ aspLeaf: await account.deriveAspUserLeaf() });
  if (admission.status !== "ok") throw new Error(admission.code);
}

export async function readSharePrice(api: SponsorApi): Promise<bigint> {
  const price = await api.sharePrice();
  if (price.status !== "ok") throw new Error(price.code);
  return BigInt(price.usdcPerShare);
}

/** Protected balance in USDC: vault shares at the current price. */
export async function readProtectedUsdc(
  account: Account,
  config: PrivateYieldConfig,
  usdcPerShare: bigint,
): Promise<bigint> {
  const shares = await (await account.pool({ poolContract: config.yieldPool })).balance();
  return (shares * usdcPerShare) / UNIT;
}

/** A business that registered its keys receives privately. */
export async function receivesPrivately(client: Client, stellarAddress: string): Promise<boolean> {
  return Boolean((await client.recipientLookup(stellarAddress)).entry);
}

export function sharesFor(usdc: bigint, usdcPerShare: bigint): bigint {
  return (usdc * UNIT + usdcPerShare - BigInt(1)) / usdcPerShare;
}

/** Public USDC to move into the pool so the protected shares cover the payment. */
export function topUpAmount(input: {
  neededShares: bigint;
  protectedShares: bigint;
  usdcPerShare: bigint;
  publicUsdc: bigint;
}): bigint {
  const missing = input.neededShares - input.protectedShares;
  if (missing <= BigInt(0)) return BigInt(0);
  // One extra stroop absorbs the vault's rounding when it mints shares.
  const shortfall = (missing * input.usdcPerShare + UNIT - BigInt(1)) / UNIT + BigInt(1);
  if (shortfall > input.publicUsdc) throw new Error("privatepay_insufficient_balance");
  const rounded = ((shortfall + ENTRY_ROUNDING - BigInt(1)) / ENTRY_ROUNDING) * ENTRY_ROUNDING;
  return rounded < input.publicUsdc ? rounded : input.publicUsdc;
}

/**
 * Pays a business privately from the protected balance. When it is short,
 * public USDC goes into the vault and the minted shares into the pool first,
 * so the company never handles the vault or the pool.
 */
export async function payPrivately(input: {
  client: Client;
  account: Account;
  wallet: PrivateYieldWallet;
  config: PrivateYieldConfig;
  recipient: string;
  amountUsdc: bigint;
  publicUsdc: bigint;
  onStage: (stage: "protecting" | "paying" | "retrying") => void;
}): Promise<{ transactionHash: string | null }> {
  const usdcPerShare = await readSharePrice(input.wallet.api);
  const pool = await input.account.pool({ poolContract: input.config.yieldPool });
  const neededShares = sharesFor(input.amountUsdc, usdcPerShare);
  const topUp = topUpAmount({
    neededShares,
    protectedShares: await pool.balance(),
    usdcPerShare,
    publicUsdc: input.publicUsdc,
  });
  if (topUp > BigInt(0)) {
    input.onStage("protecting");
    const minted = await callVault(input.wallet, "deposit", topUp);
    assertOk(await executeWithRetries(input.client, () => pool.deposit(minted), () => input.onStage("retrying")));
  }
  input.onStage("paying");
  const paid = assertOk(
    await executeWithRetries(
      input.client,
      () => pool.transfer(input.recipient, neededShares),
      () => input.onStage("retrying"),
    ),
  );
  return { transactionHash: paid.hashes.at(-1) ?? null };
}

/**
 * Moves protected value back to the public balance before a public payment
 * that needs it: shares leave the pool, then the vault pays out USDC.
 */
export async function releaseProtected(input: {
  client: Client;
  account: Account;
  wallet: PrivateYieldWallet;
  config: PrivateYieldConfig;
  usdc: bigint;
}): Promise<void> {
  const usdcPerShare = await readSharePrice(input.wallet.api);
  const pool = await input.account.pool({ poolContract: input.config.yieldPool });
  // One extra share stroop absorbs the vault's rounding when it pays out.
  const shares = sharesFor(input.usdc, usdcPerShare) + BigInt(1);
  if (shares > (await pool.balance())) throw new Error("privatepay_insufficient_balance");
  assertOk(await executeWithRetries(input.client, () => pool.withdraw(shares), () => {}));
  await callVault(input.wallet, "withdraw", shares);
}

/**
 * The backend builds the vault call; the wallet signs its hash; the backend
 * adds the sponsor fee bump and submits. Returns the shares minted
 * (`deposit`) or the USDC paid out (`withdraw`).
 */
async function callVault(wallet: PrivateYieldWallet, method: "deposit" | "withdraw", amount: bigint): Promise<bigint> {
  const prepared =
    method === "deposit"
      ? await wallet.api.prepareVaultDeposit({ amount: amount.toString() })
      : await wallet.api.prepareVaultWithdrawal({ shares: amount.toString() });
  if (prepared.status !== "ok") throw new Error(prepared.code);
  const { signature } = await wallet.signRawHash({
    address: wallet.stellarAddress,
    chainType: "stellar",
    hash: prepared.transactionHash as `0x${string}`,
  });
  const signed = { transactionXdr: prepared.transactionXdr, signature };
  if (method === "deposit") {
    const submitted = await wallet.api.submitVaultDeposit(signed);
    if (submitted.status !== "ok") throw new Error(submitted.code);
    return BigInt(submitted.shares);
  }
  const submitted = await wallet.api.submitVaultWithdrawal(signed);
  if (submitted.status !== "ok") throw new Error(submitted.code);
  return BigInt(submitted.usdc);
}

export function toStroops(value: string): bigint | null {
  const match = /^(\d+)(?:[.,](\d{1,7}))?$/u.exec(value.trim());
  if (!match) return null;
  const stroops = BigInt(match[1]!) * UNIT + BigInt((match[2] ?? "").padEnd(7, "0") || "0");
  return stroops > BigInt(0) ? stroops : null;
}

function assertOk(result: PoolExecuteResult): PoolExecuteResult {
  if (result.status !== "ok") throw new Error(result.message ?? `privatepay_${result.status}`);
  return result;
}

// The SDK gives each proof 30 s. On a new browser the first proof also loads
// and prepares the circuit's proving key and can time out once; the prover
// keeps the key, so a retry is fast. A fresh admission takes a few ledgers to
// reach the RPC, which the SDK reports as aspNotReady.
async function executeWithRetries(
  client: Client,
  execute: () => Promise<PoolExecuteResult>,
  onRetry: () => void,
): Promise<PoolExecuteResult> {
  let result = await execute();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const coldProver = result.status === "failed" && result.message?.includes("timed out");
    if (!coldProver && result.status !== "aspNotReady") break;
    onRetry();
    await new Promise((resolve) => setTimeout(resolve, coldProver ? 20_000 : 6_000));
    await client.sync();
    result = await execute();
  }
  return result;
}
