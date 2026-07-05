/**
 * Rates — the cached, staleness-guarded Metal Rate reader (ADR-0008, ADR-0010).
 *
 * Two distinct notions of "stale" are kept apart (ADR-0010):
 *
 *  - **5-minute cache (performance).** The latest rate per material is cached in
 *    an in-process, module-level `Map` with a timestamp, TTL 5 minutes. On a hit
 *    within TTL we serve the cached row; on a miss we re-read the latest
 *    `metal_rates` row (ADR-0008: greatest `effective_at` wins). No Redis. On
 *    Fluid Compute each instance has its own copy — acceptable for a slow-moving
 *    rate and always consistent within a single request.
 *
 *  - **24-hour staleness ceiling (correctness).** Even a freshly-read row can be
 *    too old to trust. If the latest row's `effective_at` is older than
 *    `settings.max_rate_age_seconds` (default 86400), we refuse to return a rate
 *    and throw `RateUnavailableError` (reason `"stale"`). Catalog/cart render
 *    this as "price unavailable"; checkout treats it as a block.
 *
 *  - **No-row failure.** If no `metal_rates` row exists for the material, we
 *    throw `RateUnavailableError` (reason `"missing"`) — never fabricate a
 *    fallback. Mispricing is a real-money error; failing loudly is correct.
 *
 * The DB read and the clock are injected via `RatesConfig` so the cache and
 * staleness logic are unit-testable without a live Supabase. Production wires a
 * default config (lazily) that reads from the public Supabase client and the
 * `settings` singleton.
 */

import type { Material, PricingRate } from "./pricing";

/** The shape of a `metal_rates` row as the rate reader consumes it. */
export interface RateRow {
  material: Material;
  rate_per_gram_paise: number;
  /** ISO-8601 timestamp (the row's `effective_at`). */
  effective_at: string;
}

/** Injectable seams: a clock, the staleness ceiling, and the DB read. */
export interface RatesConfig {
  /** Current time in epoch milliseconds. */
  now: () => number;
  /** Staleness ceiling from `settings.max_rate_age_seconds` (default 86400). */
  maxRateAgeSeconds: number;
  /** Read the latest `metal_rates` row for a material, or `null` if none. */
  fetchLatestRate: (material: Material) => Promise<RateRow | null>;
}

/** Why a rate could not be served. */
export type RateUnavailableReason = "missing" | "stale";

/**
 * Typed error surfaced for both the no-row and over-ceiling cases. Catalog/cart
 * render it as "price unavailable"; checkout treats it as a hard block.
 */
export class RateUnavailableError extends Error {
  readonly material: Material;
  readonly reason: RateUnavailableReason;

  constructor(material: Material, reason: RateUnavailableReason) {
    super(
      reason === "missing"
        ? `No metal rate exists for ${material}; price unavailable.`
        : `Metal rate for ${material} is stale (older than the staleness ceiling); price unavailable.`,
    );
    this.name = "RateUnavailableError";
    this.material = material;
    this.reason = reason;
  }
}

/** 5-minute cache TTL (ADR-0010). */
const CACHE_TTL_MS = 5 * 60 * 1000;

interface CacheEntry {
  row: RateRow;
  fetchedAt: number;
}

/** Module-level, in-process cache. One copy per server instance (ADR-0010). */
const cache = new Map<Material, CacheEntry>();

/**
 * The active config. In production this is the default (Supabase-backed) config,
 * loaded lazily so importing this module has no side effects and the tests can
 * override it. Tests inject their own via `__configureRatesForTests`.
 */
let activeConfig: RatesConfig | null = null;

function getConfig(): RatesConfig {
  if (activeConfig === null) {
    activeConfig = createDefaultConfig();
  }
  return activeConfig;
}

/**
 * Return the current rate for a material as a `PricingRate` ready for
 * `calculatePrice`. Serves from the 5-minute cache on a hit, otherwise reads
 * the latest row. Throws `RateUnavailableError` on a missing or stale rate.
 */
export async function getCurrentRate(material: Material): Promise<PricingRate> {
  const config = getConfig();
  const now = config.now();

  const cached = cache.get(material);
  let row: RateRow;
  if (cached && now - cached.fetchedAt < CACHE_TTL_MS) {
    row = cached.row;
  } else {
    const fetched = await config.fetchLatestRate(material);
    if (fetched === null) {
      throw new RateUnavailableError(material, "missing");
    }
    row = fetched;
    cache.set(material, { row, fetchedAt: now });
  }

  // 24h staleness ceiling — checked against the (possibly cached) row's
  // effective_at, so a cached row that crosses the ceiling still fails.
  const ageSeconds = (now - Date.parse(row.effective_at)) / 1000;
  if (ageSeconds > config.maxRateAgeSeconds) {
    throw new RateUnavailableError(material, "stale");
  }

  return {
    material: row.material,
    rate_per_gram_paise: row.rate_per_gram_paise,
  };
}

/**
 * Batched variant — fetch several materials at once (e.g. a Cart spanning gold
 * and silver). Returns a map of material → rate. Throws on the first
 * unavailable material so the caller fails loudly (ADR-0010).
 */
export async function getCurrentRates(
  materials: readonly Material[],
): Promise<Map<Material, PricingRate>> {
  const unique = [...new Set(materials)];
  const entries = await Promise.all(
    unique.map(async (m) => [m, await getCurrentRate(m)] as const),
  );
  return new Map(entries);
}

/**
 * Build the production config: reads the latest row from `metal_rates` via the
 * public (anon-readable) Supabase server client and the staleness ceiling from
 * the `settings` singleton. Imported lazily to avoid pulling the Supabase
 * client (and `next/headers`) into pure unit-test paths.
 */
function createDefaultConfig(): RatesConfig {
  // The configured ceiling is memoised per instance. It defaults to the
  // documented 86400 (24h) until the `settings` row has been read once; the
  // first rate fetch warms it (see `fetchLatestRate` below), so every staleness
  // check after the first read uses the configured value.
  let ceiling = 86400;
  let ceilingLoaded = false;

  const loadCeiling = async (): Promise<void> => {
    if (ceilingLoaded) {
      return;
    }
    const { createClient } = await import("./supabase/server");
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("settings")
      .select("max_rate_age_seconds")
      .limit(1)
      .maybeSingle();
    if (error) {
      throw error;
    }
    if (data?.max_rate_age_seconds != null) {
      ceiling = data.max_rate_age_seconds;
    }
    ceilingLoaded = true;
  };

  return {
    now: () => Date.now(),
    get maxRateAgeSeconds() {
      return ceiling;
    },
    fetchLatestRate: async (material) => {
      // Warm the ceiling alongside the rate read so the configured value is in
      // effect from the staleness check that immediately follows this fetch.
      await loadCeiling();
      const { createClient } = await import("./supabase/server");
      const supabase = await createClient();
      const { data, error } = await supabase
        .from("metal_rates")
        .select("material, rate_per_gram_paise, effective_at")
        .eq("material", material)
        .order("effective_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        throw error;
      }
      return data as RateRow | null;
    },
  };
}

// --- Test seams -------------------------------------------------------------

/** Replace the active config (clock + fetcher + ceiling). Test-only. */
export function __configureRatesForTests(config: RatesConfig): void {
  activeConfig = config;
}

/** Clear the module-level cache. Test-only. */
export function __resetRateCacheForTests(): void {
  cache.clear();
}
