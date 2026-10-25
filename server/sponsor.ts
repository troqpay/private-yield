import {
  Address,
  Contract,
  type FeeBumpTransaction,
  type Keypair,
  nativeToScVal,
  rpc,
  scValToNative,
  Transaction,
  TransactionBuilder,
  xdr,
} from "@stellar/stellar-sdk";

// The operator's sponsor. The browser SDK builds and proves every pool
// transaction; the sponsor only checks it, returns the hash the company's
// wallet signs and wraps the signed transaction in a fee bump, so companies
// hold no XLM. It also builds the vault calls that move USDC in and out of
// Private Yield. Stellar RPC only.

const FEE_BUMP_BASE_FEE = "1000000"; // Soroban inclusion floor
// A private deposit or transfer costs about 6 to 10 XLM in resource fees.
const MAX_INNER_FEE_STROOPS = BigInt(200_000_000);
const ONE_SHARE = BigInt(10_000_000);
const MAX_VAULT_AMOUNT = BigInt(100_000_000_000); // the pool's own deposit limit, 10,000 USDC

export type SponsorConfig = {
  networkPassphrase: string;
  /** The SPP pools and key registry a wallet may call through the sponsor. */
  privacyContracts: ReadonlySet<string>;
  /** The DeFindex vault whose shares the Private Yield pool holds. */
  vault: string;
};

export type SponsorRpc = Pick<
  rpc.Server,
  "getAccount" | "pollTransaction" | "prepareTransaction" | "sendTransaction" | "simulateTransaction"
>;

type VaultMethod = "deposit" | "withdraw";

/**
 * Accepts only a single call to one of the given contracts, sent and paid for
 * by the company's own wallet, under the fee cap the sponsor covers.
 */
export function readSponsoredTransaction(
  transactionXdr: string,
  walletAddress: string,
  networkPassphrase: string,
  contracts: ReadonlySet<string>,
): Transaction {
  const transaction = TransactionBuilder.fromXDR(transactionXdr, networkPassphrase);
  if (!(transaction instanceof Transaction)) throw new Error("transaction_rejected");
  const [operation] = transaction.operations;
  if (
    transaction.source !== walletAddress ||
    transaction.operations.length !== 1 ||
    operation?.type !== "invokeHostFunction" ||
    (operation.source !== undefined && operation.source !== walletAddress) ||
    operation.func.switch() !== xdr.HostFunctionType.hostFunctionTypeInvokeContract()
  ) {
    throw new Error("transaction_rejected");
  }
  const contract = Address.fromScAddress(operation.func.invokeContract().contractAddress()).toString();
  if (!contracts.has(contract)) throw new Error("transaction_rejected");
  if (BigInt(transaction.fee) > MAX_INNER_FEE_STROOPS) throw new Error("fee_too_high");
  return transaction;
}

