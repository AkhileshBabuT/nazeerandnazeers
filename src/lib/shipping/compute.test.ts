import { describe, expect, it } from "vitest";
import { computeShipping, type ShippingMethodRates } from "./compute";

const FLAT: ShippingMethodRates = {
  base_rate_paise: 10000,
  per_gram_paise: 0,
  free_above_paise: null,
};

const WEIGHT_TIERED: ShippingMethodRates = {
  base_rate_paise: 5000,
  per_gram_paise: 100,
  free_above_paise: null,
};

const FREE_ABOVE: ShippingMethodRates = {
  base_rate_paise: 10000,
  per_gram_paise: 0,
  free_above_paise: 500000, // free above ₹5 000
};

describe("computeShipping", () => {
  it("flat rate: base only, no weight component", () => {
    expect(computeShipping(FLAT, 100, 0)).toBe(10000);
  });

  it("weight-tiered: base + round(grams × per_gram)", () => {
    // 5000 + round(15.7 × 100) = 5000 + round(1570) = 6570
    expect(computeShipping(WEIGHT_TIERED, 15.7, 0)).toBe(6570);
  });

  it("rounds half-up on per_gram component (ADR-0011)", () => {
    // base 0 + round(10.5 × 1) = round(10.5) = 11
    const m: ShippingMethodRates = { base_rate_paise: 0, per_gram_paise: 1, free_above_paise: null };
    expect(computeShipping(m, 10.5, 0)).toBe(11);
  });

  it("free threshold not met: normal rate applies", () => {
    expect(computeShipping(FREE_ABOVE, 0, 499999)).toBe(10000);
  });

  it("free threshold exactly met: returns 0", () => {
    expect(computeShipping(FREE_ABOVE, 50, 500000)).toBe(0);
  });

  it("free threshold exceeded: returns 0", () => {
    expect(computeShipping(FREE_ABOVE, 50, 600000)).toBe(0);
  });

  it("local pickup (zero rate): always 0 regardless of weight/total", () => {
    const pickup: ShippingMethodRates = { base_rate_paise: 0, per_gram_paise: 0, free_above_paise: null };
    expect(computeShipping(pickup, 9999, 0)).toBe(0);
  });
});
