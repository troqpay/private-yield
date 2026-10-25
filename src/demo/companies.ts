import { Keypair } from "@stellar/stellar-sdk";

import { createBurner, fundWithFriendbot } from "./burner";

// The two demo companies live in this browser only. Without storage the demo
// still works until the page reloads.

const STORAGE_KEYS = { a: "pyd.companyA", b: "pyd.companyB" } as const;

export type Companies = { a: Keypair; b: Keypair };

export function loadCompanies(): Companies {
  return { a: loadOrCreate(STORAGE_KEYS.a), b: loadOrCreate(STORAGE_KEYS.b) };
}

export async function fundCompanies(companies: Companies): Promise<void> {
  await Promise.all([fundWithFriendbot(companies.a.publicKey()), fundWithFriendbot(companies.b.publicKey())]);
}

export function resetCompanies(): void {
  for (const key of Object.values(STORAGE_KEYS)) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Storage unavailable: nothing was kept.
    }
  }
}

function loadOrCreate(key: string): Keypair {
  try {
    const stored = localStorage.getItem(key);
    if (stored) return Keypair.fromSecret(stored);
  } catch {
    // Unreadable or invalid: start a new company.
  }
  const keypair = createBurner();
  try {
    localStorage.setItem(key, keypair.secret());
  } catch {
    // Storage unavailable: the company lasts until the page reloads.
  }
  return keypair;
}
