"use server";

/**
 * Admin-only Product media write action (PRD 07-02). Replaces a Product's whole
 * gallery in one call. Images carry no price (ADR-0007).
 *
 * Authorization is the JWT admin claim (ADR-0012); RLS is the real boundary.
 */

import { updateTag } from "next/cache";
import { productMediaSchema, type MediaItemInput } from "@/lib/validators";
import {
  requireAdmin,
  fieldErrorsOf,
  type ActionResult,
} from "./admin-guard";

/** Replace a Product's media gallery with `items` (already normalized/ordered). */
export async function setProductMedia(
  productId: string,
  items: MediaItemInput[],
): Promise<ActionResult<{ count: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }

  const parsed = productMediaSchema.safeParse(items);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  // Replace-style. ponytail: delete-then-insert under admin RLS, not a single
  // transaction — fine at gallery scale (a handful of images per piece).
  const { error: delErr } = await auth.supabase
    .from("product_media")
    .delete()
    .eq("product_id", productId);
  if (delErr) {
    return { ok: false, code: "error", message: delErr.message };
  }
  if (parsed.data.length > 0) {
    const { error: insErr } = await auth.supabase.from("product_media").insert(
      parsed.data.map((it) => ({
        product_id: productId,
        url: it.url,
        alt_text: it.alt_text ?? null,
        is_primary: it.is_primary,
        sort_order: it.sort_order,
      })),
    );
    if (insErr) {
      return { ok: false, code: "error", message: insErr.message };
    }
  }

  updateTag("products");
  updateTag(`product-${productId}`);
  return { ok: true, data: { count: parsed.data.length } };
}
