/**
 * Admin money/percent input parsing (A2 editor, A3 rates form).
 *
 * Rupees → integer paise and percent → integer bps by string slicing — no
 * floats, and sub-paise / sub-bps input is REJECTED (null), never rounded
 * silently (issue 06 acceptance criterion).
 */

/** Up to 2 decimals, scaled ×100 to an integer. `null` = invalid/sub-unit. */
function decimalToCentis(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) {
    return null;
  }
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

/** `"7245.50"` → 724550. Rejects `"12.345"` (sub-paise) and non-numeric. */
export function rupeesToPaise(raw: string): number | null {
  return decimalToCentis(raw);
}

/** `"12.5"` → 1250 bps. Rejects more than 2 decimals. */
export function percentToBps(raw: string): number | null {
  return decimalToCentis(raw);
}

/** Integer ÷100 as a 2-dp string for input defaults: 724550 → `"7245.50"`. */
function centisToDecimal(centis: number): string {
  const abs = Math.abs(Math.trunc(centis));
  return `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** 724550 → `"7245.50"` — form default for flat making charges. */
export function paiseToRupeesInput(paise: number): string {
  return centisToDecimal(paise);
}

/** 1250 → `"12.50"` — form default for percent making charges. */
export function bpsToPercentInput(bps: number): string {
  return centisToDecimal(bps);
}
