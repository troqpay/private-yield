// Development-only hooks for scripts/smoke.mjs. Signing is delegated to the
// Node test runner through window.__sppDevSign, so no key ever enters the page.
import { DisclosureRequest, type WalletSigner } from "stellar-private-payments";

import { getSppClient, NETWORK_PASSPHRASE } from "./spp";

type SignKind = "message" | "transaction" | "authEntry";

// Shape of GvkAudit.nextTx() results, from sdk/native/src/gvk/audit.rs @ ea39d0c
// (the bundled js/types/gvk.d.ts is out of date). `note` is null for dummy slots.
type GvkAuditedNote = { note: { pk: string; amount: string }; commitment: string };
type GvkTxAudit = {
  ledger: number;
  outputs: { commitment: string; note: GvkAuditedNote | null }[];
  inputs: { nullifier: string; note: GvkAuditedNote | null }[];
};

declare global {
  interface Window {
    __sppDevSign?: (kind: SignKind, payload: string, address: string, networkPassphrase: string) => Promise<string>;
    __privatepaySmoke?: typeof smokeApi;
  }
}

function devSigner(address: string): WalletSigner {
  const sign = (kind: SignKind, payload: string) => {
    if (!window.__sppDevSign) throw new Error("dev signer is only available under scripts/smoke.mjs");
    return window.__sppDevSign(kind, payload, address, NETWORK_PASSPHRASE);
  };
  return {
    getPublicKey: async () => address,
    signMessage: async (message) => ({
      signedMessage: await sign("message", message),
      signerAddress: address,
    }),
    signTransaction: async (xdr) => ({
      signedTxXdr: await sign("transaction", xdr),
      signerAddress: address,
    }),
    signAuthEntry: async (xdr) => ({
      signedAuthEntry: await sign("authEntry", xdr),
      signerAddress: address,
    }),
  };
}

async function openAccount(address: string) {
  const { client } = await getSppClient();
  const account = await client.account(
    { networkPassphrase: NETWORK_PASSPHRASE, userAddress: address },
    devSigner(address),
  );
  await account.derivePrivacyKeys();
  return { client, account };
}

const toJson = (value: unknown) =>
  JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item && typeof item.toJSON === "function" ? item.toJSON() : item,
    ),
  );

const smokeApi = {
  async register(address: string) {
    const { account } = await openAccount(address);
    if (!(await account.isRegistered())) await account.registerPublicKeys();
    return {
      registered: await account.isRegistered(),
      notePublicKey: (await account.privacyKeys()).notePublicKey,
    };
  },
  async deposit(address: string, poolContract: string, amount: string) {
    const { client, account } = await openAccount(address);
    // Picks up ASP admissions made since the page booted.
    await client.sync();
    const pool = await account.pool({ poolContract });
    return toJson(await pool.deposit(BigInt(amount)));
  },
  async transfer(address: string, poolContract: string, recipient: string, amount: string) {
    const { account } = await openAccount(address);
    const pool = await account.pool({ poolContract });
    return toJson(await pool.transfer(recipient, BigInt(amount)));
  },
  // The ASP admin admits this leaf with insert_leaf before the account can
  // use an allowlist pool.
  async aspLeaf(address: string) {
    const { account } = await openAccount(address);
    return { leaf: await account.deriveAspUserLeaf() };
  },
  // Compliance view: decrypts every pool transact with the GVK private key.
  async audit(address: string, poolContract: string, viewPrivateKeyHex: string) {
    const { client, account } = await openAccount(address);
    await client.sync();
    const pool = await account.pool({ poolContract });
    const cursor = await pool.audit(viewPrivateKeyHex);
    const txs = [];
    try {
      for (let tx = await cursor.nextTx(); tx; tx = await cursor.nextTx()) {
        const audited = toJson(tx) as GvkTxAudit;
        const notes = (slots: { note: GvkAuditedNote | null }[]) =>
          slots.flatMap(({ note }) => (note ? [{ amount: BigInt(note.note.amount).toString(), pk: note.note.pk }] : []));
        txs.push({ ledger: audited.ledger, outputs: notes(audited.outputs), inputs: notes(audited.inputs) });
      }
    } finally {
      cursor.free();
    }
    return { txs };
  },
  // Out of the pool to the account's own wallet.
  async withdraw(address: string, poolContract: string, amount: string) {
    const { client, account } = await openAccount(address);
    await client.sync();
    const pool = await account.pool({ poolContract });
    return toJson(await pool.withdraw(BigInt(amount)));
  },
  async balance(address: string, poolContract: string) {
    const { client, account } = await openAccount(address);
    await client.sync();
    const pool = await account.pool({ poolContract });
    return { balance: (await pool.balance()).toString() };
  },
  async disclose(address: string, poolContract: string) {
    const { account } = await openAccount(address);
    const pool = await account.pool({ poolContract });
    const note = (await pool.notes()).find((candidate) => !candidate.spent);
    if (!note) throw new Error("no unspent note to disclose");
    const request = new DisclosureRequest(
      [note.id],
      "TroqPay Compliance (demo)",
      randomHex(16),
      "b2b-payment-evidence",
      randomFieldNonce(),
    );
    const receipt = await pool.disclose(request);
    if (!receipt) throw new Error("disclosure returned no receipt");
    return { note: { id: note.id, amount: note.amount }, receipt: receipt.toJSON() };
  },
  // Walletless: whoever receives the receipt verifies it against the chain.
  async verifyReceipt(receipt: unknown, expectedVkHash: string) {
    const { client } = await getSppClient();
    const report = await client.verifySelectiveDisclosure(JSON.stringify(receipt), expectedVkHash);
    return {
      proofVerified: report.proofVerified,
      contextVerified: report.contextVerified,
      knownRootStatus: report.knownRootStatus,
      nullifiersUnspent: report.nullifiersUnspent,
      spentNullifierIndices: Array.from(report.spentNullifierIndices),
    };
  },
};

// Same derivation as the reference app (app/js/disclosure.js): a BN254 field
// element as 64 hex chars.
const BN254_PRIME = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

function randomFieldNonce() {
  const value = BigInt(randomHex(32)) % BN254_PRIME;
  return `0x${value.toString(16).padStart(64, "0")}`;
}

function randomHex(bytes: number) {
  const values = crypto.getRandomValues(new Uint8Array(bytes));
  return `0x${Array.from(values, (value) => value.toString(16).padStart(2, "0")).join("")}`;
}

export function installSmokeHooks() {
  if (!import.meta.env.DEV) return;
  if (new URLSearchParams(window.location.search).get("smoke") !== "1") return;
  window.__privatepaySmoke = smokeApi;
}
