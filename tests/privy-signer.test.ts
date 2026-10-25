import { createHash, generateKeyPairSync, sign } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { createPrivatePaySigner, type PrivyRawHashSigner } from "../src/core/privy-signer";

const ADDRESS = "GBBGO5ZEDMCZRTUKIRLAFWRGVOKY577ST6JPOGO6W4KEYYA7OFL4OIDV";
const { privateKey } = generateKeyPairSync("ed25519");
// Privy signs the raw hash with the wallet's ed25519 key, like Keypair.sign.
const signRawHash: PrivyRawHashSigner = async ({ hash }) => ({
  signature: `0x${sign(null, Buffer.from(hash.slice(2), "hex"), privateKey).toString("hex")}`,
});
const sha256 = (bytes: Buffer) => createHash("sha256").update(bytes).digest();
const reference = (bytes: Buffer) => sign(null, sha256(bytes), privateKey).toString("base64");

function signer(overrides: Partial<Parameters<typeof createPrivatePaySigner>[0]> = {}) {
  return createPrivatePaySigner({
    address: ADDRESS,
    signRawHash,
    prepareTransaction: async () => ({ status: "ok", transactionHash: `0x${"ab".repeat(32)}` }),
    feeBumpTransaction: async () => ({ status: "ok", feeBumpXdr: "fee-bump-xdr" }),
    ...overrides,
  });
}

describe("Privy signer", () => {
  it("signs the SEP-53 hash of the key-derivation message", async () => {
    const message = "Private Yield privacy keys";

    await expect(signer().signMessage(message)).resolves.toEqual({
      signedMessage: reference(Buffer.from(`Stellar Signed Message:\n${message}`, "utf8")),
      signerAddress: ADDRESS,
    });
  });

  it("signs the SHA-256 of the authorization preimage", async () => {
    const preimage = Buffer.from("soroban authorization preimage");

    await expect(signer().signAuthEntry(preimage.toString("base64"))).resolves.toEqual({
      signedAuthEntry: reference(preimage),
      signerAddress: ADDRESS,
    });
  });

  it("signs the hash the sponsor prepared and returns the sponsor fee bump", async () => {
    const feeBumpTransaction = vi.fn(async () => ({ status: "ok" as const, feeBumpXdr: "fee-bump-xdr" }));

    await expect(signer({ feeBumpTransaction }).signTransaction("inner-xdr")).resolves.toEqual({
      signedTxXdr: "fee-bump-xdr",
      signerAddress: ADDRESS,
    });
    expect(feeBumpTransaction).toHaveBeenCalledWith({
      transactionXdr: "inner-xdr",
      signature: (await signRawHash({ address: ADDRESS, chainType: "stellar", hash: `0x${"ab".repeat(32)}` })).signature,
    });
  });

  it("does not ask Privy to sign a transaction the sponsor refused", async () => {
    const privy = vi.fn(signRawHash);
    const refusing = signer({
      signRawHash: privy,
      prepareTransaction: async () => ({ status: "error", code: "transaction_rejected" }),
    });

    await expect(refusing.signTransaction("inner-xdr")).rejects.toThrow("transaction_rejected");
    expect(privy).not.toHaveBeenCalled();
  });
});
