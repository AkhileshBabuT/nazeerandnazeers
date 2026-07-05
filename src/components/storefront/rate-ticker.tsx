import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentRate } from "@/lib/rates";
import type { Material } from "@/lib/pricing";
import { formatRate, formatTimeIST } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Rate ticker (design handoff §1) — slim bar above the header on every
 * storefront page. 2px gold top border, DM Mono tabular numerals, green/
 * vermillion deltas, right-aligned "as of HH:MM". When a material has no
 * fresh rate (missing or past the staleness ceiling, ADR-0010) it renders
 * "—"; when nothing is live, the right side reads "rate unavailable".
 */

type MaterialTicker =
  | {
      status: "live";
      ratePaise: number;
      deltaPct: string | null;
      up: boolean;
      effectiveAt: string;
    }
  | { status: "unavailable" };

async function readMaterial(material: Material): Promise<MaterialTicker> {
  try {
    // Availability check — applies the settings staleness ceiling + 5min cache.
    await getCurrentRate(material);
  } catch {
    return { status: "unavailable" };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("metal_rates")
    .select("rate_per_gram_paise, effective_at")
    .eq("material", material)
    .order("effective_at", { ascending: false })
    .limit(2);
  const latest = data?.[0];
  if (!latest) {
    return { status: "unavailable" };
  }
  const prev = data?.[1];
  let deltaPct: string | null = null;
  let up = true;
  if (prev && prev.rate_per_gram_paise > 0) {
    const d =
      ((latest.rate_per_gram_paise - prev.rate_per_gram_paise) /
        prev.rate_per_gram_paise) *
      100;
    up = d >= 0;
    deltaPct = `${up ? "+" : "−"}${Math.abs(d).toFixed(2)}%`;
  }
  return {
    status: "live",
    ratePaise: latest.rate_per_gram_paise,
    deltaPct,
    up,
    effectiveAt: latest.effective_at,
  };
}

function Segment({ label, t }: { label: string; t: MaterialTicker }) {
  if (t.status === "unavailable") {
    return (
      <span className="text-muted-foreground">
        {label} —
      </span>
    );
  }
  return (
    <span className="flex items-baseline gap-2">
      <span>
        {label} {formatRate(t.ratePaise)}
      </span>
      {t.deltaPct !== null && (
        <span className={t.up ? "text-rate-up" : "text-rate-down"}>
          {t.up ? "▲" : "▼"} {t.deltaPct}
        </span>
      )}
    </span>
  );
}

export async function RateTicker() {
  // Rates are request-time data (the staleness check reads the clock before
  // any request input) — declare it so Cache Components streams this slot.
  await connection();
  const [gold, silver] = await Promise.all([
    readMaterial("gold"),
    readMaterial("silver"),
  ]);
  const liveTimes = [gold, silver]
    .filter((t): t is Extract<MaterialTicker, { status: "live" }> => t.status === "live")
    .map((t) => t.effectiveAt)
    .sort();
  const asOf = liveTimes[liveTimes.length - 1];
  return (
    <TickerBar muted={asOf === undefined}>
      <Segment label="GOLD" t={gold} />
      <Segment label="SILVER" t={silver} />
      <span className="ml-auto text-muted-foreground">
        {asOf === undefined ? "rate unavailable" : `as of ${formatTimeIST(asOf)}`}
      </span>
    </TickerBar>
  );
}

/** Skeleton with identical dimensions — no layout shift while streaming. */
export function RateTickerSkeleton() {
  return (
    <TickerBar muted>
      <span>GOLD —</span>
      <span>SILVER —</span>
      <span className="ml-auto">&nbsp;</span>
    </TickerBar>
  );
}

function TickerBar({
  muted,
  children,
}: {
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-t-2 border-t-gold bg-card px-4 py-2 md:px-12">
      <div
        className={cn(
          "ledger flex items-baseline gap-4 text-[11px] md:gap-8 md:text-sm",
          muted && "text-muted-foreground",
        )}
      >
        {children}
      </div>
    </div>
  );
}
