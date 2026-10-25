import { Keypair, Networks, Transaction, TransactionBuilder } from "@stellar/stellar-sdk";
import { Buffer } from "buffer";

import type { PrivyRawHashSigner } from "../core/privy-signer";
import { attachSignature, transactionHashHex } from "../../server/sponsor";

// Disposable testnet companies for the open demo. Each company is a random
// keypair kept in this browser; it plays the part of the Privy wallet in the
// TroqPay integration, so the Private Yield modules run unchanged.

const FRIENDBOT_URL = "https://friendbot.stellar.org/";

export function createBurner(): Keypair {
  return Keypair.random();
}

/** Creates the account on testnet with Friendbot XLM; an existing account is fine. */
export async function fundWithFriendbot(address: string): Promise<void> {
  const response = await fetch(`${FRIENDBOT_URL}?addr=${encodeURIComponent(address)}`);
  if (response.ok) return;
  const body = await response.text();
  if (!body.includes("createAccountAlreadyExist")) throw new Error(`friendbot_failed: ${response.status}`);
}

/** Raw-hash signing, the same contract as the Privy signer. Testnet only. */
export function burnerRawHashSigner(keypair: Keypair): PrivyRawHashSigner {
  return async ({ address, hash }) => {
    if (address !== keypair.publicKey()) throw new Error("unknown_demo_account");
    const bytes = hexToBytes(hash);
    if (bytes.length !== 32) throw new Error("invalid_hash");
    return { signature: bytesToHex(keypair.sign(Buffer.from(bytes))) };
  };
}

/**
 * The transaction half of the SponsorApi, without a sponsor: the hash is
 * computed here and the signed transaction is returned as is, so the demo
 * account pays its own fee with Friendbot XLM.
 */
export function selfPaidTransactions(address: string) {
  return {
    async prepareTransaction({ transactionXdr }: { transactionXdr: string }) {
      return { status: "ok" as const, transactionHash: transactionHashHex(readTestnetTransaction(transactionXdr)) };
    },
    async feeBumpTransaction({ transactionXdr, signature }: { transactionXdr: string; signature: string }) {
      const transaction = readTestnetTransaction(transactionXdr);
      attachSignature(transaction, address, signature);
      return { status: "ok" as const, feeBumpXdr: transaction.toXDR() };
    },
  };
}

function readTestnetTransaction(transactionXdr: string): Transaction {
  const transaction = TransactionBuilder.fromXDR(transactionXdr, Networks.TESTNET);
  if (!(transaction instanceof Transaction)) throw new Error("transaction_rejected");
  return transaction;
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.replace(/^0x/u, "");
  return Uint8Array.from(normalized.match(/../gu) ?? [], (byte) => Number.parseInt(byte, 16));
}

function bytesToHex(bytes: Uint8Array): `0x${string}` {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
