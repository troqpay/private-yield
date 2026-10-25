import { type Account, DisclosureRequest } from "stellar-private-payments";

// Selective-disclosure receipts: the recipient proves one received payment to
// a named authority (an accountant, a bank, the payer) without revealing
// anything else. Anyone verifies it against the chain, with no wallet.

/** Receipt for one note of the given pool, as the JSON the verifier reads. */
export async function createPaymentReceipt(input: {
  account: Account;
  pool: string;
  noteId: string;
  authority: string;
}): Promise<unknown> {
  const pool = await input.account.pool({ poolContract: input.pool });
  const receipt = await pool.disclose(
    new DisclosureRequest([input.noteId], input.authority, randomHex(16), "payment-receipt", randomFieldNonce()),
  );
  if (!receipt) throw new Error("privatepay_receipt_unavailable");
  return receipt.toJSON();
}

/** Verification link; the receipt travels in the fragment, so it never reaches a server. */
export function receiptLink(receipt: unknown, verifyUrl: string): string {
  const bytes = new TextEncoder().encode(JSON.stringify(receipt));
  const base64 = btoa(String.fromCharCode(...bytes)).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
  return `${verifyUrl}#r=${base64}`;
}

/** The receipt JSON from a link made by receiptLink, or null. */
export function readReceiptLink(hash: string): string | null {
  const encoded = new URLSearchParams(hash.replace(/^#/u, "")).get("r");
  if (!encoded) return null;
  try {
    const binary = atob(encoded.replace(/-/gu, "+").replace(/_/gu, "/"));
    return new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
  } catch {
    return null;
  }
}

// A BN254 field element as 64 hex characters, as the SPP reference app does.
const BN254_PRIME = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

function randomFieldNonce(): string {
  const value = BigInt(randomHex(32)) % BN254_PRIME;
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function randomHex(bytes: number): string {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return `0x${Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}
