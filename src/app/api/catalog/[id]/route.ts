import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { toCatalogDetail } from "@/lib/catalog";

/**
 * GET /api/catalog/[id] — a Product detail view.
 *
 * Returns the Product with its physical attributes (weight, purity karat,
 * hallmark/HUID), a live price breakdown (metal value / making charge / GST,
 * computed at request time from the current Metal Rate), and stock availability.
 *
 * RLS exposes only active Products to the public, so an inactive or unknown id
 * reads as "not found" (404). When the rate is missing or stale (ADR-0010), the
 * Product is returned with `pricing.status` `"price_unavailable"` rather than a
 * wrong price — the detail view still renders, just unpurchasable.
 */
export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    return Response.json(
      { error: "Failed to load product." },
      { status: 500 },
    );
  }

  if (data === null) {
    return Response.json({ error: "Product not found." }, { status: 404 });
  }

  const product = await toCatalogDetail(data);
  return Response.json({ product });
}
