/** Shipping cost computation (ADR-0016). Pure, no I/O. */

export interface ShippingMethodRates {
  base_rate_paise: number;
  /** Paise per gram (integer). Multiply by total weight in grams, round half-up. */
  per_gram_paise: number;
  /** Nullable free-shipping threshold compared against post-GST pre-shipping total. */
  free_above_paise: number | null;
}

/**
 * Compute shipping cost in Paise (ADR-0016).
 *
 * `totalWeightGrams` — sum of (line.weight_grams × quantity) across all cart lines.
 * `totalBeforeShipping` — discounted_subtotal + gst_paise (post-GST, pre-shipping).
 *
 * Returns 0 when the free-shipping threshold is met. Rounds the per-gram
 * component with Math.round (round-half-up, consistent with ADR-0011).
 */
export function computeShipping(
  method: ShippingMethodRates,
  totalWeightGrams: number,
  totalBeforeShipping: number,
): number {
  if (
    method.free_above_paise !== null &&
    totalBeforeShipping >= method.free_above_paise
  ) {
    return 0;
  }
  return method.base_rate_paise + Math.round(totalWeightGrams * method.per_gram_paise);
}
