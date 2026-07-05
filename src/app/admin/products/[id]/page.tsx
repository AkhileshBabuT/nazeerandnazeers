import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import {
  getAudiences,
  getCategories,
  getGstSettings,
  getLatestRateRow,
  type ProductMediaRow,
  type ProductGemstoneRow,
} from "@/lib/shop/data";
import { ProductForm } from "@/components/admin/product-form";
import { ProductMediaEditor } from "@/components/admin/product-media-editor";
import { ProductGemstoneEditor } from "@/components/admin/product-gemstone-editor";
import { VariantEditor } from "@/components/admin/variant-editor";

export const metadata = { title: "Product · Admin" };

/**
 * A2b Product editor `/admin/products/[id]` ("new" = create). Server shell
 * fetches the row (admin RLS — inactive included), both metals' latest rate
 * rows + the staleness ceiling + GST bps for the client island's live price
 * preview (computed, never stored — ADR-0007).
 */
export default function ProductEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  let product = null;
  if (id !== "new") {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    // Malformed UUIDs raise a cast error — treat as not found.
    if (error || data === null) {
      notFound();
    }
    product = data;
  }

  const [settings, goldRate, silverRate, settingsRes, categories, audiences] =
    await Promise.all([
      getGstSettings(),
      getLatestRateRow("gold"),
      getLatestRateRow("silver"),
      supabase.from("settings").select("max_rate_age_seconds").limit(1).single(),
      getCategories(),
      getAudiences(),
    ]);
  const maxRateAgeSeconds = settingsRes.data?.max_rate_age_seconds ?? 86400;

  // Media + gemstones are per-piece; only an existing piece has an id to attach
  // to. Read via the ADMIN client (carries the admin claim) — the public-read
  // policy is gated on the product being active (migration 0014), so a DRAFT
  // piece's media/gemstone would be invisible to the anon read model.
  let media: ProductMediaRow[] = [];
  let gemstones: ProductGemstoneRow[] = [];
  let variants: import("@/lib/supabase/database.types").Database["public"]["Tables"]["product_variant"]["Row"][] = [];
  if (product !== null) {
    const [m, g, v] = await Promise.all([
      supabase
        .from("product_media")
        .select("*")
        .eq("product_id", product.id)
        .order("is_primary", { ascending: false })
        .order("sort_order", { ascending: true }),
      supabase
        .from("product_gemstone")
        .select("*")
        .eq("product_id", product.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("product_variant")
        .select("*")
        .eq("product_id", product.id)
        .order("purity_karat", { ascending: true }),
    ]);
    media = m.data ?? [];
    gemstones = g.data ?? [];
    variants = v.data ?? [];
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="eyebrow text-muted-foreground">
          Products · {product === null ? "New piece" : "Edit"}
        </h1>
        {product !== null && (
          <p className="mt-1.5 text-md font-medium">
            {product.name}{" "}
            <span className="ledger text-xs text-muted-foreground">
              {product.sku}
            </span>
          </p>
        )}
      </div>
      <ProductForm
        product={product}
        rates={{ gold: goldRate, silver: silverRate }}
        maxRateAgeSeconds={maxRateAgeSeconds}
        settings={settings}
        categories={categories}
        audiences={audiences}
      />
      {product !== null && (
        <>
          <section className="max-w-xl space-y-4">
            <h2 className="eyebrow border-b-2 border-foreground pb-2 text-muted-foreground">
              Media gallery
            </h2>
            <ProductMediaEditor productId={product.id} media={media} />
          </section>
          <section className="space-y-4">
            <h2 className="eyebrow border-b-2 border-foreground pb-2 text-muted-foreground">
              Gemstones &amp; certificate
            </h2>
            <ProductGemstoneEditor
              productId={product.id}
              gemstones={gemstones}
            />
          </section>
          <section className="space-y-4">
            <h2 className="eyebrow border-b-2 border-foreground pb-2 text-muted-foreground">
              Variants (purity / size / tone)
            </h2>
            <VariantEditor productId={product.id} initialVariants={variants} />
          </section>
        </>
      )}
    </div>
  );
}

/** Header line + two-column pulse blocks — matches the editor's grid. */
function EditorSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <span className="block h-[11px] w-32 animate-pulse bg-secondary" />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-8">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <span className="block h-[11px] w-28 animate-pulse bg-secondary" />
              <span className="mt-4 block h-24 w-full animate-pulse bg-secondary/60" />
            </div>
          ))}
        </div>
        <div className="h-72 animate-pulse border bg-card" />
      </div>
    </div>
  );
}
