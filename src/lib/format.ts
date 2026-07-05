/**
 * Money/weight/rate display formatting (PRD 06 §1.7).
 *
 * `formatPaise` is pure integer math — paise never touch floats (ADR-0006) and
 * Indian 2-2-3 digit grouping is built by string slicing, **not** `Intl` over
 * `paise / 100`. Used by every price render on both roles.
 */

/** `8421350` → `₹84,213.50` (Indian grouping; paise always 2 digits). */
export function formatPaise(paise: number): string {
  const negative = paise < 0;
  const abs = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(abs / 100);
  const p = abs % 100;
  return `${negative ? "-" : ""}₹${groupIndian(String(rupees))}.${String(p).padStart(2, "0")}`;
}

/** Indian 2-2-3 grouping: `1234567890` → `1,23,45,67,890`. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) {
    return digits;
  }
  const last3 = digits.slice(-3);
  let rest = digits.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  parts.unshift(rest);
  return `${parts.join(",")},${last3}`;
}

/** Per-gram rate: `724500` → `₹7,245.00/g`. */
export function formatRate(ratePerGramPaise: number): string {
  return `${formatPaise(ratePerGramPaise)}/g`;
}

/**
 * Weight display: `"12.48"` / `12.48` → `12.480 g` (always 3 decimals, the
 * DB's numeric(_,3) precision). Display-only — weights are never computed on.
 */
export function formatGrams(weightGrams: string | number): string {
  const n = typeof weightGrams === "number" ? weightGrams : Number(weightGrams);
  return `${n.toFixed(3)} g`;
}

/** Museum-label metal eyebrow: `22 KT GOLD` / `STERLING SILVER`. */
export function materialEyebrow(
  material: "gold" | "silver",
  purityKarat: number | null,
): string {
  return material === "gold"
    ? `${purityKarat ?? "—"} KT GOLD`
    : "STERLING SILVER";
}

/** 24h IST clock for "as of HH:MM" lines. */
export function formatTimeIST(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}
