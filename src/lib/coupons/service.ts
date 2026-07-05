import { createServiceClient } from "@/lib/supabase/service";
import type { ResolvedCoupon } from "@/lib/orders/checkout";

/**
 * Load and validate a coupon by code for use in checkout (ADR-0017).
 *
 * Checks: exists, is_active, valid_from, valid_until, min_order_paise.
 * Does NOT check max_uses or per_user_limit — those are enforced atomically
 * in the `reserve_and_create_order` RPC with FOR UPDATE.
 *
 * Returns null on any validation failure (caller returns coupon_invalid).
 */
export async function loadAndValidateCoupon(
  code: string,
  subtotalPaise: number,
): Promise<ResolvedCoupon | null> {
  const svc = createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("coupons")
    .select(
      "id, discount_type, discount_value, min_order_paise, is_active, valid_from, valid_until",
    )
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (error || !data) return null;
  if (!data.is_active) return null;
  if (data.valid_from > now) return null;
  if (data.valid_until && data.valid_until < now) return null;
  if (subtotalPaise < data.min_order_paise) return null;

  return {
    id: data.id,
    discount_type: data.discount_type,
    discount_value: data.discount_value,
    min_order_paise: data.min_order_paise,
  };
}
