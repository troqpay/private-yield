import { Address, Networks, rpc, scValToNative, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";

import {
  attachSignature,
  prepareVaultCall,
  readSharePrice,
  type SponsorConfig,
  type SponsorRpc,
  transactionHashHex,
} from "../../server/sponsor";
import type { SponsorApi } from "../core/private-yield";
import { selfPaidTransactions } from "./burner";

// The SponsorApi of the open demo. In the TroqPay integration the API checks
// each transaction, adds a sponsor fee bump and builds the vault calls; here
// the disposable company does all of it in the browser and pays its own fees.
// Every transaction it sends is reported, so the page can show what the
// public sees.

export type DemoTransaction =
  | { kind: "registry" | "pool"; hash: string }
  | { kind: "vault"; method: "deposit" | "withdraw"; hash: string };

type ActionError = { status: "error"; code: string };

export function createLocalSponsorApi(input: {
  address: string;
  server: SponsorRpc;
  vault: string;
  registry: string;
  admit: SponsorApi["admitAccount"];
  onTransaction: (transaction: DemoTransaction) => void;
}): SponsorApi {
  const { address, server } = input;
  const selfPaid = selfPaidTransactions(address);
  const config: SponsorConfig = { networkPassphrase: Networks.TESTNET, privacyContracts: new Set(), vault: input.vault };

  async function prepareVault(method: "deposit" | "withdraw", amount: string) {
    try {
      return { status: "ok" as const, ...(await prepareVaultCall({ server, config, walletAddress: address, method, amount })) };
    } catch (error) {
      return failure(error, `vault_${method}_unavailable`);
    }
  }

  async function submitVault(method: "deposit" | "withdraw", signed: { transactionXdr: string; signature: string }) {
    try {
      const transaction = TransactionBuilder.fromXDR(signed.transactionXdr, Networks.TESTNET);
      if (!(transaction instanceof Transaction)) return failure(null, "transaction_rejected");
      attachSignature(transaction, address, signed.signature);
      const sent = await server.sendTransaction(transaction);
      if (sent.status === "ERROR") return failure(null, `vault_${method}_rejected`);
      const result = await server.pollTransaction(sent.hash, { attempts: 30 });
      if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS || !result.returnValue) {
        return failure(null, `vault_${method}_failed`);
      }
      // As submitVaultCall: deposit returns (amounts, shares minted), withdraw (amounts paid out).
      const value = scValToNative(result.returnValue) as [bigint[], bigint] | bigint[];
      const amount = method === "deposit" ? (value as [bigint[], bigint])[1] : (value as bigint[])[0];
      input.onTransaction({ kind: "vault", method, hash: sent.hash });
      return { status: "ok" as const, transactionHash: sent.hash, amount: BigInt(amount ?? 0).toString() };
    } catch (error) {
      return failure(error, `vault_${method}_failed`);
    }
  }

  return {
    prepareTransaction: selfPaid.prepareTransaction,
    async feeBumpTransaction(args) {
      try {
        const signed = await selfPaid.feeBumpTransaction(args);
        const transaction = TransactionBuilder.fromXDR(signed.feeBumpXdr, Networks.TESTNET) as Transaction;
        input.onTransaction({
          kind: calledContract(transaction) === input.registry ? "registry" : "pool",
          hash: transactionHashHex(transaction).slice(2),
        });
        return signed;
      } catch (error) {
        return failure(error, "transaction_rejected");
      }
    },
    admitAccount: input.admit,
    async sharePrice() {
      try {
        const usdcPerShare = await readSharePrice({ server, config, readerAddress: address });
        return { status: "ok", usdcPerShare: usdcPerShare.toString() };
      } catch (error) {
        return failure(error, "share_price_unavailable");
      }
    },
    prepareVaultDeposit: ({ amount }) => prepareVault("deposit", amount),
    prepareVaultWithdrawal: ({ shares }) => prepareVault("withdraw", shares),
    async submitVaultDeposit(signed) {
      const result = await submitVault("deposit", signed);
      return result.status === "ok" ? { status: "ok", transactionHash: result.transactionHash, shares: result.amount } : result;
    },
    async submitVaultWithdrawal(signed) {
      const result = await submitVault("withdraw", signed);
      return result.status === "ok" ? { status: "ok", transactionHash: result.transactionHash, usdc: result.amount } : result;
    },
  };
}

function calledContract(transaction: Transaction): string | null {
  const [operation] = transaction.operations;
  if (operation?.type !== "invokeHostFunction") return null;
  try {
    return Address.fromScAddress(operation.func.invokeContract().contractAddress()).toString();
  } catch {
    return null;
  }
}

// The core throws the code as is, so keep the network's own message: the page
// recognizes the testnet fee limit from it.
function failure(error: unknown, fallback: string): ActionError {
  const message = error instanceof Error ? error.message : "";
  return { status: "error", code: message || fallback };
}
