import { divRoundHalfUp, type Price, type PricingSettings } from "./pricing";

/**
 * Recompute the 3%/5% GST display split from a computed `Price` (PRD 06 §1.7).
 * `Price.gst` is one number; the receipt shows the two disjoint-base rows.
 * Uses the SAME half-up rounding as `calculatePrice` (ADR-0011), so
 * gst_metal + gst_making always equals `price.gst` exactly. Display-only —
 * server-computed amounts stay authoritative.
 */
export function gstDisplaySplit(
  price: Price,
  settings: PricingSettings,
): { gst_metal: number; gst_making: number } {
  const gstMetal = Number(
    divRoundHalfUp(
      BigInt(price.metal_value) * BigInt(settings.gst_metal_bps),
      BigInt(10000),
    ),
  );
  return { gst_metal: gstMetal, gst_making: price.gst - gstMetal };
}

/**
 * Cart-level GST display split (PRD 03): sum each priced line's per-unit
 * `gstDisplaySplit × quantity`, so the cart receipt's two GST rows stay
 * consistent with the per-component rounding shown on each Product (ADR-0011) —
 * NOT an aggregate split of the cart-level GST total. Unpriceable lines carry no
 * `unit_price` and are excluded.
 */
export function cartGstDisplaySplit(
  lines: { unit_price: Price; quantity: number }[],
  settings: PricingSettings,
): { gst_metal: number; gst_making: number } {
  let gstMetal = 0;
  let gstMaking = 0;
  for (const line of lines) {
    const split = gstDisplaySplit(line.unit_price, settings);
    gstMetal += split.gst_metal * line.quantity;
    gstMaking += split.gst_making * line.quantity;
  }
  return { gst_metal: gstMetal, gst_making: gstMaking };
}

/** `300` bps → `3%`; `1250` → `12.5%`. For receipt row labels. */
export function formatBps(bps: number): string {
  const pct = bps / 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")}%`;
}
