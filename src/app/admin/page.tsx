import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLatestRateRow } from "@/lib/shop/data";
import {
  ageLabel,
  nowMs,
  rateFreshness,
  startOfTodayIstIso,
  type RateFreshness,
} from "@/lib/admin/dashboard";
import { formatPaise, formatRate, formatTimeIST } from "@/lib/format";
import { orderNumberDisplay } from "@/lib/orders/checkout";
import type { OrderStatus } from "@/lib/orders/state-machine";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Admin" };

/** Pending payments count as "needing attention" past this age (A1 brief). */
const PENDING_ATTENTION_MS = 10 * 60 * 1000;
/** Low-stock line threshold — matches the A2 list's ≤2 vermillion underline. */
const LOW_STOCK_THRESHOLD = 2;

/**
 * A1 Dashboard — the morning ledger (PRD §5 A1). Top: full-width rate strip
 * with freshness pills; becomes the vermillion stale banner when a rate is
 * missing/over the ceiling (ADR-0010 — storefront prices are hidden then).
 * Below: three ruled columns from simple admin-RLS selects (no aggregate RPCs).
 */
export default function AdminDashboardPage() {
  return (
    <div className="space-y-10">
      <div className="flex items-baseline justify-between">
        <h1 className="eyebrow text-muted-foreground">Morning Ledger</h1>
        <Suspense fallback={null}>
          <LedgerDate />
        </Suspense>
      </div>
      <Suspense fallback={<RateStripSkeleton />}>
        <RateStrip />
      </Suspense>
      <Suspense fallback={<ColumnsSkeleton />}>
        <DashboardColumns />
      </Suspense>
    </div>
  );
}

async function LedgerDate() {
  await connection();
  const dateStr = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  })
    .format(new Date(nowMs()))
    .toUpperCase();
  return <span className="ledger text-xs text-muted-foreground">{dateStr}</span>;
}

/* ---------------------------------------------------------------- rates -- */

async function RateStrip() {
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
  const gold = rateFreshness(goldRow, maxAge, now);
  const silver = rateFreshness(silverRow, maxAge, now);
  const problems = [
    { label: "Gold", f: gold },
    { label: "Silver", f: silver },
  ].filter(({ f }) => f.status !== "fresh");

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <section className={cn("border bg-card", gold.status !== "fresh" && "border-destructive")}>
          <MetalCell label="Gold" f={gold} />
        </section>
        <section className={cn("border bg-card", silver.status !== "fresh" && "border-destructive")}>
          <MetalCell label="Silver" f={silver} />
        </section>
      </div>
      {problems.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-4 border border-destructive px-5 py-4">
          <div className="space-y-1 text-destructive">
            {problems.map(({ label, f }) => (
              <p key={label}>
                {f.status === "stale"
                  ? `${label} rate is ${ageLabel(f.ageSeconds)} old — storefront prices are HIDDEN.`
                  : `No ${label.toLowerCase()} rate posted — storefront prices are HIDDEN.`}
              </p>
            ))}
          </div>
          <Link
            href="/admin/rates"
            className={cn(buttonVariants({ variant: "outline" }), "border-gold")}
          >
            Post today&apos;s rate
          </Link>
        </div>
      )}
    </div>
  );
}

