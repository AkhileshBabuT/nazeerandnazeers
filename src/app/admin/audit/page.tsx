import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Audit log" };

const CATEGORY_ACTIONS: Record<string, string[]> = {
  ORDERS: ["order_created", "payment_succeeded", "payment_failed", "fulfillment_advanced", "order_cancelled"],
  REFUNDS: ["refund_issued"],
  STOCK: ["stock_restocked", "reservation_released"],
  RATES: ["rate_posted"],
};
const CATEGORIES = ["ALL", "ORDERS", "REFUNDS", "STOCK", "RATES"] as const;

function shortDatetime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ cat?: string }>;
}) {
  const { cat } = await searchParams;
  const activeCategory = CATEGORIES.includes(cat as (typeof CATEGORIES)[number]) ? cat : "ALL";

  // Admin-scoped read under RLS ("admin reads audit log"): a non-admin session
  // gets zero rows, so the layout gate is not the only thing guarding this data.
  const svc = await createClient();
  let query = svc
    .from("audit_log")
    .select("id, actor_id, action, entity_type, entity_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (activeCategory && activeCategory !== "ALL") {
    const actions = CATEGORY_ACTIONS[activeCategory] ?? [];
    if (actions.length > 0) query = query.in("action", actions);
  }

  const { data: entries, error } = await query;
  if (error) throw error;

  return (
    <div className="space-y-8">
      <h1 className="eyebrow text-muted-foreground">Audit log</h1>

      {/* Category filter chips: ALL | ORDERS | REFUNDS | STOCK | RATES */}
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <Link
            key={c}
            href={c === "ALL" ? "/admin/audit" : `/admin/audit?cat=${c}`}
            className={`eyebrow rounded-xs border px-3 py-1.5 text-xs transition-colors hover:border-foreground ${
              activeCategory === c
                ? "border-foreground text-foreground"
                : "border-border text-muted-foreground"
            }`}
          >
            {c}
          </Link>
        ))}
      </div>

      {/* Grid rows: TIME | ACTOR | ACTION | ENTITY | ▾ */}
      {!entries || entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No audit entries.</p>
      ) : (
        <div className="border-t">
          <div className="grid grid-cols-[130px_80px_1fr_120px_32px] items-center gap-4 border-b py-2">
            <span className="eyebrow text-[10px] text-muted-foreground">TIME</span>
            <span className="eyebrow text-[10px] text-muted-foreground">ACTOR</span>
            <span className="eyebrow text-[10px] text-muted-foreground">ACTION</span>
            <span className="eyebrow text-[10px] text-muted-foreground">ENTITY</span>
            <span />
          </div>
          {entries.map((entry) => {
            const hasDetails =
              entry.details && typeof entry.details === "object" && Object.keys(entry.details as object).length > 0;
            return (
              <details key={entry.id} className="group border-b">
                <summary className="grid cursor-pointer list-none grid-cols-[130px_80px_1fr_120px_32px] items-center gap-4 py-2.5 text-xs hover:bg-muted/20">
                  <span className="ledger text-muted-foreground">{shortDatetime(entry.created_at)}</span>
                  <span>
                    {entry.actor_id ? (
                      <span className="eyebrow rounded-[2px] border border-border px-1 py-0.5 text-[9px] text-muted-foreground">
                        admin
                      </span>
                    ) : (
                      <span className="text-muted-foreground/40 text-[10px]">system</span>
                    )}
                  </span>
                  <span className="eyebrow text-foreground">{entry.action.replace(/_/g, " ")}</span>
                  <span className="text-muted-foreground">
                    {entry.entity_type}
                    {entry.entity_id && (
                      <span className="ledger ml-1">{entry.entity_id.slice(0, 8)}…</span>
                    )}
                  </span>
                  <span className="text-center text-muted-foreground/40">
                    {hasDetails ? "▾" : ""}
                  </span>
                </summary>
                {hasDetails && (
                  <div className="mb-2 ml-4 rounded-[2px] border border-border/50 bg-muted/10 px-4 py-3">
                    {Object.entries(entry.details as Record<string, unknown>).map(([k, v]) => (
                      <div key={k} className="flex gap-3 py-0.5 text-xs">
                        <span className="eyebrow min-w-[120px] text-[10px] text-muted-foreground">{k}</span>
                        <span className="ledger text-foreground">
                          {typeof v === "object" ? JSON.stringify(v) : String(v ?? "—")}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}
