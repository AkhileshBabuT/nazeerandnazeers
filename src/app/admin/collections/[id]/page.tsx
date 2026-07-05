import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { CollectionForm } from "@/components/admin/collection-form";

export const metadata = { title: "Collection · Admin" };

/**
 * Collection editor `/admin/collections/[id]` ("new" = create). Server shell
 * fetches the row + its membership (admin RLS) and the full product list for
 * the membership picker, then hands off to the client form island.
 */
export default function CollectionEditorPage({
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

  let collection = null;
  let memberIds: string[] = [];
  if (id !== "new") {
    const { data, error } = await supabase
      .from("collections")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    // Malformed UUIDs raise a cast error — treat as not found.
    if (error || data === null) {
      notFound();
    }
    collection = data;
    const { data: members } = await supabase
      .from("product_collections")
      .select("product_id")
      .eq("collection_id", id)
      .order("sort_order", { ascending: true });
    memberIds = (members ?? []).map((m) => m.product_id);
  }

  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, sku, name, is_active")
    .order("created_at", { ascending: false });
  if (pErr) {
    throw pErr;
  }

  return (
    <div className="space-y-6">
      <h1 className="eyebrow text-muted-foreground">
        {collection ? collection.display_name : "New collection"}
      </h1>
      <CollectionForm
        collection={collection}
        products={products}
        memberIds={memberIds}
      />
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="max-w-xl space-y-8">
      <div className="h-8 w-48 animate-pulse bg-secondary/60" />
      <div className="h-64 w-full animate-pulse bg-secondary/40" />
    </div>
  );
}
