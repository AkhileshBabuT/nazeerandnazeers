import { describe, it, expect } from "vitest";
import {
  resolveVariant,
  variantPricingInputs,
  type ProductVariant,
} from "./resolve";
import { calculatePrice } from "../pricing";
import type { Database } from "@/lib/supabase/database.types";

const baseVariant: ProductVariant = {
  id: "v1",
  product_id: "p1",
  sku: "SKU-22K",
  size_label: null,
  metal_tone: null,
  weight_grams: "5.000",
  purity_karat: 22,
  making_charge_type: "flat",
  making_charge_value: 50000,
  stock_quantity: 10,
  hallmark_huid: "AB123456",
  is_active: true,
};

const variant24k: ProductVariant = {
  ...baseVariant,
  id: "v2",
  sku: "SKU-24K",
  purity_karat: 24,
};

describe("resolveVariant", () => {
  it("returns null when variants array is empty", () => {
    expect(resolveVariant([], { purity_karat: 22 })).toBeNull();
  });

  it("resolves by purity_karat", () => {
    const result = resolveVariant([baseVariant, variant24k], { purity_karat: 22 });
    expect(result?.id).toBe("v1");
  });

  it("returns null when no match", () => {
    expect(resolveVariant([baseVariant], { purity_karat: 18 })).toBeNull();
  });

  it("skips inactive variants", () => {
    const inactive = { ...baseVariant, is_active: false };
    expect(resolveVariant([inactive], { purity_karat: 22 })).toBeNull();
  });

  it("matches null purity_karat when selected is null/undefined", () => {
    const nullKarat: ProductVariant = {
      ...baseVariant,
      id: "v3",
      sku: "SKU-SILVER",
      purity_karat: null,
    };
    expect(resolveVariant([nullKarat], { purity_karat: null })).not.toBeNull();
    expect(resolveVariant([nullKarat], {})).not.toBeNull();
  });

  it("resolves with size_label dimension", () => {
    const small: ProductVariant = { ...baseVariant, id: "vs", sku: "SKU-S", size_label: "US 6" };
    const large: ProductVariant = { ...baseVariant, id: "vl", sku: "SKU-L", size_label: "US 8" };
    expect(resolveVariant([small, large], { purity_karat: 22, size_label: "US 8" })?.id).toBe("vl");
  });
});

describe("size variants — size changes weight → price", () => {
  const rate = { material: "gold" as const, rate_per_gram_paise: 724500 };
  const settings = { gst_metal_bps: 300, gst_making_bps: 500 };

  const variantSmall: ProductVariant = {
    id: "vs1", product_id: "p1", sku: "SKU-S",
    size_label: "US 6", metal_tone: null,
    weight_grams: "4.000", purity_karat: 22,
    making_charge_type: "flat", making_charge_value: 50000,
    stock_quantity: 5, hallmark_huid: "AA111111", is_active: true,
  };
  const variantLarge: ProductVariant = {
    ...variantSmall, id: "vs2", sku: "SKU-L",
    size_label: "US 8", weight_grams: "5.500",
  };

  it("resolves size_label correctly", () => {
    const v = resolveVariant([variantSmall, variantLarge], { size_label: "US 8", purity_karat: 22 });
    expect(v?.id).toBe("vs2");
  });

  it("larger size gives higher price", () => {
    const i1 = variantPricingInputs(variantSmall, "gold");
    const i2 = variantPricingInputs(variantLarge, "gold");
    const p1 = calculatePrice(i1, rate, settings);
    const p2 = calculatePrice(i2, rate, settings);
    expect(p2.total).toBeGreaterThan(p1.total);
  });

  it("size×purity combination resolves uniquely", () => {
    const v22S = { ...variantSmall, purity_karat: 22 };
    const v24S = { ...variantSmall, id: "vs3", sku: "SKU-24S", purity_karat: 24 };
    const v22L = { ...variantLarge, purity_karat: 22 };
    const v24L = { ...variantLarge, id: "vs4", sku: "SKU-24L", purity_karat: 24 };
    const all = [v22S, v24S, v22L, v24L];
    expect(resolveVariant(all, { size_label: "US 8", purity_karat: 24 })?.sku).toBe("SKU-24L");
    expect(resolveVariant(all, { size_label: "US 6", purity_karat: 22 })?.sku).toBe("SKU-S");
  });

  it("unavailable (OOS) size is not selectable", () => {
    const oosVariant = { ...variantSmall, stock_quantity: 0 };
    // resolveVariant returns the variant (OOS check is caller's responsibility),
    // but stock_quantity === 0 is the signal.
    const v = resolveVariant([oosVariant], { size_label: "US 6", purity_karat: 22 });
    expect(v?.stock_quantity).toBe(0); // Found, but OOS
  });
});

