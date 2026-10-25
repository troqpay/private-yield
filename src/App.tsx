import { isConnected } from "@stellar/freighter-api";
import { useEffect, useState } from "react";

import {
  contractConfig,
  getSppClient,
  NETWORK_PASSPHRASE,
  RPC_URL,
  type BootStage,
} from "./spp";

type EnvironmentStatus = {
  stage: BootStage | "error";
  error: string | null;
  needsBootnode: boolean | null;
  publicFeed: unknown[] | null;
  freighter: boolean | null;
};

declare global {
  interface Window {
    // Read by scripts/smoke.mjs; holds no keys or signatures.
    __privatepay?: EnvironmentStatus;
  }
}

export function App() {
  const [status, setStatus] = useState<EnvironmentStatus>({
    stage: "init",
    error: null,
    needsBootnode: null,
    publicFeed: null,
    freighter: null,
  });

  useEffect(() => {
    window.__privatepay = status;
  }, [status]);

  useEffect(() => {
    let cancelled = false;
    const update = (patch: Partial<EnvironmentStatus>) => {
      if (!cancelled) setStatus((current) => ({ ...current, ...patch }));
    };

    isConnected()
      .then((result) => update({ freighter: Boolean(result?.isConnected) }))
      .catch(() => update({ freighter: false }));

    getSppClient((stage) => update({ stage }))
      .then(async ({ client, needsBootnode }) => {
        update({ needsBootnode });
        update({ publicFeed: await client.operationalFeed(10) });
      })
      .catch((error: unknown) =>
        update({
          stage: "error",
          error: error instanceof Error ? error.message : String(error),
        }),
      );

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 880, margin: "32px auto", padding: "0 16px" }}>
      <h1>TroqPay Private Yield — environment check</h1>
      <p>Stellar Testnet only. No real keys or assets.</p>

      <h2>Network</h2>
      <ul>
        <li>Passphrase: {NETWORK_PASSPHRASE}</li>
        <li>RPC: {RPC_URL}</li>
        <li>Freighter detected: {status.freighter === null ? "…" : status.freighter ? "yes" : "no"}</li>
      </ul>

      <h2>SPP SDK</h2>
      <ul>
        <li data-testid="stage">Stage: {status.stage}</li>
        {status.error ? <li style={{ color: "crimson" }}>Error: {status.error}</li> : null}
        <li>Bootnode required: {status.needsBootnode === null ? "…" : String(status.needsBootnode)}</li>
      </ul>

      <h2>Pools ({contractConfig.pools.length})</h2>
      <table cellPadding={6} style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Pool</th>
            <th align="left">Asset</th>
            <th align="left">Policy</th>
            <th align="left">View key</th>
          </tr>
        </thead>
        <tbody>
          {contractConfig.pools.map((pool) => (
            <tr key={pool.poolContractId}>
              <td style={{ fontFamily: "monospace" }}>{pool.poolContractId}</td>
              <td>{pool.asset.kind}</td>
              <td>{(pool.policyFlags ?? []).join(", ") || "open"}</td>
              <td>{pool.gvkMode ?? "none"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Public operational feed</h2>
      <pre style={{ background: "#f4f4f5", padding: 12, overflowX: "auto" }}>
        {status.publicFeed === null ? "…" : JSON.stringify(status.publicFeed, null, 2)}
      </pre>
    </main>
  );
}
