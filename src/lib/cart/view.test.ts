import { describe, it, expect } from "vitest";
import { computeCartView, type CartViewLineInput } from "./view";
import { RateUnavailableError } from "../rates";
import type { Material, PricingRate, PricingSettings } from "../pricing";

/**
 * Cart view tests — the live-recompute contract (ADR-0002, ADR-0010), pure and
 * no DB. The rate resolver is injected, so the same Cart priced under two
 * different rates yields two different totals (prices are never stored), and a
 * stale/missing rate surfaces a per-line "price unavailable" instead of a wrong
 * number.
 */

const GST: PricingSettings = { gst_metal_bps: 300, gst_making_bps: 500 };

/** A 10g 24k gold line: metal_value = 10 × rate (purity_factor = 1). */
function goldLine(quantity = 1): CartViewLineInput {
  return {
    cart_item_id: "ci-1",
    product_id: "p1",
    sku: "RING-1",
    name: "Gold Ring",
    product: {
      material: "gold",
      weight_grams: "10",
      purity_karat: 24,
      making_charge_type: "flat",
      making_charge_value: 0,
    },
    quantity,
  };
}

/** A resolver that returns a fixed gold rate. */
function rateAt(paise: number) {
  return async (material: Material): Promise<PricingRate> => ({
    material,
    rate_per_gram_paise: paise,
  });
}

describe("computeCartView — live recompute (ADR-0002)", () => {
  it("prices a line at the current rate", async () => {
    const view = await computeCartView([goldLine(1)], rateAt(600000), GST);
    const line = view.lines[0];
    if (!line || line.price_unavailable) {
      throw new Error("expected a single priced line");
    }
    // 10g × 600000 = 6,000,000 metal; no making; gst = 3% = 180,000.
    expect(line.line_metal_value).toBe(6_000_000);
    expect(line.line_total).toBe(6_180_000);
    expect(view.total).toBe(6_180_000);
  });

  it("same Cart yields a DIFFERENT total when the rate changes (no stored price)", async () => {
    const cheap = await computeCartView([goldLine(1)], rateAt(600000), GST);
    const dear = await computeCartView([goldLine(1)], rateAt(700000), GST);
    expect(cheap.total).not.toBe(dear.total);
    expect(dear.total).toBeGreaterThan(cheap.total);
  });

  it("multiplies the per-unit price by quantity for the line total", async () => {
    const view = await computeCartView([goldLine(3)], rateAt(600000), GST);
    expect(view.total).toBe(6_180_000 * 3);
  });

  it("breaks the total into metal value, making charge, and GST (story 13)", async () => {
    const view = await computeCartView([goldLine(1)], rateAt(600000), GST);
    expect(view.metal_value).toBe(6_000_000);
    expect(view.making_charges).toBe(0);
    expect(view.gst).toBe(180_000);
    expect(view.metal_value + view.making_charges + view.gst).toBe(view.total);
  });
});

describe("computeCartView — price unavailable (ADR-0010)", () => {
  it("marks a line 'price unavailable' with reason 'stale' on a stale rate", async () => {
    const resolver = async (material: Material): Promise<PricingRate> => {
      throw new RateUnavailableError(material, "stale");
    };
    const view = await computeCartView([goldLine(1)], resolver, GST);
    const line = view.lines[0];
    if (!line || !line.price_unavailable) {
      throw new Error("expected a single price_unavailable line");
    }
    expect(line.reason).toBe("stale");
    expect(view.has_unpriceable_lines).toBe(true);
    expect(view.total).toBe(0); // unpriceable line contributes nothing
  });

  it("marks 'missing' when no rate exists for the material", async () => {
    const resolver = async (material: Material): Promise<PricingRate> => {
      throw new RateUnavailableError(material, "missing");
    };
    const view = await computeCartView([goldLine(1)], resolver, GST);
    const line = view.lines[0];
    if (!line || !line.price_unavailable) {
      throw new Error("expected the line to be price_unavailable");
    }
    expect(line.reason).toBe("missing");
  });

  it("isolates the failure: priceable lines still price when another is stale", async () => {
    const silverLine: CartViewLineInput = {
      cart_item_id: "ci-2",
      product_id: "p2",
      sku: "CHAIN-1",
      name: "Silver Chain",
      product: {
        material: "silver",
        weight_grams: "10",
        purity_karat: null,
        making_charge_type: "flat",
        making_charge_value: 0,
      },
      quantity: 1,
    };
    // Gold resolves; silver is stale.
    const resolver = async (material: Material): Promise<PricingRate> => {
      if (material === "silver") {
        throw new RateUnavailableError(material, "stale");
      }
      return { material, rate_per_gram_paise: 600000 };
    };
    const view = await computeCartView([goldLine(1), silverLine], resolver, GST);
    expect(view.has_unpriceable_lines).toBe(true);
    // The gold line still contributes its full total.
    expect(view.total).toBe(6_180_000);
    const silver = view.lines.find((l) => l.product_id === "p2");
    expect(silver?.price_unavailable).toBe(true);
  });
});