describe("variantPricingInputs + price change on purity", () => {
  const rate = { material: "gold" as const, rate_per_gram_paise: 724500 }; // ₹7,245/g
  const settings = { gst_metal_bps: 300, gst_making_bps: 500 };

  it("22k and 24k give different prices", () => {
    const inputs22 = variantPricingInputs(baseVariant, "gold");
    const inputs24 = variantPricingInputs(variant24k, "gold");
    const price22 = calculatePrice(inputs22, rate, settings);
    const price24 = calculatePrice(inputs24, rate, settings);
    expect(price24.total).toBeGreaterThan(price22.total);
  });

  it("pricing inputs come from variant, not product base", () => {
    const inputs = variantPricingInputs(baseVariant, "gold");
    expect(inputs.purity_karat).toBe(22);
    expect(inputs.weight_grams).toBe("5.000");
  });

  it("variantPricingInputs accepts numeric weight_grams", () => {
    const numericVariant: ProductVariant = { ...baseVariant, weight_grams: 5.0 };
    const inputs = variantPricingInputs(numericVariant, "gold");
    expect(inputs.weight_grams).toBe("5");
  });
});

describe("metal-tone — cosmetic, does not change price", () => {
  const rate = { material: "gold" as const, rate_per_gram_paise: 724500 };
  const settings = { gst_metal_bps: 300, gst_making_bps: 500 };

  // Two variants identical except for metal_tone.
  const yellowVariant: ProductVariant = {
    id: "vt1", product_id: "p1", sku: "SKU-YLW",
    size_label: null, metal_tone: "yellow",
    weight_grams: "5.000", purity_karat: 22,
    making_charge_type: "flat", making_charge_value: 50000,
    stock_quantity: 5, hallmark_huid: "AA000001", is_active: true,
  };
  const whiteVariant: ProductVariant = {
    ...yellowVariant, id: "vt2", sku: "SKU-WHT", metal_tone: "white",
  };
  const roseVariant: ProductVariant = {
    ...yellowVariant, id: "vt3", sku: "SKU-RSE", metal_tone: "rose",
  };

  it("resolves by metal_tone", () => {
    const result = resolveVariant([yellowVariant, whiteVariant, roseVariant], { purity_karat: 22, metal_tone: "white" });
    expect(result?.id).toBe("vt2");
  });

  it("changing only tone does NOT change price", () => {
    const iy = variantPricingInputs(yellowVariant, "gold");
    const iw = variantPricingInputs(whiteVariant, "gold");
    const ir = variantPricingInputs(roseVariant, "gold");
    const py = calculatePrice(iy, rate, settings);
    const pw = calculatePrice(iw, rate, settings);
    const pr = calculatePrice(ir, rate, settings);
    // All tones have same weight/purity → same price
    expect(pw.total).toBe(py.total);
    expect(pr.total).toBe(py.total);
  });

  it("tone is carried in snapshot via metal_tone_snapshot column", () => {
    // Compile-time check: order_items has the column
    type OIRow = Database["public"]["Tables"]["order_items"]["Row"];
    const _exists: "metal_tone_snapshot" extends keyof OIRow ? true : false = true;
    expect(_exists).toBe(true);
  });
});
