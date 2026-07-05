import { describe, expect, it } from "vitest";
import { computeDiscount, type CouponForDiscount } from "./compute";

const PERCENT: CouponForDiscount = {
  discount_type: "percent",
  discount_value: 1000, // 10%
  min_order_paise: 0,
};

const FLAT: CouponForDiscount = {
  discount_type: "flat",
  discount_value: 50000, // ₹500
  min_order_paise: 0,
};

describe("computeDiscount", () => {
  it("percent: 10% of 100 000 paise = 10 000", () => {
    expect(computeDiscount(PERCENT, 100_000)).toBe(10_000);
  });

  it("percent: rounds half-up (ADR-0011)", () => {
    // 10% of 10 005 = 1000.5 → rounds to 1001
    expect(computeDiscount(PERCENT, 10_005)).toBe(1001);
  });

  it("flat: subtracts the fixed amount", () => {
    expect(computeDiscount(FLAT, 200_000)).toBe(50_000);
  });

  it("flat: capped at subtotal — never negative", () => {
    expect(computeDiscount(FLAT, 30_000)).toBe(30_000);
  });

  it("min_order not met → 0", () => {
    const c: CouponForDiscount = { ...PERCENT, min_order_paise: 200_000 };
    expect(computeDiscount(c, 100_000)).toBe(0);
  });

  it("min_order exactly met → discount applies", () => {
    const c: CouponForDiscount = { ...PERCENT, min_order_paise: 100_000 };
    expect(computeDiscount(c, 100_000)).toBe(10_000);
  });

  it("zero subtotal → 0 for percent", () => {
    expect(computeDiscount(PERCENT, 0)).toBe(0);
  });

  it("zero subtotal → flat capped at 0", () => {
    expect(computeDiscount(FLAT, 0)).toBe(0);
  });
});
