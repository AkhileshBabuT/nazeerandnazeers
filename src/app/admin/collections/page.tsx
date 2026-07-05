import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata = { title: "Collections · Admin" };

/**
 * Admin collections list `/admin/collections` (PRD 07-01): dense zebra table
 * over an admin-RLS read (includes hidden), row click → editor, charcoal NEW
 * COLLECTION → create.
 */
export default function AdminCollectionsPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="eyebrow text-muted-foreground">Collections</h1>
        <Link href="/admin/collections/new" className={buttonVariants()}>
          New collection
        </Link>
      </div>
      <Suspense fallback={<TableSkeleton />}>
        <CollectionsTable />
      </Suspense>
    </div>
  );
}

const GRID_COLS =
  "grid grid-cols-[minmax(0,1fr)_9rem_5rem_5rem] items-center gap-3";

async function CollectionsTable() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("collections")
    .select(
      "id, slug, display_name, sort_order, is_active, product_collections(product_id)",
    )
    .order("sort_order", { ascending: true });
  if (error) {
    throw error;
  }
  const rows = data;

  return (
    <div className="border bg-card">
      <div
        className={cn(
          GRID_COLS,
          "eyebrow border-b-2 border-foreground px-4 py-2.5 text-muted-foreground",
        )}
      >
        <span>Name</span>
        <span>Slug</span>
        <span className="text-right">Pieces</span>
        <span className="text-right">Status</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-muted-foreground">
          No collections yet.{" "}
          <Link
            href="/admin/collections/new"
            className="underline transition-colors hover:text-gold"
          >
            Create one
          </Link>
          .
        </p>
      ) : (
        rows.map((c) => (
          <Link
            key={c.id}
            href={`/admin/collections/${c.id}`}
            className={cn(
              GRID_COLS,
              "border-l-2 border-l-transparent px-4 py-2 transition-colors odd:bg-muted hover:border-l-gold",
            )}
          >
            <span className="truncate">{c.display_name}</span>
            <span className="ledger text-xs text-muted-foreground">
              {c.slug}
            </span>
            <span className="ledger text-right text-xs">
              {c.product_collections.length}
            </span>
            <span className="text-right">
              <span
                className={cn(
                  "eyebrow rounded-xs border px-2 py-0.5",
                  c.is_active
                    ? "border-foreground/40"
                    : "border-border text-muted-foreground",
                )}
              >
                {c.is_active ? "Active" : "Hidden"}
              </span>
            </span>
          </Link>
        ))
      )}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="border bg-card">
      <div className="eyebrow border-b-2 border-foreground px-4 py-2.5 text-muted-foreground">
        Name
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="px-4 py-2 odd:bg-muted">
          <span className="block h-8 w-full animate-pulse bg-secondary/60" />
        </div>
      ))}
    </div>
  );
}
