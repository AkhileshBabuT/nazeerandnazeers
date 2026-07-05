/**
 * Cart view — compute live line totals for a Cart (PRD 03, ADR-0002).
 *
 * The Cart stores no prices (ADR-0002): every view recomputes each line from the
 * **current** Metal Rate via `lib/rates.ts` + `lib/pricing.ts`. A line whose
 * material has no rate, or a stale rate (over the 24h ceiling, ADR-0010), is
 * surfaced as `"price unavailable"` rather than a wrong number — the same typed
 * `RateUnavailableError` the Catalog uses.
 *
 * This module is the pure assembly step: given the raw lines (Product pricing
 * inputs + quantity), a rate resolver, and GST settings, it returns a
 * `CartView`. I/O (which rows exist, what stock is) lives in the Server Action;
 * the rate resolver is injected so the live-recompute behaviour — same Cart,
 * different rate → different total; stale rate → "price unavailable" — is
 * unit-testable without a live Supabase.
 */

import {
  calculatePrice,
  type Material,
  type PricingProduct,
  type PricingRate,
  type PricingSettings,
  type Price,
} from "../pricing";
import { RateUnavailableError } from "../rates";

/** A Cart line ready for pricing: the line id, its Product inputs, quantity. */
export interface CartViewLineInput {
  cart_item_id: string;
  product_id: string;
  /** Present when the line is for a specific Variant (ADR-0015). */
  variant_id?: string | null;
  sku: string;
  name: string;
  product: PricingProduct;
  quantity: number;
}

/** A priced Cart line. `unit`/`line` totals are integer Paise (ADR-0006). */
export interface CartViewLinePriced {
  cart_item_id: string;
  product_id: string;
  variant_id: string | null;
  sku: string;
  name: string;
  material: Material;
  quantity: number;
  /** Per-unit price components at the current rate. */
  unit_price: Price;
  /** Line totals = per-unit component × quantity (ADR-0011: round per unit). */
  line_metal_value: number;
  line_making_charges: number;
  line_gst: number;
  line_total: number;
  price_unavailable: false;
}

/** A Cart line whose price could not be computed (stale/missing rate). */
export interface CartViewLineUnavailable {
  cart_item_id: string;
  product_id: string;
  variant_id: string | null;
  sku: string;
  name: string;
  material: Material;
  quantity: number;
  price_unavailable: true;
  /** Why: a missing or stale Metal Rate (ADR-0010). */
  reason: "missing" | "stale";
}

export type CartViewLine = CartViewLinePriced | CartViewLineUnavailable;

/** The whole Cart, priced live. Totals sum the priceable lines only. */
export interface CartView {
  lines: CartViewLine[];
  /** Cart-level totals over priceable lines, integer Paise. */
  metal_value: number;
  making_charges: number;
  gst: number;
  total: number;
  /** True iff at least one line could not be priced (ADR-0010). */
  has_unpriceable_lines: boolean;
}

/** Resolve the current rate for a material, or throw `RateUnavailableError`. */
export type RateResolver = (material: Material) => Promise<PricingRate>;

/**
 * Build a `CartView` from raw lines + a rate resolver + GST settings.
 *
 * Per-line failures are isolated: one Product with a stale rate marks only that
 * line `price_unavailable`; the rest still price. Cart totals break down into
 * metal value, making charge, and GST across the priceable lines (PRD story 13).
 */
export async function computeCartView(
  lines: readonly CartViewLineInput[],
  resolveRate: RateResolver,
  settings: PricingSettings,
): Promise<CartView> {
  const out: CartViewLine[] = [];
  let metalValue = 0;
  let makingCharges = 0;
  let gst = 0;
  let total = 0;
  let hasUnpriceable = false;

  for (const line of lines) {
    const material = line.product.material;
    try {
      const rate = await resolveRate(material);
      const unit = calculatePrice(line.product, rate, settings);
      const lineMetal = unit.metal_value * line.quantity;
      const lineMaking = unit.making_charges * line.quantity;
      const lineGst = unit.gst * line.quantity;
      const lineTotal = unit.total * line.quantity;

      metalValue += lineMetal;
      makingCharges += lineMaking;
      gst += lineGst;
      total += lineTotal;

      out.push({
        cart_item_id: line.cart_item_id,
        product_id: line.product_id,
        variant_id: line.variant_id ?? null,
        sku: line.sku,
        name: line.name,
        material,
        quantity: line.quantity,
        unit_price: unit,
        line_metal_value: lineMetal,
        line_making_charges: lineMaking,
        line_gst: lineGst,
        line_total: lineTotal,
        price_unavailable: false,
      });
    } catch (err) {
      if (err instanceof RateUnavailableError) {
        hasUnpriceable = true;
        out.push({
          cart_item_id: line.cart_item_id,
          product_id: line.product_id,
          variant_id: line.variant_id ?? null,
          sku: line.sku,
          name: line.name,
          material,
          quantity: line.quantity,
          price_unavailable: true,
          reason: err.reason,
        });
      } else {
        throw err;
      }
    }
  }

  return {
    lines: out,
    metal_value: metalValue,
    making_charges: makingCharges,
    gst,
    total,
    has_unpriceable_lines: hasUnpriceable,
  };
}
