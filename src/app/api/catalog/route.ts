import { createClient } from "@/lib/supabase/server";
import { toCatalog } from "@/lib/catalog";

/**
 * GET /api/catalog — the catalog list.
 *
 * Reads active Products via the public (anon-readable) Supabase client — RLS
 * exposes only `is_active` rows to the public (ADR-0014 model), so guests browse
 * without signing in. Each Product is returned with a price computed at request
 * time from the live Metal Rate (ADR-0002/0007) and a stock availability flag.
 *
 * When the rate is missing or stale (ADR-0010), the Product still appears but
 * its `pricing.status` is `"price_unavailable"` — never a wrong number.
 *
 * Not cached: prices are request-time and the rate may move (the 5-minute rate
 * cache in `lib/rates.ts` already absorbs the DB load, ADR-0010). Route Handlers
 * are uncached by default in this Next.js version, which is what we want.
 */
export async function GET(): Promise<Response> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json(
      { error: "Failed to load catalog." },
      { status: 500 },
    );
  }

  const products = await toCatalog(data ?? []);
  return Response.json({ products });
}
