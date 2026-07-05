import { describe, it, expect, beforeEach } from "vitest";
import {
  priceProduct,
  toCatalogProduct,
  type ProductRow,
} from "./catalog";
import {
  __configureRatesForTests,
  __resetRateCacheForTests,
  type RatesConfig,
  type RateRow,
} from "./rates";
import type { PricingSettings } from "./pricing";

/**
 * Catalog mapping tests — the WIRING from a Product row + the live rate to a
 * priced view, NOT the price formula (Foundation's pricing.test.ts owns the
 * math). We assert:
 *   - a priced Product carries the integer-Paise breakdown calculatePrice would
 *     produce against the seeded rate,
 *   - availability reflects stock_quantity,
 *   - a missing/stale rate maps to the typed "price unavailable" state (ADR-0010)
 *     rather than throwing or fabricating a price.
 *
 * Rates are driven through the injectable RatesConfig (an in-memory fetcher +
 * clock), so no live Supabase is needed here. Settings are passed in directly.
 */

const GST: PricingSettings = { gst_metal_bps: 300, gst_making_bps: 500 };

const NOW = Date.UTC(2026, 5, 8, 12, 0, 0);
const HOUR = 3600 * 1000;

function goldRow(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    sku: "RING-1",
    name: "Gold Ring",
    description: "A plain band",
    material: "gold",
    category_id: "33333333-3333-3333-3333-333333333333",
    audience_id: "44444444-4444-4444-4444-444444444444",
    weight_grams: 10,
    purity_karat: 24,
    making_charge_type: "flat",
    making_charge_value: 0,
    hallmark_huid: "ABC123",
    stock_quantity: 3,
    is_active: true,
    created_at: new Date(NOW).toISOString(),
    updated_at: new Date(NOW).toISOString(),
    ...overrides,
  };
}

/** Wire the rates module to an in-memory fetcher + fixed clock. */
function useRate(row: RateRow | null, maxRateAgeSeconds = 86400): void {
  const config: RatesConfig = {
    now: () => NOW,
    maxRateAgeSeconds,
    fetchLatestRate: async (material) =>
      row && row.material === material ? row : null,
  };
  __configureRatesForTests(config);
}

beforeEach(() => {
  __resetRateCacheForTests();
});

describe("priceProduct — live price wiring", () => {
  it("prices a Product against the current rate (status 'priced')", async () => {
    useRate({
      material: "gold",
      rate_per_gram_paise: 600000, // ₹6000/g
      effective_at: new Date(NOW - HOUR).toISOString(),
    });

    const result = await priceProduct(goldRow({ purity_karat: 24 }), GST);

    expect(result.status).toBe("priced");
    if (result.status !== "priced") return;
    // 10g × ₹6000/g × 24/24 metal value; flat making 0; GST 3% on metal.
    expect(result.price.metal_value).toBe(6_000_000);
    expect(result.price.making_charges).toBe(0);
    expect(result.price.gst).toBe(180_000); // 3% of 6,000,000
    expect(result.price.total).toBe(6_180_000);
  });

  it("maps a missing rate to price_unavailable (reason 'missing')", async () => {
    useRate(null);

    const result = await priceProduct(goldRow(), GST);

    expect(result).toEqual({ status: "price_unavailable", reason: "missing" });
  });

  it("maps a stale rate to price_unavailable (reason 'stale')", async () => {
    useRate(
      {
        material: "gold",
        rate_per_gram_paise: 600000,
        // 1 second over the 24h ceiling → stale (ADR-0010).
        effective_at: new Date(NOW - (86400 + 1) * 1000).toISOString(),
      },
      86400,
    );

    const result = await priceProduct(goldRow(), GST);

    expect(result).toEqual({ status: "price_unavailable", reason: "stale" });
  });
});

describe("toCatalogProduct — availability + view shape", () => {
  it("surfaces in_stock and stock_quantity from the row", async () => {
    useRate({
      material: "gold",
      rate_per_gram_paise: 600000,
      effective_at: new Date(NOW - HOUR).toISOString(),
    });

    const inStock = await toCatalogProduct(goldRow({ stock_quantity: 3 }), GST);
    expect(inStock.availability).toEqual({ in_stock: true, stock_quantity: 3 });

    const soldOut = await toCatalogProduct(goldRow({ stock_quantity: 0 }), GST);
    expect(soldOut.availability).toEqual({ in_stock: false, stock_quantity: 0 });
  });

  it("still lists a Product with an unavailable price (unpurchasable, not hidden)", async () => {
    useRate(null);

    const view = await toCatalogProduct(goldRow({ stock_quantity: 5 }), GST);

    // The Product is present with its attributes…
    expect(view.sku).toBe("RING-1");
    expect(view.availability.in_stock).toBe(true);
    // …but carries no price.
    expect(view.pricing).toEqual({
      status: "price_unavailable",
      reason: "missing",
    });
  });

  it("exposes the physical attributes the detail view needs", async () => {
    useRate({
      material: "gold",
      rate_per_gram_paise: 600000,
      effective_at: new Date(NOW - HOUR).toISOString(),
    });

    const view = await toCatalogProduct(
      goldRow({ purity_karat: 22, hallmark_huid: "HUID42" }),
      GST,
    );

    expect(view.purity_karat).toBe(22);
    expect(view.hallmark_huid).toBe("HUID42");
    expect(view.weight_grams).toBe(10);
    expect(view.material).toBe("gold");
  });
});
