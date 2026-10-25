import { describe, expect, it } from "vitest";

import { readReceiptLink, receiptLink } from "../src/core/receipt";

describe("Receipt links", () => {
  it("carries the receipt in the URL fragment and reads it back unchanged", () => {
    const receipt = { circuit: { name: "selectiveDisclosure_1" }, context: { purpose: "payment-receipt", authorityLabel: "Contador ção" } };
    const link = receiptLink(receipt, "https://example.org/verify");

    expect(link.startsWith("https://example.org/verify#r=")).toBe(true);
    // base64url, so the fragment survives chat apps and e-mail clients
    expect(link.split("#r=")[1]).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(JSON.parse(readReceiptLink(new URL(link).hash)!)).toEqual(receipt);
  });

  it("returns null for a link without a receipt", () => {
    expect(readReceiptLink("#other=1")).toBeNull();
  });
});
