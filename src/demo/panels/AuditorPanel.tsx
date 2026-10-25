import type { AuditedNote, AuditedTransaction } from "../audit";
import { formatAmount } from "../format";

// The operator's compliance view: the demo pools' traceable view key
// decrypts every pool transaction, like a bank reading its own ledger.

export function AuditorPanel(props: { transactions: AuditedTransaction[] | null; usdcPerShare: bigint | null; error: string | null }) {
  const value = (note: AuditedNote) =>
    props.usdcPerShare === null
      ? `${formatAmount(note.shares, 4)} shares`
      : `${formatAmount((note.shares * props.usdcPerShare) / BigInt(10_000_000))} USDC`;
  return (
    <section className="panel" data-testid="panel-auditor">
      <header className="panel-head">
        <h2>What the auditor sees</h2>
        <span className="muted">demo view key</span>
      </header>
      {props.error ? <p className="error">{props.error}</p> : null}
      {props.transactions === null ? (
        <p className="muted">After the payment, the demo view key decrypts the pool: who paid whom, and how much.</p>
      ) : props.transactions.length === 0 ? (
        <p className="muted">No pool transaction from these companies yet.</p>
      ) : (
        <ol className="ledger">
          {props.transactions.map((transaction, index) => (
            <li key={`${transaction.ledger}-${index}`}>
              <span>
                {transaction.inputs.length > 0 ? (
                  <>
                    <strong>{owners(transaction.inputs)}</strong> →{" "}
                  </>
                ) : (
                  <strong>Into the pool: </strong>
                )}
                {transaction.outputs.map((note, noteIndex) => (
                  <span key={noteIndex}>
                    {noteIndex > 0 ? ", " : ""}
                    {note.owner} {value(note)}
                  </span>
                ))}
              </span>
              <span className="muted mono">ledger {transaction.ledger}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function owners(notes: AuditedNote[]): string {
  return [...new Set(notes.map((note) => note.owner))].join(" + ");
}
