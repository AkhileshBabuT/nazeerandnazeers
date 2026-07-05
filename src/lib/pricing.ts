/**
 * Pricing — the single source of truth for turning pricing inputs + the current
 * Metal Rate into money. Pure function, no I/O, integer Paise in and out
 * (ADR-0006, ADR-0011).
 *
 * `calculatePrice` returns the per-unit price components in integer Paise:
 *   { metal_value, making_charges, gst, total }
 *
 * Per ADR-0011:
 *   purity_factor = purity_karat / 24   (gold; silver = 1.0)
 *   metal_value   = weight_grams × rate_per_gram_paise × purity_factor
 *   making_charge = flat:    value (already Paise)
 *                   percent: metal_value × value_bps / 10000
 *   gst           = metal_value × gst_metal_bps / 10000      (3% → 300)
 *                 + making_charge × gst_making_bps / 10000    (5% → 500)
 *   total         = metal_value + making_charge + gst
 *
 * Rounding (ADR-0011): round-half-up, each component rounded to integer Paise
 * individually and the integers summed, so snapshotted parts re-sum exactly to
 * the stored total (ADR-0003). The caller rounds per unit and multiplies by
 * quantity for line totals; this function is strictly per-unit.
 *
 * NO FLOATS in the money path (ADR-0006). Weight is a decimal value (e.g. grams
 * with milligram precision); it is parsed into an integer (thousandths of a
 * gram) so all arithmetic is exact integer arithmetic and rounding happens in
 * exactly one explicit place per component.
 */

export type Material = "gold" | "silver";
export type MakingChargeType = "flat" | "percent";

/** The pricing inputs a `products` row carries (ADR-0007). */
export interface PricingProduct {
  material: Material;
  /**
   * Weight in grams as a decimal string (e.g. "7.35"), mirroring the Postgres
   * `numeric` column. A string keeps it off the float path until it is parsed
   * into integer thousandths-of-a-gram here. A `number` is also accepted for
   * call-site convenience but must be an exact decimal.
   */
  weight_grams: string | number;
  /** Gold fineness (e.g. 22, 24). `null` for silver (purity_factor = 1.0). */
  purity_karat: number | null;
  making_charge_type: MakingChargeType;
  /** flat → Paise; percent → basis points of metal value. */
  making_charge_value: number;
}

/** The current Metal Rate for the product's material (ADR-0008). */
export interface PricingRate {
  material: Material;
  rate_per_gram_paise: number;
}

/** GST basis points read from `settings` (ADR-0005). */
export interface PricingSettings {
  gst_metal_bps: number;
  gst_making_bps: number;
}

/** Per-unit price components, all integer Paise. */
export interface Price {
  metal_value: number;
  making_charges: number;
  gst: number;
  total: number;
}

// BigInt constants. Written as `BigInt(...)` rather than `1n` literals so the
// module compiles under the project's ES2017 target while still using exact
// arbitrary-precision integer arithmetic at runtime (Node 20 supports BigInt).
const ONE = BigInt(1);
const TWO = BigInt(2);
const BPS_DEN = BigInt(10000);
const KARAT_PURE = BigInt(24);

/** Weight precision: thousandths of a gram (milligrams). */
const WEIGHT_SCALE = BigInt(1000);

/**
 * Round-half-up division of two non-negative bigints: round(numerator /
 * denominator) with ties going up. Pure integer arithmetic — no floats.
 *
 * Exported so the refund tax-share recomputation (PRD 05) rounds GST with the
 * EXACT same rule as the original snapshot did (ADR-0011) — a separate rounding
 * implementation could disagree by a Paisa and break immutability.
 */
export function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  // (n + d/2) / d with integer division, for non-negative n, d > 0.
  // Use 2× to avoid a fractional d/2 when d is odd: round((2n + d) / (2d)).
  return (TWO * numerator + denominator) / (TWO * denominator);
}

/**
 * Parse a decimal weight ("7.35" or 7.35) into integer thousandths of a gram.
 * Avoids floating-point by working on the string representation.
 */
function weightToMilligrams(weight: string | number): bigint {
  const str = typeof weight === "number" ? weight.toString() : weight.trim();
  if (!/^\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid weight_grams: ${JSON.stringify(weight)}`);
  }
  const parts = str.split(".");
  const whole = parts[0] ?? "0";
  const frac = parts[1] ?? "";
  const fracPadded = (frac + "000").slice(0, 3); // thousandths
  return BigInt(whole) * WEIGHT_SCALE + BigInt(fracPadded);
}

/**
 * Compute the per-unit price for a Product against the current Metal Rate.
 * Pure; integer Paise in and out. Throws on malformed inputs rather than
 * silently mispricing.
 */
export function calculatePrice(
  product: PricingProduct,
  currentRate: PricingRate,
  settings: PricingSettings,
): Price {
  if (currentRate.material !== product.material) {
    throw new Error(
      `Rate material (${currentRate.material}) does not match product material (${product.material}).`,
    );
  }

  const weightMg = weightToMilligrams(product.weight_grams);
  const ratePerGram = BigInt(currentRate.rate_per_gram_paise);

  // purity_factor = purity_karat / 24 for gold; 1.0 for silver.
  // Express as a fraction (numerator/denominator) to stay integer-exact.
  let purityNum: bigint;
  let purityDen: bigint;
  if (product.material === "gold") {
    if (product.purity_karat == null) {
      throw new Error("Gold product requires purity_karat.");
    }
    purityNum = BigInt(product.purity_karat);
    purityDen = KARAT_PURE;
  } else {
    purityNum = ONE;
    purityDen = ONE;
  }

  // metal_value = weight_grams × rate_per_gram × purity_factor
  //   weight_grams = weightMg / 1000
  //   purity_factor = purityNum / purityDen
  // => raw = weightMg × ratePerGram × purityNum, denominator = 1000 × purityDen
  const metalNum = weightMg * ratePerGram * purityNum;
  const metalDen = WEIGHT_SCALE * purityDen;
  const metalValue = divRoundHalfUp(metalNum, metalDen);

  // making_charge: flat → value Paise; percent → metal_value × bps / 10000.
  let makingCharge: bigint;
  if (product.making_charge_type === "flat") {
    makingCharge = BigInt(product.making_charge_value);
  } else {
    makingCharge = divRoundHalfUp(
      metalValue * BigInt(product.making_charge_value),
      BPS_DEN,
    );
  }

  // GST on disjoint bases, each rounded to integer Paise then summed.
  const gstMetal = divRoundHalfUp(
    metalValue * BigInt(settings.gst_metal_bps),
    BPS_DEN,
  );
  const gstMaking = divRoundHalfUp(
    makingCharge * BigInt(settings.gst_making_bps),
    BPS_DEN,
  );
  const gst = gstMetal + gstMaking;

  const total = metalValue + makingCharge + gst;

  return {
    metal_value: Number(metalValue),
    making_charges: Number(makingCharge),
    gst: Number(gst),
    total: Number(total),
  };
}
