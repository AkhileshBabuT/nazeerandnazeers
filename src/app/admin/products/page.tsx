import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { formatGrams, formatPaise } from "@/lib/format";
import { formatBps } from "@/lib/gst-display";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Products · Admin" };

/** A2 list — low-stock vermillion underline threshold (matches A1). */
const LOW_STOCK_THRESHOLD = 2;

type SearchParams = Promise<{
  material?: string;
  active?: string;
  q?: string;
}>;

/**
 * A2 Product list `/admin/products` (PRD §5 A2): dense zebra table over an
 * admin-RLS read (includes inactive), filter chips + search via searchParams,
 * row click → editor, charcoal NEW PIECE → create.
 */
export default function AdminProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="eyebrow text-muted-foreground">Products</h1>
        <Link href="/admin/products/new" className={buttonVariants()}>
          New piece
        </Link>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <ProductsTable searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

type Filters = {
  material?: "gold" | "silver";
  active?: "active" | "hidden";
  q?: string;
};

function filterHref(f: Filters): string {
  const params = new URLSearchParams();
  if (f.material !== undefined) {
    params.set("material", f.material);
  }
  if (f.active !== undefined) {
    params.set("active", f.active);
  }
  if (f.q !== undefined && f.q !== "") {
    params.set("q", f.q);
  }
  const qs = params.toString();
  return qs === "" ? "/admin/products" : `/admin/products?${qs}`;
}

/** Admin-compressed filter chip (same pattern as C2's). */
function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "eyebrow rounded-xs border px-2.5 py-1 transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-primary text-foreground hover:border-gold hover:text-gold",
      )}
    >
      {children}
    </Link>
  );
}

const GRID_COLS =
  "grid grid-cols-[2.25rem_7rem_minmax(0,1fr)_2.5rem_5.5rem_6rem_4rem_5rem] items-center gap-3";

async function ProductsTable({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const material =
    sp.material === "gold" || sp.material === "silver"
      ? sp.material
      : undefined;
  const active =
    sp.active === "active" || sp.active === "hidden" ? sp.active : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select(
      "id, sku, name, material, weight_grams, making_charge_type, making_charge_value, stock_quantity, is_active",
    )
    .order("created_at", { ascending: false });
  if (material !== undefined) {
    query = query.eq("material", material);
  }
  if (active !== undefined) {
    query = query.eq("is_active", active === "active");
  }
  if (q !== "") {
    // Strip PostgREST or-syntax delimiters; % wildcards from an admin are fine.
    const safe = q.replace(/[(),]/g, "");
    query = query.or(`sku.ilike.%${safe}%,name.ilike.%${safe}%`);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  const products = data;
  const base: Filters = { material, active, q: q === "" ? undefined : q };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Chip
          href={filterHref({ ...base, material: undefined })}
          active={material === undefined}
        >
          All
        </Chip>
        <Chip
          href={filterHref({ ...base, material: "gold" })}
          active={material === "gold"}
        >
          Gold
        </Chip>
        <Chip
          href={filterHref({ ...base, material: "silver" })}
          active={material === "silver"}
        >
          Silver
        </Chip>
        <span className="mx-1 text-muted-foreground">·</span>
        <Chip
          href={filterHref({
            ...base,
            active: active === "active" ? undefined : "active",
          })}
          active={active === "active"}
        >
          Active
        </Chip>
        <Chip
          href={filterHref({
            ...base,
            active: active === "hidden" ? undefined : "hidden",
          })}
          active={active === "hidden"}
        >
          Hidden
        </Chip>
        <form action="/admin/products" className="ml-auto flex items-center">
          {material !== undefined && (
            <input type="hidden" name="material" value={material} />
          )}
          {active !== undefined && (
            <input type="hidden" name="active" value={active} />
          )}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="SEARCH SKU / NAME"
            aria-label="Search by SKU or name"
            className="eyebrow w-52 border-b bg-transparent py-1.5 outline-none transition-colors placeholder:text-muted-foreground focus:border-gold"
          />
        </form>
      </div>

      <div className="border bg-card">
        <div
          className={cn(
            GRID_COLS,
            "eyebrow border-b-2 border-foreground px-4 py-2.5 text-muted-foreground",
          )}
        >
          <span />
          <span>SKU</span>
          <span>Name</span>
          <span>Metal</span>
          <span className="text-right">Weight</span>
          <span className="text-right">Making</span>
          <span className="text-right">Stock</span>
          <span className="text-right">Status</span>
        </div>
        {products.length === 0 ? (
          <p className="px-4 py-8 text-muted-foreground">
            No pieces match.{" "}
            <Link
              href="/admin/products"
              className="underline transition-colors hover:text-gold"
            >
              Clear filters
            </Link>
          </p>
        ) : (
          products.map((p) => (
            <Link
              key={p.id}
              href={`/admin/products/${p.id}`}
              className={cn(
                GRID_COLS,
                "border-l-2 border-l-transparent px-4 py-2 transition-colors odd:bg-muted hover:border-l-gold",
              )}
            >
              {/* G1: engraved monogram placeholder square. */}
              <span className="flex h-8 w-8 items-center justify-center rounded-xs border border-foreground/10 bg-secondary text-[9px] text-foreground/30">
                N&amp;N
              </span>
              <span className="ledger text-xs">{p.sku}</span>
              <span className="truncate">{p.name}</span>
              <span
                title={p.material}
                className={cn(
                  "h-2.5 w-2.5 rounded-full",
                  p.material === "gold" ? "bg-gold" : "bg-silver",
                )}
              />
              <span className="ledger text-right text-xs">
                {formatGrams(p.weight_grams)}
              </span>
              <span className="ledger text-right text-xs">
                {p.making_charge_type === "flat"
                  ? formatPaise(p.making_charge_value)
                  : formatBps(p.making_charge_value)}
              </span>
              <span className="text-right">
                <span
                  className={cn(
                    "ledger",
                    p.stock_quantity <= LOW_STOCK_THRESHOLD &&
                      "border-b-2 border-destructive",
                  )}
                >
                  {p.stock_quantity}
                </span>
              </span>
              <span className="text-right">
                <span
                  className={cn(
                    "eyebrow rounded-xs border px-2 py-0.5",
                    p.is_active
                      ? "border-foreground/40"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {p.is_active ? "Active" : "Hidden"}
                </span>
              </span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

/** Chips row + header + three blank zebra rows — dimension-matched. */
function TableSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-7 w-16 animate-pulse rounded-xs bg-secondary"
          />
        ))}
      </div>
      <div className="border bg-card">
        <div className="eyebrow border-b-2 border-foreground px-4 py-2.5 text-muted-foreground">
          SKU
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="px-4 py-2 odd:bg-muted">
            <span className="block h-8 w-full animate-pulse bg-secondary/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
