/** Coupon discount computation (ADR-0017). Pure, no I/O. */

export interface CouponForDiscount {
  discount_type: "percent" | "flat";
  /** percent → basis points (e.g. 1000 = 10%); flat → Paise amount. */
  discount_value: number;
  /** Minimum order subtotal in Paise. If not met, discount is 0. */
  min_order_paise: number;
}

/**
 * Compute the discount in Paise from a coupon applied to a pre-tax subtotal.
 *
 * Applies to `subtotalPaise` (metal value + making charges, pre-GST, pre-shipping).
 * GST is then recomputed on the discounted base (ADR-0017).
 *
 * Returns 0 when min_order_paise is not met.
 * Flat coupons are capped at subtotalPaise (never drive subtotal below 0).
 * Rounds with Math.round (round-half-up, consistent with ADR-0011).
 */
export function computeDiscount(
  coupon: CouponForDiscount,
  subtotalPaise: number,
): number {
  if (subtotalPaise < coupon.min_order_paise) {
    return 0;
  }
  if (coupon.discount_type === "percent") {
    return Math.round((subtotalPaise * coupon.discount_value) / 10000);
  }
  // flat: cap at subtotal so we never go negative
  return Math.min(coupon.discount_value, subtotalPaise);
}
