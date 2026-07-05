"use server";

/**
 * Customer wishlist actions (PRD 08). Owner-scoped (RLS keys on
 * `auth.uid() = user_id`). No price (ADR-0007). `toggleWishlist` adds the piece
 * if absent and removes it if present; `isWishlisted` reads the current state
 * for the heart's initial render.
 */

import { requireUser, type ActionResult } from "./admin-guard";

/** Add the piece to the caller's wishlist if absent, remove it if present. */
export async function toggleWishlist(
  productId: string,
): Promise<ActionResult<{ wishlisted: boolean }>> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }

  const { data: existing } = await auth.supabase
    .from("wishlists")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    const { error } = await auth.supabase
      .from("wishlists")
      .delete()
      .eq("id", existing.id);
    if (error) {
      return { ok: false, code: "error", message: error.message };
    }
    return { ok: true, data: { wishlisted: false } };
  }

  const { error } = await auth.supabase
    .from("wishlists")
    .insert({ user_id: auth.userId, product_id: productId });
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: { wishlisted: true } };
}

/** Whether the caller has the piece saved. False for signed-out visitors. */
export async function isWishlisted(productId: string): Promise<boolean> {
  const auth = await requireUser();
  if (!auth.ok) {
    return false;
  }
  const { data } = await auth.supabase
    .from("wishlists")
    .select("id")
    .eq("user_id", auth.userId)
    .eq("product_id", productId)
    .maybeSingle();
  return data !== null;
}
