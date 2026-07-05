/**
 * Catalog read model — turns a stored Product (pricing INPUTS only, ADR-0007)
 * into a displayable view with a price computed at request time from the live
 * Metal Rate (ADR-0002). No price is ever persisted or read from the row.
 *
 * The price path is exactly Foundation's: `getCurrentRate(material)` from
 * `lib/rates.ts` then `calculatePrice(product, rate, settings)` from
 * `lib/pricing.ts`. This module is the single catalog consumer of those — it
 * adds no second pricing implementation (ADR-0007).
 *
 * The typed `RateUnavailableError` (missing/stale, ADR-0010) is caught here and
 * mapped to a **"price unavailable"** presentation state: the Product still
 * appears in the catalog but carries no price and is unpurchasable. The shape is
 * a discriminated union (`PricedProduct.status`) so Cart and Checkout can reuse
 * the same concept (PRD 03/04) rather than re-deriving it from raw errors.
 *
 * Settings (GST basis points, ADR-0005) are read server-side via an injectable
 * seam, so the mapping logic is unit-testable without a live Supabase. The
 * default reader uses a trusted (service-role) Supabase client because the
 * `settings` row is not public-readable under RLS.
 */

import { calculatePrice, type PricingSettings, type Price } from "./pricing";
import { getCurrentRate, RateUnavailableError } from "./rates";
import type { Tables } from "./supabase/database.types";

/** A `products` row as the catalog consumes it. */
export type ProductRow = Tables<"products">;

/** Stock availability surfaced to the UI (the catalog never reserves; PRD 04). */
export interface Availability {
  in_stock: boolean;
  stock_quantity: number;
}

/**
 * The live price slot of a catalog view. A discriminated union so callers must
 * handle the "price unavailable" branch explicitly rather than reading a price
 * that might be wrong (ADR-0010). Shared concept with Cart/Checkout.
 */
export type PricedProduct =
  | { status: "priced"; price: Price }
  | { status: "price_unavailable"; reason: "missing" | "stale" };

/** A Product plus its live price slot and availability — the catalog view model. */
export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  material: ProductRow["material"];
  weight_grams: ProductRow["weight_grams"];
  purity_karat: number | null;
  making_charge_type: ProductRow["making_charge_type"];
  hallmark_huid: string | null;
  availability: Availability;
  pricing: PricedProduct;
}

/** Injectable seam: how the catalog reads GST settings server-side. */
export interface CatalogConfig {
  /** Read the GST basis points from the `settings` singleton (ADR-0005). */
  fetchSettings: () => Promise<PricingSettings>;
}

let activeConfig: CatalogConfig | null = null;

function getConfig(): CatalogConfig {
  if (activeConfig === null) {
    activeConfig = createDefaultConfig();
  }
  return activeConfig;
}

/**
 * Price one Product against the current Metal Rate. Returns a `PricedProduct`:
 * `priced` with the integer-Paise breakdown, or `price_unavailable` (with the
 * typed reason) when the rate is missing or stale (ADR-0010). Any error that is
 * NOT a `RateUnavailableError` propagates — only the documented unavailable
 * states are swallowed.
 */
export async function priceProduct(
  product: ProductRow,
  settings: PricingSettings,
): Promise<PricedProduct> {
  try {
    const rate = await getCurrentRate(product.material);
    const price = calculatePrice(
      {
        material: product.material,
        // weight_grams arrives as a Postgres numeric → string|number; pricing
        // parses it off the float path. Keep it as-is.
        weight_grams: product.weight_grams,
        purity_karat: product.purity_karat,
        making_charge_type: product.making_charge_type,
        making_charge_value: product.making_charge_value,
      },
      rate,
      settings,
    );
    return { status: "priced", price };
  } catch (err) {
    if (err instanceof RateUnavailableError) {
      return { status: "price_unavailable", reason: err.reason };
    }
    throw err;
  }
}

/** Build the catalog view model for one Product row (price + availability). */
export async function toCatalogProduct(
  product: ProductRow,
  settings: PricingSettings,
): Promise<CatalogProduct> {
  const pricing = await priceProduct(product, settings);
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    description: product.description,
    material: product.material,
    weight_grams: product.weight_grams,
    purity_karat: product.purity_karat,
    making_charge_type: product.making_charge_type,
    hallmark_huid: product.hallmark_huid,
    availability: {
      in_stock: product.stock_quantity > 0,
      stock_quantity: product.stock_quantity,
    },
    pricing,
  };
}

/**
 * Build the catalog view for a list of Product rows. Reads GST settings once and
 * prices every row against the (cached, ADR-0010) current rate. Rates resolve
 * per material via `getCurrentRate`, so a list spanning gold and silver makes at
 * most one fetch per material.
 */
export async function toCatalog(
  products: readonly ProductRow[],
): Promise<CatalogProduct[]> {
  const settings = await getConfig().fetchSettings();
  return Promise.all(products.map((p) => toCatalogProduct(p, settings)));
}

/** Price a single Product row, reading settings once. */
export async function toCatalogDetail(
  product: ProductRow,
): Promise<CatalogProduct> {
  const settings = await getConfig().fetchSettings();
  return toCatalogProduct(product, settings);
}

/**
 * Default config: read the GST basis points from the `settings` singleton.
 *
 * `settings` is not public-readable under RLS (admin-only; pricing reads it
 * server-side), so this uses a trusted service-role client rather than the
 * anon/public client. Imported lazily so this module stays pure for unit tests
 * that inject their own config.
 */
function createDefaultConfig(): CatalogConfig {
  return {
    fetchSettings: async () => {
      const { createServiceClient } = await import("./supabase/service");
      const supabase = createServiceClient();
      const { data, error } = await supabase
        .from("settings")
        .select("gst_metal_bps, gst_making_bps")
        .limit(1)
        .single();
      if (error) {
        throw error;
      }
      return {
        gst_metal_bps: data.gst_metal_bps,
        gst_making_bps: data.gst_making_bps,
      };
    },
  };
}

// --- Test seams -------------------------------------------------------------

/** Replace the active config (settings reader). Test-only. */
export function __configureCatalogForTests(config: CatalogConfig): void {
  activeConfig = config;
}

/** Restore the default (Supabase-backed) config. Test-only. */
export function __resetCatalogConfigForTests(): void {
  activeConfig = null;
}
