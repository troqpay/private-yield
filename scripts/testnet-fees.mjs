// Read-only: how expensive Soroban storage is on Stellar Testnet right now.
// Since protocol 23 the rent per KB grows steeply once the live Soroban state
// passes its target size (CAP-62), and a Private Yield pool entry writes
// several new entries. On 23/10 (at about 1×) a pool entry cost about 6 XLM;
// on 25/10 14:40 UTC (164×) it passed the 429 XLM per-transaction limit.
//
//   node scripts/testnet-fees.mjs             print the current state
//   node scripts/testnet-fees.mjs --max 20    exit 1 while the multiplier is above 20
import { xdr } from "@stellar/stellar-sdk";

const RPC_URL = "https://soroban-testnet.stellar.org";
const MAX = process.argv.includes("--max") ? Number(process.argv[process.argv.indexOf("--max") + 1]) : null;

const call = async (method, params) => {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const { result, error } = await response.json();
  if (error) throw new Error(`${method}: ${error.message}`);
  return result;
};
const key = (name) =>
  xdr.LedgerKey.configSetting(new xdr.LedgerKeyConfigSetting({ configSettingId: xdr.ConfigSettingId[name]() })).toXDR("base64");

const { entries, latestLedger } = await call("getLedgerEntries", {
  keys: [key("configSettingContractLedgerCostV0"), key("configSettingLiveSorobanStateSizeWindow")],
});
const cost = xdr.LedgerEntryData.fromXDR(entries[0].xdr, "base64").configSetting().value();
const window = xdr.LedgerEntryData.fromXDR(entries[1].xdr, "base64").configSetting().value().map(Number);

const target = Number(cost.sorobanStateTargetSizeBytes());
const low = Number(cost.rentFee1KbSorobanStateSizeLow());
const high = Number(cost.rentFee1KbSorobanStateSizeHigh());
const growth = cost.sorobanStateRentFeeGrowthFactor();
const rentPerKb = (size) =>
  size <= target ? low + ((high - low) * size) / target : high + ((high - low) * growth * (size - target)) / target;

const average = window.reduce((sum, size) => sum + size, 0) / window.length;
const multiplier = rentPerKb(average) / rentPerKb(target);
// Samples are 64 ledgers (about 5.5 minutes) apart.
const mbPerHour = (window.at(-1) - window[0]) / 1e6 / (((window.length - 1) * 64 * 5.5) / 3600);

console.log(`ledger ${latestLedger} at ${new Date().toISOString()}`);
console.log(`live Soroban state: average ${(average / 1e6).toFixed(1)} MB, latest ${(window.at(-1) / 1e6).toFixed(1)} MB, target ${(target / 1e6).toFixed(0)} MB`);
console.log(`rent per KB: ${multiplier < 1 ? "at or below" : `${multiplier.toFixed(0)}×`} the at-target rate; state trend ${mbPerHour >= 0 ? "+" : ""}${mbPerHour.toFixed(1)} MB/h`);
if (MAX !== null) process.exitCode = multiplier <= MAX ? 0 : 1;
