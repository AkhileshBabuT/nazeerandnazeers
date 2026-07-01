export type MetalpriceRates = { USDXAU: number; USDXAG: number; INR: number };

/**
 * Convert MetalpriceAPI USD spot rates + INR/USD rate to Indian paise per gram.
 *
 * Formula (both materials):
 *   rate_per_gram_paise = Math.round((USD_spot * INR / 31.1035) * 100)
 *
 * 31.1035 g/troy-oz converts troy-ounce spot to per-gram; × 100 converts
 * rupees to paise. Math.round (not floor/truncate) matches the spec.
 */
export function paisFromMetalpriceRates(rates: MetalpriceRates): {
  gold_paise: number;
  silver_paise: number;
} {
  return {
    gold_paise: Math.round((rates.USDXAU * rates.INR / 31.1035) * 100),
    silver_paise: Math.round((rates.USDXAG * rates.INR / 31.1035) * 100),
  };
}
