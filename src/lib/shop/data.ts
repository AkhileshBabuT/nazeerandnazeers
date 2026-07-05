import { cacheLife, cacheTag } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import type { ProductRow } from "@/lib/catalog";
import type { Material } from "@/lib/pricing";
import type { Database } from "@/lib/supabase/database.types";

/** A Collection row (PRD 07-01). */
export type CollectionRow = Database["public"]["Tables"]["collections"]["Row"];

/** A Product media (gallery image) row (PRD 07-02). */
export type ProductMediaRow =
  Database["public"]["Tables"]["product_media"]["Row"];

/** A Product gemstone / certificate row (PRD 07-07). */
export type ProductGemstoneRow =
  Database["public"]["Tables"]["product_gemstone"]["Row"];

/** A product review row (PRD 08). */
export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

/**
 * Storefront data reads (PRD 06 §1.4 cache split).
 *
 * Product SHELLS are cached (`use cache` + tags); `upsertProduct` calls
 * `updateTag("products")` to revalidate. Anything money/stock/session-shaped
 * stays OUT of this cache and streams uncached inside <Suspense>.
 */

/** All active products, newest first, optionally filtered by browse facets.
 * Cached shell read — the cache key varies by every filter. */
export async function listActiveProducts(opts?: {
  material?: Material;
  categoryId?: string;
  audienceId?: string;
}): Promise<ProductRow[]> {
  "use cache";
  cacheTag("products");
  cacheLife("hours");
  const supabase = createPublicClient();
  let query = supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });
  if (opts?.material !== undefined) {
    query = query.eq("material", opts.material);
  }
  if (opts?.categoryId !== undefined) {
    query = query.eq("category_id", opts.categoryId);
  }
  if (opts?.audienceId !== undefined) {
    query = query.eq("audience_id", opts.audienceId);
  }
  const { data, error } = await query;
  if (error) {
    throw error;
  }
  return data;
}

/** One active product by id, or null. Cached shell read. */
export async function getProduct(id: string): Promise<ProductRow | null> {
  "use cache";
  cacheTag("products", `product-${id}`);
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    // Malformed UUIDs raise a Postgres cast error — treat as not found.
    return null;
  }
  return data;
}

/** GST basis points for receipt display rows. Uncached — read alongside the live price slot. */
export { getGstSettings } from "@/lib/orders/service";

/** Live stock for one product — availability must never come from the cached
 * shell (orders change stock without revalidating the products tag). */
export async function getLiveStock(productId: string): Promise<number | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select("stock_quantity")
    .eq("id", productId)
    .maybeSingle();
  return data?.stock_quantity ?? null;
}

/** Live stock for many products in one read. */
export async function getLiveStocks(
  productIds: readonly string[],
): Promise<Map<string, number>> {
  if (productIds.length === 0) {
    return new Map();
  }
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("products")
    .select("id, stock_quantity")
    .in("id", [...productIds]);
  return new Map((data ?? []).map((r) => [r.id, r.stock_quantity]));
}

/** A category/audience option for the admin classification selects. */
export type FacetOption = { id: string; slug: string; display_name: string };

/** All categories, ordered. Cached — static reference data (no admin CRUD yet;
 * wire `updateTag("facets")` here if that changes). */
export async function getCategories(): Promise<FacetOption[]> {
  "use cache";
  cacheTag("facets");
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("categories")
    .select("id, slug, display_name")
    .order("sort_order", { ascending: true });
  if (error) {
    throw error;
  }
  return data;
}

/** All audiences, ordered. Cached — static reference data (see getCategories). */
export async function getAudiences(): Promise<FacetOption[]> {
  "use cache";
  cacheTag("facets");
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("audiences")
    .select("id, slug, display_name")
    .order("display_name", { ascending: true });
  if (error) {
    throw error;
  }
  return data;
}

/** All active collections, ordered. Cached shell read (PRD 07-01). */
export async function listCollections(): Promise<CollectionRow[]> {
  "use cache";
  cacheTag("collections");
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("collections")
    .select("*")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) {
    throw error;
  }
  return data;
}

/**
 * One active Collection by slug + its active Products in membership order, or
 * null. Cached shell read; tagged on both `collections` and `products` so an
 * edit to either revalidates it. Anon RLS already hides inactive products in
 * the embed — the is_active filter is belt-and-suspenders.
 */
export async function getCollectionWithProducts(
  slug: string,
): Promise<{ collection: CollectionRow; products: ProductRow[] } | null> {
  "use cache";
  cacheTag("collections", "products");
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data: collection, error } = await supabase
    .from("collections")
    .select("*")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();
  if (error || collection === null) {
    return null;
  }
  const { data: members } = await supabase
    .from("product_collections")
    .select("sort_order, products(*)")
    .eq("collection_id", collection.id)
    .order("sort_order", { ascending: true });
  const products = (members ?? [])
    .map((m) => m.products)
    .filter((p): p is ProductRow => p !== null && p.is_active);
  return { collection, products };
}

/** A Product's gallery, primary first then sort_order. Cached shell read (07-02). */
export async function getProductMedia(
  productId: string,
): Promise<ProductMediaRow[]> {
  "use cache";
  cacheTag("products", `product-${productId}`);
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("product_media")
    .select("*")
    .eq("product_id", productId)
    .order("is_primary", { ascending: false })
    .order("sort_order", { ascending: true });
  if (error) {
    throw error;
  }
  return data;
}

/** A Product's gemstone / certificate rows (empty when none). Cached (07-07). */
export async function getProductGemstones(
  productId: string,
): Promise<ProductGemstoneRow[]> {
  "use cache";
  cacheTag("products", `product-${productId}`);
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("product_gemstone")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return data;
}

/** A Product's APPROVED reviews, newest first. Cached shell read (PRD 08).
 * Anon RLS already hides unapproved reviews; the explicit filter is belt-and-
 * suspenders. Revalidated on moderation via `updateTag("reviews")`. */
export async function getProductReviews(
  productId: string,
): Promise<ReviewRow[]> {
  "use cache";
  cacheTag(`product-${productId}`, "reviews");
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("*")
    .eq("product_id", productId)
    .eq("is_approved", true)
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  return data;
}

/** A Product's active variants, ordered by purity_karat then sku. Cached shell
 * read — variants change rarely; revalidated alongside products. */
export async function getProductVariants(
  productId: string,
): Promise<Database["public"]["Tables"]["product_variant"]["Row"][]> {
  "use cache";
  cacheTag("products", `product-${productId}`);
  cacheLife("hours");
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from("product_variant")
    .select("*")
    .eq("product_id", productId)
    .eq("is_active", true)
    .order("purity_karat", { ascending: true })
    .order("sku", { ascending: true });
  if (error) {
    throw error;
  }
  return data;
}

/** Latest rate row for a material (for "as of HH:MM" displays). Uncached. */
export async function getLatestRateRow(
  material: Material,
): Promise<{ rate_per_gram_paise: number; effective_at: string } | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from("metal_rates")
    .select("rate_per_gram_paise, effective_at")
    .eq("material", material)
    .order("effective_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}
