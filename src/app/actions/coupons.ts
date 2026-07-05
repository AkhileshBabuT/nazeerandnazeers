"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { couponSchema } from "@/lib/validators/coupons";
import {
  requireAdmin,
  requireUser,
  fieldErrorsOf,
  type ActionResult,
} from "@/app/actions/admin-guard";
import type { ResolvedCoupon } from "@/lib/orders/checkout";
import { computeDiscount } from "@/lib/coupons/compute";

export async function createCoupon(input: unknown): Promise<ActionResult<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, code: "unauthorized" };

  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const svc = createServiceClient();
  const { error } = await svc.from("coupons").insert({
    code: parsed.data.code,
    discount_type: parsed.data.discount_type,
    discount_value: parsed.data.discount_value,
    min_order_paise: parsed.data.min_order_paise,
    max_uses: parsed.data.max_uses ?? null,
    per_user_limit: parsed.data.per_user_limit,
    is_active: parsed.data.is_active,
    valid_from: parsed.data.valid_from ?? new Date().toISOString(),
    valid_until: parsed.data.valid_until ?? null,
  });
  if (error) return { ok: false, code: "error", message: error.message };

  revalidatePath("/admin/coupons");
  return { ok: true, data: undefined };
}

export async function updateCoupon(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, code: "unauthorized" };

  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("coupons")
    .update({
      code: parsed.data.code,
      discount_type: parsed.data.discount_type,
      discount_value: parsed.data.discount_value,
      min_order_paise: parsed.data.min_order_paise,
      max_uses: parsed.data.max_uses ?? null,
      per_user_limit: parsed.data.per_user_limit,
      is_active: parsed.data.is_active,
      valid_from: parsed.data.valid_from ?? new Date().toISOString(),
      valid_until: parsed.data.valid_until ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, code: "error", message: error.message };

  revalidatePath("/admin/coupons");
  return { ok: true, data: undefined };
}

export async function deleteCoupon(id: string): Promise<ActionResult<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, code: "unauthorized" };

  const svc = createServiceClient();
  const { error } = await svc.from("coupons").delete().eq("id", id);
  if (error) return { ok: false, code: "error", message: error.message };

  revalidatePath("/admin/coupons");
  return { ok: true, data: undefined };
}

/**
 * Customer-facing coupon verification. Returns the resolved coupon so the
 * checkout UI can display the discount before the customer places the order.
 * The RPC re-validates atomically with FOR UPDATE on order creation (ADR-0017).
 */
export async function verifyCoupon(
  code: string,
  subtotalPaise: number,
): Promise<
  | { ok: true; coupon: ResolvedCoupon; discount_paise: number }
  | { ok: false; error: "not_found" | "inactive" | "expired" | "min_order" | "per_user_limit" }
> {
  const user = await requireUser();
  if (!user.ok) return { ok: false, error: "not_found" };

  const svc = createServiceClient();
  const now = new Date().toISOString();

  const { data, error } = await svc
    .from("coupons")
    .select("id, discount_type, discount_value, min_order_paise, max_uses, per_user_limit, is_active, valid_from, valid_until")
    .eq("code", code.toUpperCase().trim())
    .maybeSingle();

  if (error || !data) return { ok: false, error: "not_found" };
  if (!data.is_active) return { ok: false, error: "inactive" };
  if (data.valid_from > now) return { ok: false, error: "expired" };
  if (data.valid_until && data.valid_until < now) return { ok: false, error: "expired" };
  if (subtotalPaise < data.min_order_paise) return { ok: false, error: "min_order" };

  // Check per-user limit (non-atomic — the RPC enforces atomically, this is for UX only).
  const { count } = await svc
    .from("coupon_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", data.id)
    .eq("user_id", user.userId);
  if ((count ?? 0) >= data.per_user_limit) return { ok: false, error: "per_user_limit" };

  const coupon: ResolvedCoupon = {
    id: data.id,
    discount_type: data.discount_type,
    discount_value: data.discount_value,
    min_order_paise: data.min_order_paise,
  };

  return {
    ok: true,
    coupon,
    discount_paise: computeDiscount(coupon, subtotalPaise),
  };
}
