// Display helpers for stroop amounts (7 decimals) and explorer links.

export function formatAmount(stroops: bigint, digits = 2): string {
  return (Number(stroops) / 1e7).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export const explorerTx = (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`;
export const explorerAccount = (address: string) => `https://stellar.expert/explorer/testnet/account/${address}`;
