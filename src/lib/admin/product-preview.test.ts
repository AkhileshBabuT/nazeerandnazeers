import { describe, expect, it } from "vitest";
import { calculatePrice, type PricingSettings } from "@/lib/pricing";
import {
  parseProductForm,
  previewPrice,
  type ProductFormValues,
} from "./product-preview";

const settings: PricingSettings = { gst_metal_bps: 300, gst_making_bps: 500 };
const NOW = Date.parse("2026-06-11T09:00:00Z");
const MAX_AGE = 86400;

/** Fresh rate row posted an hour ago. */
const freshRate = {
  rate_per_gram_paise: 724500,
  effective_at: new Date(NOW - 3600 * 1000).toISOString(),
};

const goldValues: ProductFormValues = {
  sku: "NN-J-001",
  name: "Paisley Jhumka",
  description: "",
  material: "gold",
  category_id: "11111111-1111-1111-1111-111111111111",
  audience_id: "22222222-2222-2222-2222-222222222222",
  weight_grams: "7.350",
  purity_karat: "22",
  making_charge_type: "flat",
  making_charge_value: "8500.00",
  hallmark_huid: "AB1234",
  stock_quantity: "3",
};

describe("previewPrice", () => {
  it("returns rate_unavailable/missing when no rate row exists", () => {
    expect(previewPrice(goldValues, null, MAX_AGE, settings, NOW)).toEqual({
      status: "rate_unavailable",
      reason: "missing",
    });
  });

  it("returns rate_unavailable/stale past the ceiling (RATE STALE variant)", () => {
    const staleRow = {
      rate_per_gram_paise: 724500,
      effective_at: new Date(NOW - 2 * 86400 * 1000).toISOString(),
    };
    expect(previewPrice(goldValues, staleRow, MAX_AGE, settings, NOW)).toEqual({
      status: "rate_unavailable",
      reason: "stale",
    });
  });

  it("prices a complete gold form via the pure pricing module", () => {
    const result = previewPrice(goldValues, freshRate, MAX_AGE, settings, NOW);
    const expected = calculatePrice(
      {
        material: "gold",
        weight_grams: "7.350",
        purity_karat: 22,
        making_charge_type: "flat",
        making_charge_value: 850000,
      },
      { material: "gold", rate_per_gram_paise: 724500 },
      settings,
    );
    expect(result.status).toBe("priced");
    if (result.status !== "priced") {
      return;
    }
    expect(result.price).toEqual(expected);
    // Display split must sum exactly to the computed GST (ADR-0011).
    expect(result.split.gst_metal + result.split.gst_making).toBe(
      expected.gst,
    );
    expect(result.ratePaise).toBe(724500);
    expect(result.effectiveAt).toBe(freshRate.effective_at);
  });

  it("gold without a purity is incomplete (gold-only branch)", () => {
    const result = previewPrice(
      { ...goldValues, purity_karat: "" },
      freshRate,
      MAX_AGE,
      settings,
      NOW,
    );
    expect(result).toEqual({ status: "incomplete" });
  });

  it("gold with an out-of-range karat is incomplete", () => {
    const result = previewPrice(
      { ...goldValues, purity_karat: "25" },
      freshRate,
      MAX_AGE,
      settings,
      NOW,
    );
    expect(result).toEqual({ status: "incomplete" });
  });

  it("silver prices WITHOUT purity (purity is gold-only)", () => {
    const result = previewPrice(
      { ...goldValues, material: "silver", purity_karat: "" },
      { rate_per_gram_paise: 9240, effective_at: freshRate.effective_at },
      MAX_AGE,
      settings,
      NOW,
    );
    expect(result.status).toBe("priced");
    if (result.status !== "priced") {
      return;
    }
    expect(result.price).toEqual(
      calculatePrice(
        {
          material: "silver",
          weight_grams: "7.350",
          purity_karat: null,
          making_charge_type: "flat",
          making_charge_value: 850000,
        },
        { material: "silver", rate_per_gram_paise: 9240 },
        settings,
      ),
    );
  });

  it("sub-paise flat making value is incomplete (rejected, not rounded)", () => {
    const result = previewPrice(
      { ...goldValues, making_charge_value: "8500.555" },
      freshRate,
      MAX_AGE,
      settings,
      NOW,
    );
    expect(result).toEqual({ status: "incomplete" });
  });

  it("percent making converts to bps before pricing", () => {
    const result = previewPrice(
      {
        ...goldValues,
        making_charge_type: "percent",
        making_charge_value: "12.5",
      },
      freshRate,
      MAX_AGE,
      settings,
      NOW,
    );
    expect(result.status).toBe("priced");
    if (result.status !== "priced") {
      return;
    }
    expect(result.price).toEqual(
      calculatePrice(
        {
          material: "gold",
          weight_grams: "7.350",
          purity_karat: 22,
          making_charge_type: "percent",
          making_charge_value: 1250,
        },
        { material: "gold", rate_per_gram_paise: 724500 },
        settings,
      ),
    );
  });

  it("an unparseable weight is incomplete", () => {
    const result = previewPrice(
      { ...goldValues, weight_grams: "" },
      freshRate,
      MAX_AGE,
      settings,
      NOW,
    );
    expect(result).toEqual({ status: "incomplete" });
  });
});

describe("parseProductForm", () => {
  it("builds a gold ProductInput with converted paise/karat", () => {
    const result = parseProductForm(goldValues, true);
    expect(result).toEqual({
      ok: true,
      input: {
        sku: "NN-J-001",
        name: "Paisley Jhumka",
        description: null,
        material: "gold",
        category_id: "11111111-1111-1111-1111-111111111111",
        audience_id: "22222222-2222-2222-2222-222222222222",
        weight_grams: "7.350",
        purity_karat: 22,
        making_charge_type: "flat",
        making_charge_value: 850000,
        hallmark_huid: "AB1234",
        stock_quantity: 3,
        is_active: true,
      },
    });
  });

  it("silver nulls purity and HUID even when typed", () => {
    const result = parseProductForm(
      { ...goldValues, material: "silver" },
      true,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input.purity_karat).toBeNull();
    expect(result.input.hallmark_huid).toBeNull();
  });

  it("gold with an EMPTY purity passes null through (server zod owns the message)", () => {
    const result = parseProductForm({ ...goldValues, purity_karat: "" }, true);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.input.purity_karat).toBeNull();
  });

  it("rejects sub-paise flat making value with a field error", () => {
    const result = parseProductForm(
      { ...goldValues, making_charge_value: "10.555" },
      true,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.fieldErrors.making_charge_value?.[0]).toMatch(/exact paise/);
  });

  it("rejects fractional stock", () => {
    const result = parseProductForm(
      { ...goldValues, stock_quantity: "1.5" },
      true,
    );
    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }
    expect(result.fieldErrors.stock_quantity).toBeDefined();
  });
});