/** The hash the company's wallet signs, as 0x-prefixed hex. */
export function transactionHashHex(transaction: Transaction | FeeBumpTransaction): string {
  return `0x${Array.from(transaction.hash(), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

/** Attaches the wallet's signature, checked against its key, and adds the sponsor fee bump. */
export function sponsorTransaction(input: {
  transactionXdr: string;
  signatureHex: string;
  walletAddress: string;
  sponsor: Keypair;
  config: SponsorConfig;
  contracts?: ReadonlySet<string>;
}): FeeBumpTransaction {
  const transaction = readSponsoredTransaction(
    input.transactionXdr,
    input.walletAddress,
    input.config.networkPassphrase,
    input.contracts ?? input.config.privacyContracts,
  );
  attachSignature(transaction, input.walletAddress, input.signatureHex);
  const feeBump = TransactionBuilder.buildFeeBumpTransaction(
    input.sponsor.publicKey(),
    FEE_BUMP_BASE_FEE,
    transaction,
    input.config.networkPassphrase,
  );
  feeBump.sign(input.sponsor);
  return feeBump;
}

/** USDC (7 decimals) that one vault share redeems for right now, read by simulation. */
export async function readSharePrice(input: {
  server: SponsorRpc;
  config: SponsorConfig;
  readerAddress: string;
}): Promise<bigint> {
  const draft = new TransactionBuilder(await input.server.getAccount(input.readerAddress), {
    fee: FEE_BUMP_BASE_FEE,
    networkPassphrase: input.config.networkPassphrase,
  })
    .addOperation(
      new Contract(input.config.vault).call("get_asset_amounts_per_shares", nativeToScVal(ONE_SHARE, { type: "i128" })),
    )
    .setTimeout(60)
    .build();
  const simulated = await input.server.simulateTransaction(draft);
  if (!rpc.Api.isSimulationSuccess(simulated) || !simulated.result) throw new Error("share_price_unavailable");
  const [usdc] = scValToNative(simulated.result.retval) as bigint[];
  return BigInt(usdc ?? 0);
}

/**
 * Builds a vault call from the company's wallet: `deposit` turns public USDC
 * into shares, `withdraw` turns shares back into USDC. The wallet signs the hash.
 */
export async function prepareVaultCall(input: {
  server: SponsorRpc;
  config: SponsorConfig;
  walletAddress: string;
  method: VaultMethod;
  amount: string;
}): Promise<{ transactionXdr: string; transactionHash: string }> {
  const amount = parseVaultAmount(input.amount);
  const from = new Address(input.walletAddress).toScVal();
  const args =
    input.method === "deposit"
      ? [
          nativeToScVal([amount], { type: "i128" }),
          nativeToScVal([amount], { type: "i128" }),
          from,
          nativeToScVal(false),
        ]
      : [nativeToScVal(amount, { type: "i128" }), nativeToScVal([BigInt(0)], { type: "i128" }), from];
  const draft = new TransactionBuilder(await input.server.getAccount(input.walletAddress), {
    fee: FEE_BUMP_BASE_FEE,
    networkPassphrase: input.config.networkPassphrase,
  })
    .addOperation(new Contract(input.config.vault).call(input.method, ...args))
    .setTimeout(300)
    .build();
  const prepared = await input.server.prepareTransaction(draft);
  return { transactionXdr: prepared.toXDR(), transactionHash: transactionHashHex(prepared) };
}

/**
 * Sponsors and submits the signed vault call. Returns the shares the vault
 * minted (`deposit`) or the USDC it paid out (`withdraw`).
 */
export async function submitVaultCall(input: {
  server: SponsorRpc;
  config: SponsorConfig;
  walletAddress: string;
  method: VaultMethod;
  transactionXdr: string;
  signatureHex: string;
  sponsor: Keypair;
}): Promise<{ transactionHash: string; amount: string }> {
  const contracts = new Set([input.config.vault]);
  assertVaultCall(
    readSponsoredTransaction(input.transactionXdr, input.walletAddress, input.config.networkPassphrase, contracts),
    input.walletAddress,
    input.method,
  );
  const feeBump = sponsorTransaction({ ...input, contracts });
  const sent = await input.server.sendTransaction(feeBump);
  if (sent.status === "ERROR") throw new Error("vault_call_failed");
  const result = await input.server.pollTransaction(sent.hash, { attempts: 20 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS || !result.returnValue)
    throw new Error("vault_call_failed");
  const value = scValToNative(result.returnValue) as [bigint[], bigint] | bigint[];
  const amount = input.method === "deposit" ? (value as [bigint[], bigint])[1] : (value as bigint[])[0];
  return { transactionHash: sent.hash, amount: BigInt(amount ?? 0).toString() };
}

/** Only the given vault method, on behalf of the company's own wallet. */
export function assertVaultCall(transaction: Transaction, walletAddress: string, method: VaultMethod): void {
  const [operation] = transaction.operations;
  if (operation?.type !== "invokeHostFunction") throw new Error("transaction_rejected");
  const call = operation.func.invokeContract();
  const from = call.args()[2];
  if (call.functionName().toString() !== method || !from || Address.fromScVal(from).toString() !== walletAddress) {
    throw new Error("transaction_rejected");
  }
}

// The Stellar SDK rejects a signature that does not verify against the key.
export function attachSignature(transaction: Transaction, publicKey: string, signatureHex: string): void {
  const normalized = signatureHex.replace(/^0x/u, "");
  if (!/^[0-9a-f]{128}$/iu.test(normalized)) throw new Error("invalid_signature");
  const bytes = normalized.match(/../gu)!.map((byte) => Number.parseInt(byte, 16));
  transaction.addSignature(publicKey, btoa(String.fromCharCode(...bytes)));
}

function parseVaultAmount(value: string): bigint {
  if (!/^\d{1,18}$/u.test(value.trim())) throw new Error("invalid_amount");
  const amount = BigInt(value.trim());
  if (amount <= BigInt(0) || amount > MAX_VAULT_AMOUNT) throw new Error("invalid_amount");
  return amount;
}