function MetalCell({ label, f }: { label: string; f: RateFreshness }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-4">
      <div>
        <div className="eyebrow text-muted-foreground">{label}</div>
        <div className="ledger mt-1 text-lg">
          {f.status === "missing" ? "—" : formatRate(f.ratePaise)}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {f.status === "missing"
            ? "no rate posted"
            : `effective ${formatTimeIST(f.effectiveAt)} IST`}
        </div>
      </div>
      <FreshnessPill f={f} />
    </div>
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

/** Same cell dimensions as the live strip — no layout shift. */
function RateStripSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {["Gold", "Silver"].map((label) => (
        <section key={label} className="border bg-card px-5 py-4">
          <div className="eyebrow text-muted-foreground">{label}</div>
          <div className="ledger mt-1 text-lg text-muted-foreground">—</div>
          <div className="mt-1 text-xs">&nbsp;</div>
        </section>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------- columns -- */

/** Status ink per PRD §3.4's status-badge key. */
const statusClass: Record<OrderStatus, string> = {
  pending: "text-muted-foreground",
  paid: "text-foreground",
  processing: "text-foreground",
  shipped: "text-foreground",
  delivered: "text-rate-up",
  cancelled: "text-muted-foreground line-through",
  refunded: "text-hallmark",
  partially_refunded: "text-hallmark",
};

async function DashboardColumns() {
  // The pending-age cutoff and IST day boundary read the clock.
  await connection();
  const supabase = await createClient();
  const now = nowMs();
  const pendingBefore = new Date(now - PENDING_ATTENTION_MS).toISOString();
  const [pendingRes, lowStockRes, todayRes, refundsRes, pendingReviewsRes] = await Promise.all([
    supabase
      .from("orders")
      .select("id, order_number, order_year, total_paise, created_at")
      .eq("status", "pending")
      .lt("created_at", pendingBefore)
      .order("created_at", { ascending: true })
      .limit(10),
    supabase
      .from("products")
      .select("id, sku, name, stock_quantity")
      .eq("is_active", true)
      .lte("stock_quantity", LOW_STOCK_THRESHOLD)
      .order("stock_quantity", { ascending: true })
      .limit(10),
    supabase
      .from("orders")
      .select("id, order_number, order_year, status, total_paise, created_at")
      .gte("created_at", startOfTodayIstIso(now))
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("refunds")
      .select(
        "id, kind, amount_paise, created_at, orders(order_number, order_year)",
      )
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("reviews")
      .select("id")
      .eq("is_approved", false)
      .limit(50),
  ]);
  for (const res of [pendingRes, lowStockRes, todayRes, refundsRes]) {
    if (res.error) throw res.error;
  }
  const pending = pendingRes.data ?? [];
  const lowStock = lowStockRes.data ?? [];
  const today = todayRes.data ?? [];
  const refunds = refundsRes.data ?? [];
  const pendingReviews = pendingReviewsRes.data ?? [];

  return (
    <div className="grid gap-10 lg:grid-cols-3">
      <Column title="Needs attention">
        {pending.length === 0 && lowStock.length === 0 && pendingReviews.length === 0 ? (
          <EmptyRow>Nothing pending.</EmptyRow>
        ) : (
          <>
            {pending.map((o) => (
              <li
                key={o.id}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="ledger">
                  {orderNumberDisplay(o.order_year, o.order_number)}
                </span>
                <span className="eyebrow text-rate-down">
                  Pending {ageLabel((now - Date.parse(o.created_at)) / 1000)}
                </span>
                <span className="ledger">{formatPaise(o.total_paise)}</span>
              </li>
            ))}
            {lowStock.map((p) => (
              <li
                key={p.id}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="min-w-0 truncate">
                  {p.name} <span className="ledger text-xs">{p.sku}</span>
                </span>
                <span className="ledger shrink-0 text-rate-down">
                  {p.stock_quantity} left
                </span>
              </li>
            ))}
            {pendingReviews.length > 0 && (
              <li className="flex items-baseline justify-between gap-3 py-2">
                <Link href="/admin/reviews" className="hover:text-gold">
                  {pendingReviews.length} review{pendingReviews.length === 1 ? "" : "s"} pending
                </Link>
                <span className="eyebrow text-gold">review</span>
              </li>
            )}
          </>
        )}
      </Column>

      <Column title="Today">
        {today.length === 0 ? (
          <EmptyRow>No orders yet today.</EmptyRow>
        ) : (
          today.map((o) => (
            <li
              key={o.id}
              className="flex items-baseline justify-between gap-3 py-2"
            >
              <span className="ledger">
                {orderNumberDisplay(o.order_year, o.order_number)}
              </span>
              <span className={cn("eyebrow", statusClass[o.status])}>
                {o.status.replace("_", " ")}
              </span>
              <span className="ledger">{formatPaise(o.total_paise)}</span>
            </li>
          ))
        )}
      </Column>

      <Column title="Recent refunds">
        {refunds.length === 0 ? (
          <EmptyRow>No refunds yet.</EmptyRow>
        ) : (
          refunds.map((r) => (
            <li
              key={r.id}
              className="flex items-baseline justify-between gap-3 py-2"
            >
              <span className="ledger">
                {r.orders
                  ? orderNumberDisplay(
                      r.orders.order_year,
                      r.orders.order_number,
                    )
                  : "—"}
              </span>
              <span className="eyebrow text-muted-foreground">{r.kind}</span>
              <span className="ledger text-hallmark">
                −{formatPaise(r.amount_paise)}
              </span>
            </li>
          ))
        )}
      </Column>
    </div>
  );
}

function Column({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="eyebrow border-b-2 border-foreground pb-2 text-muted-foreground">
        {title}
      </h2>
      <ul className="divide-y">{children}</ul>
    </section>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <li className="py-2 text-muted-foreground">{children}</li>;
}

/** Same headers + one blank row per column — dimension-matched. */
function ColumnsSkeleton() {
  return (
    <div className="grid gap-10 lg:grid-cols-3">
      {["Needs attention", "Today", "Recent refunds"].map((title) => (
        <section key={title}>
          <h2 className="eyebrow border-b-2 border-foreground pb-2 text-muted-foreground">
            {title}
          </h2>
          <ul className="divide-y">
            <li className="py-2 text-muted-foreground">&nbsp;</li>
          </ul>
        </section>
      ))}
    </div>
  );
}
