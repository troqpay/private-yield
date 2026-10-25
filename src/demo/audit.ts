import type { Account } from "stellar-private-payments";

// The auditor's view: the pool's traceable view key decrypts every pool
// transaction. Shape of GvkAudit.nextTx() results, from
// sdk/native/src/gvk/audit.rs @ ea39d0c (the bundled .d.ts is out of date);
// `note` is null for dummy slots.
type GvkAuditedNote = { note: { pk: string; amount: string }; commitment: string };
type GvkTxAudit = {
  ledger: number;
  outputs: { commitment: string; note: GvkAuditedNote | null }[];
  inputs: { nullifier: string; note: GvkAuditedNote | null }[];
};

export type AuditedNote = { owner: string; shares: bigint };
export type AuditedTransaction = { ledger: number; inputs: AuditedNote[]; outputs: AuditedNote[] };

/**
 * Decrypts the pool and keeps the transactions that touch one of the named
 * companies. `names` maps each company's notePublicKey to its name.
 */
export async function auditPool(input: {
  account: Account;
  pool: string;
  viewKey: string;
  names: Record<string, string>;
}): Promise<AuditedTransaction[]> {
  // Audited notes carry the note public key in the opposite byte order of
  // Account.privacyKeys().notePublicKey.
  const owners = Object.fromEntries(Object.entries(input.names).map(([key, name]) => [reverseBytes(key), name]));
  const pool = await input.account.pool({ poolContract: input.pool });
  const cursor = await pool.audit(input.viewKey);
  const transactions: AuditedTransaction[] = [];
  try {
    for (let tx = await cursor.nextTx(); tx; tx = await cursor.nextTx()) {
      const audited = toJson(tx) as GvkTxAudit;
      const notes = (slots: { note: GvkAuditedNote | null }[]) =>
        slots.flatMap(({ note }) =>
          note ? [{ owner: owners[note.note.pk] ?? "another company", shares: BigInt(note.note.amount) }] : [],
        );
      const entry = { ledger: audited.ledger, inputs: notes(audited.inputs), outputs: notes(audited.outputs) };
      if ([...entry.inputs, ...entry.outputs].some((note) => note.owner !== "another company")) transactions.push(entry);
    }
  } finally {
    cursor.free();
  }
  return transactions;
}

function reverseBytes(hex: string): string {
  return `0x${(hex.replace(/^0x/u, "").match(/../gu) ?? []).reverse().join("")}`;
}

function toJson(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_key, item) =>
      typeof item === "bigint" ? item.toString() : item && typeof item.toJSON === "function" ? item.toJSON() : item,
    ),
  );
}
