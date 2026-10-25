import { useCallback, useEffect, useState } from "react";

import { readSharePrice } from "../core/private-yield";
import type { AuditedTransaction } from "./audit";
import { resetCompanies } from "./companies";
import {
  auditDemoPool,
  cashOutB,
  type CompanyBalances,
  type CompanyName,
  type DemoSession,
  openDemoSession,
  payB,
  proveForB,
  type PublicEvent,
  readBalances,
  type ReceiptChecks,
  setupCompanies,
  simulateYield,
} from "./flow";
import { explorerTx, formatAmount } from "./format";
import { AuditorPanel } from "./panels/AuditorPanel";
import { CompanyPanel } from "./panels/CompanyPanel";
import { PublicPanel } from "./panels/PublicPanel";
import "./demo.css";

// The open demo: TroqPay Private Yield with two disposable companies, on the
// same src/core the TroqPay Global Account uses.

type StepId = "setup" | "pay" | "yield" | "prove" | "cashout";
type StepState = { state: "idle" | "running" | "done" | "error"; detail: string | null; feeLimit?: boolean };

const STEPS: { id: StepId; title: string; description: string }[] = [
  {
    id: "setup",
    title: "Set up two companies",
    description:
      "Disposable accounts funded by Friendbot. Company A buys 100 test USDC on the testnet DEX. Both register privacy keys, and the demo operator admits them to the pool (standing in for KYB).",
  },
  {
    id: "pay",
    title: "Pay Company B 25 USDC privately",
    description:
      "Company A has no protected balance yet, so 100 USDC go into the vault and the vault shares into the pool first, as in the TroqPay app. Then the private payment.",
  },
  {
    id: "yield",
    title: "Simulate yield",
    description:
      "The demo treasury sends USDC to the vault. Every share is worth a little more, protected shares included. On testnet the yield is simulated.",
  },
  {
    id: "prove",
    title: "Company B proves the payment",
    description: "A selective-disclosure receipt for this one payment, verified against the chain with no wallet.",
  },
  {
    id: "cashout",
    title: "Company B cashes out",
    description: "Shares leave the pool, then the vault pays out USDC: more than B was paid, thanks to the yield.",
  },
];

const STAGES: Record<string, string> = {
  funding: "Creating both accounts with Friendbot…",
  "buying-usdc": "Company A is buying 100 test USDC on the DEX…",
  activating: "Registering privacy keys and admitting both companies…",
  protecting: "Moving 100 USDC into the vault and the shares into the pool…",
  paying: "Generating a zero-knowledge proof in your browser (up to a minute the first time)…",
  retrying: "The prover is warming up; trying again…",
};

// Earlier proofs on testnet (EVIDENCE E9 and E12), shown when the network
// cannot take new pool transactions.
const EARLIER_PROOFS = [
  ["Private payment from the TroqPay app, 23 Oct", "984db58719993719418c35f61394b856659a8c4973f7db01c9be4f84de7b789c"],
  ["Private payment received by a TroqPay company, 23 Oct", "17bd5d7096e28682589a85719d2ff8448446c4ea07757f43568246fef359ffaf"],
] as const;

const IDLE: Record<StepId, StepState> = {
  setup: { state: "idle", detail: null },
  pay: { state: "idle", detail: null },
  yield: { state: "idle", detail: null },
  prove: { state: "idle", detail: null },
  cashout: { state: "idle", detail: null },
};

