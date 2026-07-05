import { createServiceClient } from "@/lib/supabase/service";
import { createClient } from "@/lib/supabase/server";
import type { ShippingMethodRates } from "./compute";

export interface ShippingMethodRow extends ShippingMethodRates {
  id: string;
  name: string;
  description: string;
  is_active: boolean;
}

/** Load an active shipping method by id (service-role). Returns null if not found or inactive. */
export async function loadShippingMethod(id: string): Promise<ShippingMethodRow | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("shipping_methods")
    .select("id, name, description, base_rate_paise, per_gram_paise, free_above_paise, is_active")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data as ShippingMethodRow | null;
}

/** Load all active shipping methods ordered by created_at (for checkout display). */
export async function loadActiveShippingMethods(): Promise<ShippingMethodRow[]> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("shipping_methods")
    .select("id, name, description, base_rate_paise, per_gram_paise, free_above_paise, is_active")
    .eq("is_active", true)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ShippingMethodRow[];
}

/**
 * Load total cart weight in grams for the signed-in user's active cart.
 * Sums (product or variant weight_grams) × quantity across all cart items.
 * Used by the checkout page to pre-compute per-method shipping costs.
 */
export async function loadCartTotalWeightGrams(): Promise<number> {
  const supabase = await createClient();
  const { data: cart, error } = await supabase
    .from("carts")
    .select(
      "cart_items(quantity, product_id, variant_id, products(weight_grams), product_variant(weight_grams))",
    )
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!cart) return 0;

  let total = 0;
  for (const item of cart.cart_items) {
    const weight =
      item.variant_id != null && item.product_variant
        ? Number(item.product_variant.weight_grams)
        : Number(item.products?.weight_grams ?? 0);
    total += weight * item.quantity;
  }
  return total;
}
