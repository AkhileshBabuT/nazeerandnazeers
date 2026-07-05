import { describe, expect, it } from "vitest";
import { buildOrderSnapshot, type SnapshotLineInput } from "@/lib/orders/snapshot";
import type { Material, PricingRate, PricingSettings } from "@/lib/pricing";
import { snapshotReceipt } from "./order-receipt";

const SETTINGS: PricingSettings = { gst_metal_bps: 300, gst_making_bps: 500 };

const RATES = new Map<Material, PricingRate>([
  ["gold", { material: "gold", rate_per_gram_paise: 724_500 }],
  ["silver", { material: "silver", rate_per_gram_paise: 9_240 }],
]);

/** A line whose weight/purity forces non-trivial rounding (22/24 of 7.35 g). */
const GOLD_LINE: SnapshotLineInput = {
  product_id: "11111111-1111-4111-8111-111111111111",
  sku: "NZ-GLD-001",
  name: "Paisley Jhumka",
  material: "gold",
  weight_grams: "7.350",
  purity_karat: 22,
  hallmark_huid: "HUID01",
  making_charge_type: "percent",
  making_charge_value: 1200,
  quantity: 2,
};

const SILVER_LINE: SnapshotLineInput = {
  product_id: "22222222-2222-4222-8222-222222222222",
  sku: "NZ-SLV-001",
  name: "Channapatna Anklet",
  material: "silver",
  weight_grams: "31.713",
  purity_karat: null,
  hallmark_huid: null,
  making_charge_type: "flat",
  making_charge_value: 45_037,
  quantity: 3,
};

describe("snapshotReceipt", () => {
  it("round-trips a real snapshot: rows re-sum EXACTLY to the frozen header", () => {
    // What checkout actually wrote (the single pricing source of truth)…
    const snapshot = buildOrderSnapshot([GOLD_LINE, SILVER_LINE], RATES, SETTINGS);
    // …reconstructed from the stored order_items columns alone.
    const receipt = snapshotReceipt(snapshot.items, snapshot.order);

    expect(receipt.metalValuePaise + receipt.makingChargesPaise).toBe(
      snapshot.order.subtotal_paise,
    );
    expect(receipt.makingChargesPaise).toBe(snapshot.order.making_charges_paise);
    expect(receipt.gstMetalPaise + receipt.gstMakingPaise).toBe(
      snapshot.order.gst_paise,
    );
    expect(
      receipt.metalValuePaise +
        receipt.makingChargesPaise +
        receipt.gstMetalPaise +
        receipt.gstMakingPaise,
    ).toBe(snapshot.order.total_paise);
  });

  it("splits GST per unit then × quantity (ADR-0011), not over the summed base", () => {
    // unit metal 333, unit making 333: per-unit 3% GST = round(9.99) = 10,
    // × 3 units = 30 — an aggregate split would give round(29.97) = 30 here,
    // so pick values where they differ: base 17 → round(0.51) = 1 per unit,
    // × 3 = 3, while aggregate 51 → round(1.53) = 2.
    const receipt = snapshotReceipt(
      [{ unit_price_paise: 34, making_charges_paise: 17, quantity: 3 }],
      { gst_metal_bps: 300, gst_making_bps: 300 },
    );
    expect(receipt.metalValuePaise).toBe(51);
    expect(receipt.gstMetalPaise).toBe(3); // per-unit rounding, NOT 2
    expect(receipt.gstMakingPaise).toBe(3);
  });

  it("is all zeros for no items", () => {
    expect(snapshotReceipt([], SETTINGS)).toEqual({
      metalValuePaise: 0,
      makingChargesPaise: 0,
      gstMetalPaise: 0,
      gstMakingPaise: 0,
    });
  });
});
