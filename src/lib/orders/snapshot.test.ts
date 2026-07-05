import { describe, it, expect } from "vitest";
import { buildOrderSnapshot, type SnapshotLineInput } from "./snapshot";
import type { Material, PricingRate, PricingSettings } from "../pricing";

/**
 * Order snapshot builder (ADR-0003/0005) — pure. Turns priced Cart lines + the
 * live rates + GST settings into the exact `orders` header and `order_items`
 * rows to be frozen. The immutability guarantee lives here: the produced
 * snapshot is fully self-contained, re-sums to its own total, and carries the
 * per-piece HUID (CONTEXT). After this runs, nothing reads `metal_rates` again.
 *
 * The maths must agree with `lib/pricing.ts` (ADR-0011): round per unit, then
 * line total = unit × quantity; header totals = sum of line totals; the four
 * header money fields re-sum to `total_paise`.
 */

const SETTINGS: PricingSettings = { gst_metal_bps: 300, gst_making_bps: 500 };

// 10g of 22k gold at ₹6,000/g = 600_000 Paise/g, flat making ₹1,000 = 100_000.
const GOLD_RATE: PricingRate = { material: "gold", rate_per_gram_paise: 600_000 };
const SILVER_RATE: PricingRate = { material: "silver", rate_per_gram_paise: 8_000 };

function goldLine(quantity: number): SnapshotLineInput {
  return {
    product_id: "11111111-1111-1111-1111-111111111111",
    sku: "RING-22K-10G",
    name: "Classic Gold Ring",
    material: "gold",
    weight_grams: "10.000",
    purity_karat: 22,
    hallmark_huid: "HUID22",
    making_charge_type: "flat",
    making_charge_value: 100_000,
    quantity,
  };
}

function silverLine(quantity: number): SnapshotLineInput {
  return {
    product_id: "22222222-2222-2222-2222-222222222222",
    sku: "CHAIN-SILVER-20G",
    name: "Silver Chain",
    material: "silver",
    weight_grams: "20.000",
    purity_karat: null,
    hallmark_huid: null,
    making_charge_type: "percent",
    making_charge_value: 1000, // 10%
    quantity,
  };
}

const RATES = new Map<Material, PricingRate>([
  ["gold", GOLD_RATE],
  ["silver", SILVER_RATE],
]);

describe("buildOrderSnapshot — single gold line", () => {
  const snap = buildOrderSnapshot([goldLine(1)], RATES, SETTINGS);

  it("snapshots the per-piece HUID and product metadata on the line", () => {
    const item = snap.items[0]!;
    expect(item.hallmark_huid_snapshot).toBe("HUID22");
    expect(item.sku_snapshot).toBe("RING-22K-10G");
    expect(item.name_snapshot).toBe("Classic Gold Ring");
    expect(item.purity_karat).toBe(22);
    expect(item.weight_grams).toBe("10.000");
  });

  it("freezes the pre-tax unit price = metal value + making charge", () => {
    const item = snap.items[0]!;
    // metal = 10 × 600_000 × 22/24 = 5_500_000; making = 100_000.
    expect(item.unit_price_paise).toBe(5_600_000);
    expect(item.making_charges_paise).toBe(100_000);
  });

  it("stamps the gold rate snapshot, leaves silver null", () => {
    expect(snap.order.gold_rate_snapshot_paise).toBe(600_000);
    expect(snap.order.silver_rate_snapshot_paise).toBeNull();
  });

  it("stamps the GST bps it computed with (ADR-0005)", () => {
    expect(snap.order.gst_metal_bps).toBe(300);
    expect(snap.order.gst_making_bps).toBe(500);
  });

  it("header money fields re-sum to total (self-consistent, ADR-0003)", () => {
    const o = snap.order;
    expect(o.subtotal_paise + o.gst_paise).toBe(o.total_paise);
    // subtotal = unit_price × qty = 5_600_000; making is part of subtotal.
    expect(o.subtotal_paise).toBe(5_600_000);
    // gst = 3% of 5_500_000 + 5% of 100_000 = 165_000 + 5_000 = 170_000.
    expect(o.gst_paise).toBe(170_000);
    expect(o.making_charges_paise).toBe(100_000);
    expect(o.total_paise).toBe(5_770_000);
  });
});

describe("buildOrderSnapshot — quantity multiplies the line, not the unit", () => {
  it("line total = unit × quantity; header sums the lines", () => {
    const snap = buildOrderSnapshot([goldLine(3)], RATES, SETTINGS);
    const item = snap.items[0]!;
    expect(item.unit_price_paise).toBe(5_600_000); // per-unit unchanged
    expect(item.quantity).toBe(3);
    expect(snap.order.subtotal_paise).toBe(5_600_000 * 3);
    expect(snap.order.gst_paise).toBe(170_000 * 3);
    expect(snap.order.total_paise).toBe(5_770_000 * 3);
  });
});

describe("buildOrderSnapshot — mixed gold + silver stamps both rates", () => {
  const snap = buildOrderSnapshot([goldLine(1), silverLine(2)], RATES, SETTINGS);

  it("stamps both metal rate snapshots", () => {
    expect(snap.order.gold_rate_snapshot_paise).toBe(600_000);
    expect(snap.order.silver_rate_snapshot_paise).toBe(8_000);
  });

  it("produces one order_item per line in input order", () => {
    expect(snap.items).toHaveLength(2);
    expect(snap.items[0]!.material).toBe("gold");
    expect(snap.items[1]!.material).toBe("silver");
  });

  it("total re-sums across both lines and the four header fields agree", () => {
    const o = snap.order;
    expect(o.subtotal_paise + o.gst_paise).toBe(o.total_paise);
  });
});

describe("buildOrderSnapshot — immutability is self-contained", () => {
  it("uses only the passed rates/settings (no hidden dependency)", () => {
    // Same lines, a DIFFERENT rate → a different frozen number, proving the
    // snapshot reflects exactly what was passed at build time.
    const cheaper = new Map<Material, PricingRate>([
      ["gold", { material: "gold", rate_per_gram_paise: 300_000 }],
    ]);
    const snap = buildOrderSnapshot([goldLine(1)], cheaper, SETTINGS);
    // metal = 10 × 300_000 × 22/24 = 2_750_000; +100_000 making = 2_850_000.
    expect(snap.items[0]!.unit_price_paise).toBe(2_850_000);
  });

  it("throws if a line's material has no rate in the map (fails loudly)", () => {
    expect(() => buildOrderSnapshot([goldLine(1)], new Map(), SETTINGS)).toThrow();
  });
});
