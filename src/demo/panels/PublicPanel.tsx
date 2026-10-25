import type { PublicEvent, PublicLabel } from "../flow";
import { explorerTx } from "../format";

// What anyone sees on the public ledger, one line per transaction.
const PHRASES: Record<PublicLabel, string> = {
  "usdc-purchase": "bought test USDC on the DEX",
  "usdc-trustline": "opened a USDC trustline",
  admission: "admitted a company to the allowlist (demo KYB)",
  registration: "registered privacy keys",
  "vault-deposit": "put USDC into the vault (amount public)",
  "pool-deposit": "moved vault shares into the pool (amount public)",
  "pool-transfer": "called the pool: no recipient, no amount",
  yield: "sent USDC to the vault (simulated yield)",
  "pool-withdraw": "took vault shares out of the pool (amount public)",
  "vault-withdraw": "redeemed vault shares for USDC (amount public)",
};

const ACTORS = { A: "Company A", B: "Company B", operator: "Demo operator" } as const;

export function PublicPanel(props: { events: PublicEvent[] }) {
  return (
    <section className="panel" data-testid="panel-public">
      <header className="panel-head">
        <h2>What the public sees</h2>
      </header>
      {props.events.length === 0 ? (
        <p className="muted">Every transaction of this demo appears here, with a link to the public explorer.</p>
      ) : (
        <ol className="ledger">
          {props.events.map((event) => (
            <li key={`${event.hash}-${event.label}`} className={event.label === "pool-transfer" ? "highlight" : undefined}>
              <span>
                <strong>{ACTORS[event.company]}</strong> {PHRASES[event.label]}
                {event.label === "pool-transfer" ? <em> This is the private payment.</em> : null}
              </span>
              <a href={explorerTx(event.hash)} target="_blank" rel="noreferrer" className="mono" data-label={event.label}>
                {event.hash.slice(0, 8)}…
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
