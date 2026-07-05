import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLatestRateRow } from "@/lib/shop/data";
import {
  ageLabel,
  nowMs,
  rateFreshness,
  type RateFreshness,
} from "@/lib/admin/dashboard";
import { liveRateIds } from "@/lib/admin/rates";
import { formatRate, formatTimeIST } from "@/lib/format";
import type { Material } from "@/lib/pricing";
import { PostRateForm } from "@/components/admin/post-rate-form";
import { cn } from "@/lib/utils";

export const metadata = { title: "Rates" };

/**
 * A3 Metal-rate management (PRD §5 A3) — the latest-row-wins teaching UI.
 * Two large white cards (GOLD / SILVER) with the live rate, freshness pill,
 * and the inline POST NEW RATE island; below, the full ruled history with a
 * LIVE crown on the newest row per material; and the permanent append-only
 * footnote that makes ADR-0008 obvious to a non-engineer.
 */
export default function AdminRatesPage() {
  return (
    <div className="space-y-10">
      <h1 className="eyebrow text-muted-foreground">Rates</h1>
      <Suspense fallback={<RateCardsSkeleton />}>
        <RateCards />
      </Suspense>
      <Suspense fallback={<HistorySkeleton />}>
        <RateHistory />
      </Suspense>
      <AppendOnlyFootnote />
    </div>
  );
}

/* ----------------------------------------------------------------- cards -- */

