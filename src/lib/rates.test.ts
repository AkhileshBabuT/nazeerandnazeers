import { describe, it, expect, beforeEach } from "vitest";
import {
  getCurrentRate,
  RateUnavailableError,
  __resetRateCacheForTests,
  __configureRatesForTests,
  type RateRow,
  type RatesConfig,
} from "./rates";

/**
 * Rates tests — exercise the observable read result and the typed error, not
 * the Map internals (ADR-0010). Cache hit/miss is driven by an injectable
 * clock; staleness is driven by the row's `effective_at` vs the injectable
 * `now` and `max_rate_age_seconds`. No real DB — the fetcher is injected.
 */

const HOUR = 3600 * 1000;

/** A controllable clock + a controllable fetcher to drive the cache/staleness. */
function makeHarness(opts: {
  now: number;
  rows: Record<string, RateRow | null>;
  maxRateAgeSeconds?: number;
}) {
  let nowMs = opts.now;
  let fetchCount = 0;
  const config: RatesConfig = {
    now: () => nowMs,
    maxRateAgeSeconds: opts.maxRateAgeSeconds ?? 86400,
    fetchLatestRate: async (material) => {
      fetchCount += 1;
      return opts.rows[material] ?? null;
    },
  };
  return {
    config,
    setNow: (ms: number) => {
      nowMs = ms;
    },
    advance: (ms: number) => {
      nowMs += ms;
    },
    fetchCount: () => fetchCount,
  };
}

beforeEach(() => {
  __resetRateCacheForTests();
});

describe("getCurrentRate — cache hit/miss", () => {
  it("fetches on a cold cache (miss) and returns the rate", async () => {
    const now = Date.UTC(2026, 5, 8, 12, 0, 0);
    const h = makeHarness({
      now,
      rows: {
        gold: {
          material: "gold",
          rate_per_gram_paise: 600000,
          effective_at: new Date(now - HOUR).toISOString(),
        },
      },
    });
    __configureRatesForTests(h.config);

    const rate = await getCurrentRate("gold");
    expect(rate).toEqual({ material: "gold", rate_per_gram_paise: 600000 });
    expect(h.fetchCount()).toBe(1);
  });

  it("serves from cache within the 5-minute TTL (no second fetch)", async () => {
    const now = Date.UTC(2026, 5, 8, 12, 0, 0);
    const h = makeHarness({
      now,
      rows: {
        gold: {
          material: "gold",
          rate_per_gram_paise: 600000,
          effective_at: new Date(now - HOUR).toISOString(),
        },
      },
    });
    __configureRatesForTests(h.config);

    await getCurrentRate("gold");
    h.advance(4 * 60 * 1000); // 4 minutes — within TTL
    await getCurrentRate("gold");
    expect(h.fetchCount()).toBe(1);
  });

  it("re-fetches after the 5-minute TTL expires", async () => {
    const now = Date.UTC(2026, 5, 8, 12, 0, 0);
    const h = makeHarness({
      now,
      rows: {
        gold: {
          material: "gold",
          rate_per_gram_paise: 600000,
          effective_at: new Date(now - HOUR).toISOString(),
        },
      },
    });
    __configureRatesForTests(h.config);

    await getCurrentRate("gold");
    h.advance(5 * 60 * 1000 + 1); // just past TTL
    await getCurrentRate("gold");
    expect(h.fetchCount()).toBe(2);
  });
});

describe("getCurrentRate — 24h staleness ceiling", () => {
  it("returns the rate when the row is just under the ceiling", async () => {
    const now = Date.UTC(2026, 5, 8, 12, 0, 0);
    const h = makeHarness({
      now,
      maxRateAgeSeconds: 86400,
      rows: {
        gold: {
          material: "gold",
          rate_per_gram_paise: 600000,
          // 1 second under 24h old → fresh enough
          effective_at: new Date(now - (86400 - 1) * 1000).toISOString(),
        },
      },
    });
    __configureRatesForTests(h.config);

    const rate = await getCurrentRate("gold");
    expect(rate.rate_per_gram_paise).toBe(600000);
  });

  it("throws RateUnavailableError when the row is over the ceiling", async () => {
    const now = Date.UTC(2026, 5, 8, 12, 0, 0);
    const h = makeHarness({
      now,
      maxRateAgeSeconds: 86400,
      rows: {
        gold: {
          material: "gold",
          rate_per_gram_paise: 600000,
          // 1 second over 24h old → stale
          effective_at: new Date(now - (86400 + 1) * 1000).toISOString(),
        },
      },
    });
    __configureRatesForTests(h.config);

    await expect(getCurrentRate("gold")).rejects.toBeInstanceOf(
      RateUnavailableError,
    );
    await expect(getCurrentRate("gold")).rejects.toMatchObject({
      reason: "stale",
      material: "gold",
    });
  });

  it("treats exactly at the ceiling as fresh (boundary is inclusive)", async () => {
    const now = Date.UTC(2026, 5, 8, 12, 0, 0);
    const h = makeHarness({
      now,
      maxRateAgeSeconds: 86400,
      rows: {
        gold: {
          material: "gold",
          rate_per_gram_paise: 600000,
          effective_at: new Date(now - 86400 * 1000).toISOString(),
        },
      },
    });
    __configureRatesForTests(h.config);

    const rate = await getCurrentRate("gold");
    expect(rate.rate_per_gram_paise).toBe(600000);
  });
});

describe("getCurrentRate — no row", () => {
  it("throws RateUnavailableError with reason 'missing' when no row exists", async () => {
    const now = Date.UTC(2026, 5, 8, 12, 0, 0);
    const h = makeHarness({ now, rows: { gold: null } });
    __configureRatesForTests(h.config);

    await expect(getCurrentRate("gold")).rejects.toBeInstanceOf(
      RateUnavailableError,
    );
    await expect(getCurrentRate("gold")).rejects.toMatchObject({
      reason: "missing",
      material: "gold",
    });
  });

  it("never fabricates a fallback rate", async () => {
    const now = Date.UTC(2026, 5, 8, 12, 0, 0);
    const h = makeHarness({ now, rows: { silver: null } });
    __configureRatesForTests(h.config);

    let threw = false;
    try {
      await getCurrentRate("silver");
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });
});
