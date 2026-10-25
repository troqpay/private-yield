import { useEffect, useState } from "react";

import { readReceiptLink } from "../core/receipt";
import { getSppClient } from "../spp";
import { type ReceiptChecks, verifyReceipt } from "./flow";
import "./demo.css";

// Walletless receipt verification for the demo pools: anyone with the link
// (or the receipt JSON) checks it against the chain.

const CHECKS: [keyof ReceiptChecks, string][] = [
  ["proofVerified", "Zero-knowledge proof is valid"],
  ["contextVerified", "Receipt is for this pool, recipient and purpose"],
  ["knownRootStatus", "The note is in the pool's history on chain"],
  ["nullifiersUnspent", "The note has not been spent yet (informational)"],
];

export function VerifyView() {
  const [text, setText] = useState(() => readReceiptLink(window.location.hash) ?? "");
  const [checks, setChecks] = useState<ReceiptChecks | null>(null);
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const verify = async (json: string) => {
    setState("running");
    setError(null);
    try {
      const { client } = await getSppClient();
      setChecks(await verifyReceipt(client, JSON.parse(json)));
      setState("done");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("error");
    }
  };

  useEffect(() => {
    if (text) void verify(text);
    // Only the receipt that came in the link verifies by itself.
  }, []);

  const verified = checks ? checks.proofVerified && checks.contextVerified && checks.knownRootStatus : false;
  return (
    <main className="pyd narrow">
      <header className="hero">
        <p className="eyebrow">Stellar Testnet · Private Yield demo</p>
        <h1>Verify a payment receipt</h1>
        <p className="lede">No wallet and no login: the receipt is checked against the chain in your browser.</p>
      </header>
      <section className="panel">
        <label htmlFor="receipt">Receipt (JSON)</label>
        <textarea id="receipt" rows={6} value={text} onChange={(event) => setText(event.target.value)} className="mono" />
        <button type="button" onClick={() => void verify(text)} disabled={!text || state === "running"} data-state={state}>
          {state === "running" ? "Verifying…" : "Verify"}
        </button>
        {error ? <p className="error">{error}</p> : null}
        {checks ? (
          <>
            <p className={verified ? "verdict ok" : "verdict bad"} data-testid="verdict">
              {verified ? "Verified" : "Not verified"}
            </p>
            <ul className="checks">
              {CHECKS.map(([key, label]) => (
                <li key={key} className={checks[key] ? "ok" : "bad"}>
                  {checks[key] ? "✓" : "✗"} {label}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
      <p className="muted">
        <a href="/">Back to the demo</a>
      </p>
    </main>
  );
}