async function RateCards() {
  // Freshness reads the clock — declare request time before computing.
  await connection();
  const supabase = await createClient();
  const [settingsRes, goldRow, silverRow] = await Promise.all([
    supabase.from("settings").select("max_rate_age_seconds").limit(1).single(),
    getLatestRateRow("gold"),
    getLatestRateRow("silver"),
  ]);
  const maxAge = settingsRes.data?.max_rate_age_seconds ?? 86400;
  const now = nowMs();
  const metals = [
    {
      material: "gold" as const,
      label: "Gold",
      f: rateFreshness(goldRow, maxAge, now),
      latest: goldRow?.effective_at ?? null,
    },
    {
      material: "silver" as const,
      label: "Silver",
      f: rateFreshness(silverRow, maxAge, now),
      latest: silverRow?.effective_at ?? null,
    },
  ];
  const problems = metals.filter(({ f }) => f.status !== "fresh");

  return (
    <section className="space-y-4">
      <div className="grid gap-6 sm:grid-cols-2">
        {metals.map((m) => (
          <RateCard key={m.material} {...m} />
        ))}
      </div>
      {problems.length > 0 && (
        <div className="space-y-1 border border-destructive bg-card px-5 py-4 text-destructive">
          {problems.map(({ label, f }) => (
            <p key={label}>
              {f.status === "stale"
                ? `${label} rate is ${ageLabel(f.ageSeconds)} old — storefront prices are HIDDEN. Post today's rate above.`
                : `No ${label.toLowerCase()} rate posted — storefront prices are HIDDEN. Post today's rate above.`}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

function RateCard({
  material,
  label,
  f,
  latest,
}: {
  material: Material;
  label: string;
  f: RateFreshness;
  latest: string | null;
}) {
  return (
    <article className="border bg-card p-6">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="eyebrow text-muted-foreground">{label}</h2>
        <FreshnessPill f={f} />
      </div>
      <div className="ledger mt-3 text-2xl">
        {f.status === "missing" ? "—" : formatRate(f.ratePaise)}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">
        {f.status === "missing"
          ? "no rate posted"
          : `effective ${formatTimeIST(f.effectiveAt)} IST`}
      </div>
      <div className="mt-6 border-t pt-5">
        <h3 className="eyebrow text-muted-foreground">Post new rate</h3>
        <div className="mt-3">
          <PostRateForm material={material} latestEffectiveAt={latest} />
        </div>
      </div>
    </article>
  );
}

function FreshnessPill({ f }: { f: RateFreshness }) {
  if (f.status === "fresh") {
    return (
      <span className="eyebrow rounded-full border border-rate-up px-3 py-1 text-rate-up">
        Fresh
      </span>
    );
  }
  return (
    <span className="eyebrow rounded-full border border-rate-down px-3 py-1 text-rate-down">
      {f.status === "stale" ? `Stale ${ageLabel(f.ageSeconds)}` : "No rate"}
    </span>
  );
}

/** Same card chrome and row heights as the live cards — no layout shift. */
function RateCardsSkeleton() {
  return (
    <section>
      <div className="grid gap-6 sm:grid-cols-2">
        {["Gold", "Silver"].map((label) => (
          <article key={label} className="border bg-card p-6">
            <h2 className="eyebrow text-muted-foreground">{label}</h2>
            <div className="ledger mt-3 text-2xl text-muted-foreground">—</div>
            <div className="mt-1 text-xs">&nbsp;</div>
            <div className="mt-6 border-t pt-5">
              <h3 className="eyebrow text-muted-foreground">Post new rate</h3>
              <div className="mt-3 space-y-4" aria-hidden>
                <div className="h-12 animate-pulse bg-secondary" />
                <div className="h-12 animate-pulse bg-secondary" />
                <div className="h-11 w-24 animate-pulse bg-secondary" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- history -- */

async function RateHistory() {
  await connection();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("metal_rates")
    .select("id, material, rate_per_gram_paise, source, effective_at")
    .order("effective_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows: Array<{
    id: string;
    material: Material;
    rate_per_gram_paise: number;
    source: string | null;
    effective_at: string;
  }> = data ?? [];
  const live = liveRateIds(rows);

  return (
    <section>
      <h2 className="eyebrow border-b-2 border-foreground pb-2 text-muted-foreground">
        History
      </h2>
      {rows.length === 0 ? (
        <p className="py-2 text-muted-foreground">No rates posted yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <HeadCell>Time</HeadCell>
              <HeadCell>Material</HeadCell>
              <HeadCell className="text-right">Rate</HeadCell>
              <HeadCell>Source</HeadCell>
              <HeadCell className="text-right">
                <span className="sr-only">Live</span>
              </HeadCell>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => {
              const isLive = live.has(r.id);
              return (
                // Superseded rows fade to muted — only the LIVE rows carry ink.
                <tr key={r.id} className={cn(!isLive && "text-muted-foreground")}>
                  <td className="ledger py-2 pr-4">
                    {formatDateTimeIST(r.effective_at)}
                  </td>
                  <td className="py-2 pr-4">
                    <span
                      className={cn(
                        "mr-2 inline-block size-2 rounded-full align-baseline",
                        r.material === "gold" ? "bg-gold" : "bg-silver",
                      )}
                    />
                    <span className="eyebrow">{r.material}</span>
                  </td>
                  <td className="ledger py-2 pr-4 text-right">
                    {formatRate(r.rate_per_gram_paise)}
                  </td>
                  <td className="py-2 pr-4">{r.source ?? "—"}</td>
                  <td className="py-2 text-right">
                    {isLive && (
                      <span className="eyebrow border border-gold px-2 py-0.5 text-gold">
                        Live
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function HeadCell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "eyebrow py-2 pr-4 text-left font-normal text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

/** History uses date + time — rows span days (rate ticker shows HH:MM only). */
function formatDateTimeIST(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

/** Same header + one blank row — dimension-matched. */
function HistorySkeleton() {
  return (
    <section>
      <h2 className="eyebrow border-b-2 border-foreground pb-2 text-muted-foreground">
        History
      </h2>
      <p className="py-2 text-muted-foreground">&nbsp;</p>
    </section>
  );
}

/* -------------------------------------------------------------- footnote -- */

/**
 * Permanent ADR-0008 teaching panel. The order chip is a fixed example —
 * deliberately hardcoded so it NEVER changes as rates are posted above it.
 */
function AppendOnlyFootnote() {
  return (
    <section className="border bg-card px-5 py-4">
      <p className="text-muted-foreground">
        Rates are append-only. New rates affect new pricing only — every placed
        order keeps the rate it was billed at.
      </p>
      <div className="mt-3 flex flex-wrap items-baseline gap-3">
        <span className="inline-flex items-baseline gap-2 border px-3 py-1.5">
          <span className="ledger text-xs">ORD-2026-098</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="ledger text-xs">billed @ {formatRate(718000)}</span>
        </span>
        <span className="eyebrow text-muted-foreground">
          Example — this chip never changes
        </span>
      </div>
    </section>
  );
}
