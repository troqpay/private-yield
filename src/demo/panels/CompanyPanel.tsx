import type { ReactNode } from "react";

import type { CompanyBalances } from "../flow";
import { explorerAccount, formatAmount, shortAddress } from "../format";

export function CompanyPanel(props: {
  name: string;
  address: string | null;
  balances: CompanyBalances | null;
  children?: ReactNode;
}) {
  const { balances } = props;
  return (
    <section className="panel" data-testid={`panel-${props.name.toLowerCase().replace(/\s+/gu, "-")}`}>
      <header className="panel-head">
        <h2>{props.name}</h2>
        {props.address ? (
          <a href={explorerAccount(props.address)} target="_blank" rel="noreferrer" className="mono">
            {shortAddress(props.address)}
          </a>
        ) : null}
      </header>
      <dl className="figures">
        <div>
          <dt>Public USDC</dt>
          <dd>{balances ? formatAmount(balances.publicUsdc) : "…"}</dd>
        </div>
        <div>
          <dt>Protected, earning</dt>
          <dd>
            {balances ? formatAmount(balances.protectedUsdc) : "…"} <span className="unit">USDC</span>
            <small>{balances ? `${formatAmount(balances.protectedShares, 4)} vault shares` : ""}</small>
          </dd>
        </div>
      </dl>
      {props.children}
    </section>
  );
}