export function DemoApp() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [steps, setSteps] = useState(IDLE);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [balances, setBalances] = useState<Record<CompanyName, CompanyBalances> | null>(null);
  const [usdcPerShare, setUsdcPerShare] = useState<bigint | null>(null);
  const [audit, setAudit] = useState<AuditedTransaction[] | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ link: string; checks: ReceiptChecks; shares: bigint } | null>(null);
  const [cashOut, setCashOut] = useState<{ before: bigint; after: bigint } | null>(null);
  const [yieldPrices, setYieldPrices] = useState<{ before: bigint; after: bigint } | null>(null);

  const onEvent = useCallback((event: PublicEvent) => setEvents((current) => [...current, event]), []);

  const refresh = useCallback(async (current: DemoSession) => {
    try {
      setBalances(await readBalances(current));
    } catch {
      // Balances refresh again after the next step.
    }
    setUsdcPerShare(await readSharePrice(current.wallets.A.api).catch(() => null));
  }, []);

  useEffect(() => {
    openDemoSession(onEvent)
      .then((opened) => {
        setSession(opened);
        void refresh(opened);
      })
      .catch((error: unknown) => setLoadError(error instanceof Error ? error.message : String(error)));
  }, [onEvent, refresh]);

  const run = async (id: StepId, action: (current: DemoSession) => Promise<void>) => {
    if (!session) return;
    setSteps((current) => ({ ...current, [id]: { state: "running", detail: null } }));
    try {
      await action(session);
      setSteps((current) => ({ ...current, [id]: { state: "done", detail: null } }));
    } catch (error) {
      setSteps((current) => ({ ...current, [id]: { state: "error", ...describeError(error) } }));
    }
    await refresh(session);
  };

  const stage = (id: StepId) => (name: string) =>
    setSteps((current) => ({ ...current, [id]: { state: "running", detail: STAGES[name] ?? null } }));

  const refreshAudit = async (current: DemoSession) => {
    try {
      setAudit(await auditDemoPool(current));
      setAuditError(null);
    } catch (error) {
      setAuditError(describeError(error).detail);
    }
  };

  const actions: Record<StepId, (current: DemoSession) => Promise<void>> = {
    setup: (current) => setupCompanies(current, onEvent, stage("setup")),
    pay: async (current) => {
      await payB(current, stage("pay"));
      await refreshAudit(current);
    },
    yield: async (current) => setYieldPrices(await simulateYield(current, onEvent)),
    prove: async (current) => setReceipt(await proveForB(current)),
    cashout: async (current) => {
      setCashOut(await cashOutB(current));
      await refreshAudit(current);
    },
  };

  const order = STEPS.map((step) => step.id);
  const ready = (id: StepId) => {
    const index = order.indexOf(id);
    return Boolean(session) && (index === 0 || steps[order[index - 1]!].state === "done");
  };
  const feeLimit = Object.values(steps).some((step) => step.feeLimit);

  return (
    <main className="pyd">
      <header className="hero">
        <p className="eyebrow">Stellar Testnet demo · TroqPay Private Yield</p>
        <h1>Private B2B payments that keep earning yield</h1>
        <p className="lede">
          A company's protected balance is made of DeFindex vault shares held inside a Stellar Private Payments
          pool. It keeps earning while it stays private, and private payments are paid in those shares. Run the
          five steps and compare what each side sees.
        </p>
        <p className="notice">
          Stellar Testnet. Disposable keys in this browser. Yield is simulated. Nothing here is real money.
        </p>
      </header>

      {loadError ? <p className="error">Could not start the privacy SDK: {loadError}</p> : null}
      {!session && !loadError ? <p className="muted">Loading the privacy SDK and syncing the pool…</p> : null}

      <ol className="steps">
        {STEPS.map((step, index) => {
          const current = steps[step.id];
          return (
            <li key={step.id} className={`step ${current.state}`}>
              <span className="step-number">{index + 1}</span>
              <div className="step-body">
                <h3>{step.title}</h3>
                <p>{step.description}</p>
                {current.state === "running" ? <p className="status">{current.detail ?? "Working…"}</p> : null}
                {current.state === "error" ? <p className="error">{current.detail}</p> : null}
                {step.id === "yield" && yieldPrices ? (
                  <p className="status">
                    One share: {formatAmount(yieldPrices.before, 7)} → {formatAmount(yieldPrices.after, 7)} USDC
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                data-testid={`step-${step.id}`}
                data-state={current.state}
                disabled={!ready(step.id) || current.state === "running"}
                onClick={() => void run(step.id, actions[step.id])}
              >
                {current.state === "running" ? "Running…" : current.state === "done" ? "Run again" : "Run"}
              </button>
            </li>
          );
        })}
      </ol>

      {feeLimit ? (
        <section className="panel notice-panel">
          <h2>Proven earlier on Stellar Testnet</h2>
          <ul>
            {EARLIER_PROOFS.map(([label, hash]) => (
              <li key={hash}>
                {label}:{" "}
                <a href={explorerTx(hash)} target="_blank" rel="noreferrer" className="mono">
                  {hash.slice(0, 12)}…
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid">
        <CompanyPanel name="Company A" address={session?.companies.a.publicKey() ?? null} balances={balances?.A ?? null} />
        <CompanyPanel name="Company B" address={session?.companies.b.publicKey() ?? null} balances={balances?.B ?? null}>
          {receipt ? (
            <div className="receipt" data-testid="receipt">
              <p>
                Receipt for {formatAmount(receipt.shares, 4)} shares:{" "}
                {receipt.checks.proofVerified && receipt.checks.contextVerified && receipt.checks.knownRootStatus
                  ? "verified"
                  : "not verified"}
              </p>
              <a href={receipt.link} target="_blank" rel="noreferrer">
                Open the verification link
              </a>
            </div>
          ) : null}
          {cashOut ? (
            <p className="status" data-testid="cashout">
              Public USDC {formatAmount(cashOut.before)} → {formatAmount(cashOut.after)} after cashing out
            </p>
          ) : null}
        </CompanyPanel>
        <PublicPanel events={events} />
        <AuditorPanel transactions={audit} usdcPerShare={usdcPerShare} error={auditError} />
      </div>

      <footer className="footer">
        <p className="muted">
          Built on Stellar Private Payments (Nethermind) and a standard DeFindex vault (Paltalabs), composed without
          forks. Not audited; testnet only.
        </p>
        <button
          type="button"
          className="link"
          onClick={() => {
            resetCompanies();
            window.location.reload();
          }}
        >
          Reset demo (new companies)
        </button>
      </footer>
    </main>
  );
}

const MESSAGES: Record<string, string> = {
  privatepay_insufficient_balance: "Company A does not have enough USDC for this payment.",
  demo_service_unavailable: "The demo operator is not reachable right now.",
  demo_service_unconfigured: "The demo operator is not configured on this server.",
  yield_cooldown: "Simulated yield runs at most once a minute. Try again shortly.",
  yield_daily_cap: "Today's simulated yield budget is used up.",
  rate_limited: "Too many admissions from this address. Try again later.",
  usdc_purchase_failed: "Could not buy test USDC on the testnet DEX.",
  no_received_payment: "Company B has no received payment yet.",
  nothing_to_cash_out: "Company B has nothing to cash out.",
};

function describeError(error: unknown): { detail: string; feeLimit: boolean } {
  const raw = error instanceof Error ? error.message : String(error);
  if (/does not fit into u32|rent margin/u.test(raw)) {
    return {
      feeLimit: true,
      detail:
        "Stellar Testnet fees are above the per-transaction limit right now (network state above its target). Try again later.",
    };
  }
  return { feeLimit: false, detail: MESSAGES[raw] ?? raw };
}
