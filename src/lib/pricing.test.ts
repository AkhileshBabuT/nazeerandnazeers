import { describe, it, expect } from "vitest";
import {
  calculatePrice,
  type PricingProduct,
  type PricingRate,
  type PricingSettings,
} from "./pricing";

/**
 * Pricing tests — pure, no DB. Asserts the returned integer Paise for product
 * inputs + a rate + settings, exactly per ADR-0011 (gold karat scaling, silver
 * factor 1.0, flat vs percent making charge, disjoint GST bases, round-half-up,
 * per-component-then-sum). All money is integer Paise.
 */

const GST: Pick<PricingSettings, "gst_metal_bps" | "gst_making_bps"> = {
  gst_metal_bps: 300, // 3%
  gst_making_bps: 500, // 5%
};

function gold(overrides: Partial<PricingProduct> = {}): PricingProduct {
  return {
    material: "gold",
    weight_grams: "10",
    purity_karat: 24,
    making_charge_type: "flat",
    making_charge_value: 0,
    ...overrides,
  };
}

describe("calculatePrice — metal value & karat scaling", () => {
  it("computes 24k gold metal value as weight × rate (purity_factor = 1)", () => {
    // 10g × ₹6000/g (600000 paise) × 24/24 = ₹60,000 = 6,000,000 paise
    const rate: PricingRate = { material: "gold", rate_per_gram_paise: 600000 };
    const result = calculatePrice(gold({ purity_karat: 24 }), rate, GST);
    expect(result.metal_value).toBe(6_000_000);
  });

  it("scales 22k gold metal value by 22/24", () => {
    // 10g × 600000 × 22/24 = 5,500,000 paise exactly
    const rate: PricingRate = { material: "gold", rate_per_gram_paise: 600000 };
    const result = calculatePrice(gold({ purity_karat: 22 }), rate, GST);
    expect(result.metal_value).toBe(5_500_000);
  });

  it("treats silver with purity_factor = 1.0 (no karat scaling)", () => {
    // 50g × ₹80/g (8000 paise) × 1.0 = ₹4,000 = 400,000 paise
    const rate: PricingRate = { material: "silver", rate_per_gram_paise: 8000 };
    const product: PricingProduct = {
      material: "silver",
      weight_grams: "50",
      purity_karat: null,
      making_charge_type: "flat",
      making_charge_value: 0,
    };
    const result = calculatePrice(product, rate, GST);
    expect(result.metal_value).toBe(400_000);
  });
});

describe("calculatePrice — making charge", () => {
  it("flat making charge is taken as Paise verbatim", () => {
    const rate: PricingRate = { material: "gold", rate_per_gram_paise: 600000 };
    const result = calculatePrice(
      gold({ making_charge_type: "flat", making_charge_value: 150000 }),
      rate,
      GST,
    );
    expect(result.making_charges).toBe(150000);
  });

  it("percent making charge is metal_value × bps / 10000", () => {
    // metal_value = 6,000,000; 12% (1200 bps) = 720,000 paise
    const rate: PricingRate = { material: "gold", rate_per_gram_paise: 600000 };
    const result = calculatePrice(
      gold({ making_charge_type: "percent", making_charge_value: 1200 }),
      rate,
      GST,
    );
    expect(result.metal_value).toBe(6_000_000);
    expect(result.making_charges).toBe(720_000);
  });
});

describe("calculatePrice — disjoint GST bases", () => {
  it("applies 3% on metal value and 5% on making charge separately", () => {
    // metal_value 6,000,000 → 3% = 180,000
    // making 720,000 → 5% = 36,000
    // gst = 216,000
    const rate: PricingRate = { material: "gold", rate_per_gram_paise: 600000 };
    const result = calculatePrice(
      gold({ making_charge_type: "percent", making_charge_value: 1200 }),
      rate,
      GST,
    );
    expect(result.gst).toBe(216_000);
    expect(result.total).toBe(6_000_000 + 720_000 + 216_000);
  });
});

describe("calculatePrice — rounding (round half up, per component then sum)", () => {
  it("rounds metal value half up at the .5 boundary", () => {
    // Construct a fractional metal value: weight 1g, rate 1 paise, 22k
    // 1 × 1 × 22/24 = 0.91666... → rounds to 1
    const rate: PricingRate = { material: "gold", rate_per_gram_paise: 1 };
    const result = calculatePrice(
      gold({ weight_grams: "1", purity_karat: 22, making_charge_value: 0 }),
      rate,
      { gst_metal_bps: 0, gst_making_bps: 0 },
    );
    expect(result.metal_value).toBe(1);
  });

  it("rounds exactly .5 up (not banker's rounding)", () => {
    // metal_value whose GST lands on a .5 boundary.
    // metal_value = 1650 paise, gst_metal_bps = 1 → 1650 × 1 / 10000 = 0.165 → 0
    // Use a value engineered to hit X.5: metal_value=5000, bps=1 → 0.5 → 1
    const rate: PricingRate = { material: "gold", rate_per_gram_paise: 500 };
    const result = calculatePrice(
      gold({ weight_grams: "10", purity_karat: 24, making_charge_value: 0 }),
      rate,
      { gst_metal_bps: 1, gst_making_bps: 0 },
    );
    // metal_value = 10 × 500 = 5000; gst = 5000 × 1 / 10000 = 0.5 → round half up = 1
    expect(result.metal_value).toBe(5000);
    expect(result.gst).toBe(1);
  });

  it("components re-sum exactly to total (no paisa drift)", () => {
    // A messy case: fractional weight + percent making + disjoint GST.
    const rate: PricingRate = { material: "gold", rate_per_gram_paise: 633317 };
    const result = calculatePrice(
      gold({
        weight_grams: "7.35",
        purity_karat: 22,
        making_charge_type: "percent",
        making_charge_value: 1100,
      }),
      rate,
      GST,
    );
    expect(result.metal_value + result.making_charges + result.gst).toBe(
      result.total,
    );
    // All integers
    expect(Number.isInteger(result.metal_value)).toBe(true);
    expect(Number.isInteger(result.making_charges)).toBe(true);
    expect(Number.isInteger(result.gst)).toBe(true);
    expect(Number.isInteger(result.total)).toBe(true);
  });
});

describe("calculatePrice — full worked example", () => {
  it("computes a complete 22k gold price with flat making + GST", () => {
    // 10g × ₹6000/g × 22/24 = 5,500,000 paise metal value
    // flat making = 200,000 paise
    // gst = 5,500,000 × 3% + 200,000 × 5% = 165,000 + 10,000 = 175,000
    // total = 5,500,000 + 200,000 + 175,000 = 5,875,000
    const rate: PricingRate = { material: "gold", rate_per_gram_paise: 600000 };
    const result = calculatePrice(
      gold({
        weight_grams: "10",
        purity_karat: 22,
        making_charge_type: "flat",
        making_charge_value: 200000,
      }),
      rate,
      GST,
    );
    expect(result).toEqual({
      metal_value: 5_500_000,
      making_charges: 200_000,
      gst: 175_000,
      total: 5_875_000,
    });
  });
});
