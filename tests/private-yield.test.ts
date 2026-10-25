import { describe, expect, it } from "vitest";

import { sharesFor, toStroops, topUpAmount } from "../src/core/private-yield";

const usdc = (value: number) => BigInt(Math.round(value * 1e7));

describe("Private Yield amounts", () => {
  it("converts a USDC amount into vault shares, rounding up", () => {
    expect(sharesFor(usdc(50), usdc(1))).toBe(usdc(50));
    expect(sharesFor(usdc(11), usdc(1.1))).toBe(usdc(10));
    expect(sharesFor(usdc(10), usdc(1.1))).toBe(BigInt(90909091));
  });

  it("pays from protected shares without moving public USDC when they cover the payment", () => {
    expect(
      topUpAmount({ neededShares: usdc(40), protectedShares: usdc(50), usdcPerShare: usdc(1), publicUsdc: usdc(90) }),
    ).toBe(BigInt(0));
  });

  it("moves the shortfall rounded up to the next 100 USDC, capped by the public balance", () => {
    expect(
      topUpAmount({ neededShares: usdc(50), protectedShares: BigInt(0), usdcPerShare: usdc(1), publicUsdc: usdc(500) }),
    ).toBe(usdc(100));
    expect(
      topUpAmount({ neededShares: usdc(50), protectedShares: BigInt(0), usdcPerShare: usdc(1), publicUsdc: usdc(90) }),
    ).toBe(usdc(90));
  });

  it("refuses a payment the public and protected balances cannot cover", () => {
    expect(() =>
      topUpAmount({ neededShares: usdc(100), protectedShares: usdc(5), usdcPerShare: usdc(1), publicUsdc: usdc(90) }),
    ).toThrow("privatepay_insufficient_balance");
  });

  it("parses amounts typed with a comma or a dot", () => {
    expect(toStroops("10,5")).toBe(usdc(10.5));
    expect(toStroops("0")).toBeNull();
  });
});
