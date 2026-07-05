/**
 * Pure helpers for the A1 admin dashboard (PRD 06 §5 A1).
 *
 * Rate freshness mirrors `lib/rates.ts`: a rate is stale once its age exceeds
 * `settings.max_rate_age_seconds` (strictly greater, same comparison as
 * `getCurrentRate`). Pure + clock-injected so the branches are unit-testable.
 */

/**
 * Clock seam for the dashboard's server components. They run once per request
 * (after `await connection()`), so reading the clock is sound — but
 * `react-hooks/purity` can't see that, so the read lives outside the
 * component module.
 */
export function nowMs(): number {
  return Date.now();
}

/** Latest-rate freshness for one material — drives the strip + pill + banner. */
export type RateFreshness =
  | {
      status: "fresh";
      ratePaise: number;
      effectiveAt: string;
      ageSeconds: number;
    }
  | {
      status: "stale";
      ratePaise: number;
      effectiveAt: string;
      ageSeconds: number;
    }
  | { status: "missing" };

/** Classify the latest rate row against the staleness ceiling. */
export function rateFreshness(
  row: { rate_per_gram_paise: number; effective_at: string } | null,
  maxRateAgeSeconds: number,
  nowMs: number,
): RateFreshness {
  if (row === null) {
    return { status: "missing" };
  }
  const ageSeconds = Math.max(0, (nowMs - Date.parse(row.effective_at)) / 1000);
  return {
    status: ageSeconds > maxRateAgeSeconds ? "stale" : "fresh",
    ratePaise: row.rate_per_gram_paise,
    effectiveAt: row.effective_at,
    ageSeconds,
  };
}

/** Compact age for pills/rows: `"26h"` past an hour, else `"14m"` (min 1m). */
export function ageLabel(ageSeconds: number): string {
  if (ageSeconds < 3600) {
    return `${Math.max(1, Math.floor(ageSeconds / 60))}m`;
  }
  return `${Math.floor(ageSeconds / 3600)}h`;
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** UTC ISO instant of today's midnight in IST — the "TODAY" column boundary. */
export function startOfTodayIstIso(nowMs: number): string {
  const ist = new Date(nowMs + IST_OFFSET_MS);
  ist.setUTCHours(0, 0, 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS).toISOString();
}
