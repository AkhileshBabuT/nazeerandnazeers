/**
 * Pure helpers for the A3 rates page (PRD 06 §5 A3).
 *
 * `parseRateInput` is the client-side exactness guard over `rupeesToPaise`:
 * sub-paise input (e.g. 7245.123) is REJECTED with a message, never rounded
 * (issue 06 acceptance criterion). `isBackdated` + `liveRateIds` drive the
 * "this rate is historical" warning and the LIVE crown per material.
 */

import { rupeesToPaise } from "./money-input";

export type RateInputParse =
  | { ok: true; ratePerGramPaise: number }
  | { ok: false; error: string };

/** Rupees-per-gram string → integer paise. Rejects sub-paise, zero, junk. */
export function parseRateInput(raw: string): RateInputParse {
  if (raw.trim() === "") {
    return { ok: false, error: "Enter a rate in rupees per gram." };
  }
  const paise = rupeesToPaise(raw);
  if (paise === null) {
    return {
      ok: false,
      error:
        "Up to 2 decimals only — sub-paise input is rejected, not rounded.",
    };
  }
  if (paise <= 0) {
    return { ok: false, error: "Rate must be greater than zero." };
  }
  return { ok: true, ratePerGramPaise: paise };
}

/** True when the posted row lands behind an already-newer row — it is
 * historical and the newer row stays live (latest-row-wins, ADR-0008). */
export function isBackdated(
  postedEffectiveAt: string,
  latestEffectiveAt: string | null,
): boolean {
  return (
    latestEffectiveAt !== null &&
    Date.parse(postedEffectiveAt) < Date.parse(latestEffectiveAt)
  );
}

/** Ids of the newest row per material. Rows must be `effective_at` desc. */
export function liveRateIds(
  rows: ReadonlyArray<{ id: string; material: string }>,
): Set<string> {
  const seen = new Set<string>();
  const live = new Set<string>();
  for (const row of rows) {
    if (!seen.has(row.material)) {
      seen.add(row.material);
      live.add(row.id);
    }
  }
  return live;
}
