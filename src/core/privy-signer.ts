import type { WalletSigner } from "stellar-private-payments";

type Hex = `0x${string}`;

export type PrivyRawHashSigner = (input: {
  address: string;
  chainType: "stellar";
  hash: Hex;
}) => Promise<{ signature: Hex }>;

type ActionResult<T> = ({ status: "ok" } & T) | { status: "error"; code: string };

/**
 * Stellar Private Payments wallet adapter over the company's Privy wallet.
 * Privy signs raw 32-byte hashes only, so each SDK request is reduced to the
 * hash the Stellar network verifies:
 * - message (key derivation): SEP-53, SHA-256 of the prefixed message;
 * - auth entry: SHA-256 of the authorization preimage;
 * - transaction: hashed by the API, which then adds the sponsor fee bump.
 */
export function createPrivatePaySigner(input: {
  address: string;
  signRawHash: PrivyRawHashSigner;
  prepareTransaction: (args: { transactionXdr: string }) => Promise<ActionResult<{ transactionHash: string }>>;
  feeBumpTransaction: (args: { transactionXdr: string; signature: string }) => Promise<ActionResult<{ feeBumpXdr: string }>>;
}): WalletSigner {
  const { address } = input;
  const sign = async (hash: Uint8Array) =>
    (await input.signRawHash({ address, chainType: "stellar", hash: toHex(hash) })).signature;

  return {
    getPublicKey: async () => address,
    async signMessage(message) {
      const digest = await sha256(utf8(`Stellar Signed Message:\n${message}`));
      return { signedMessage: hexToBase64(await sign(digest)), signerAddress: address };
    },
    async signAuthEntry(preimage) {
      const digest = await sha256(base64ToBytes(preimage));
      return { signedAuthEntry: hexToBase64(await sign(digest)), signerAddress: address };
    },
    async signTransaction(transactionXdr) {
      const prepared = await input.prepareTransaction({ transactionXdr });
      if (prepared.status !== "ok") throw new Error(prepared.code);
      const { signature } = await input.signRawHash({
        address,
        chainType: "stellar",
        hash: prepared.transactionHash as Hex,
      });
      const bumped = await input.feeBumpTransaction({ transactionXdr, signature });
      if (bumped.status !== "ok") throw new Error(bumped.code);
      return { signedTxXdr: bumped.feeBumpXdr, signerAddress: address };
    },
  };
}

function utf8(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value);
}

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
}

function toHex(bytes: Uint8Array): Hex {
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
}

function hexToBase64(value: string): string {
  const bytes = value.replace(/^0x/u, "").match(/../gu) ?? [];
  return btoa(String.fromCharCode(...bytes.map((byte) => Number.parseInt(byte, 16))));
}
