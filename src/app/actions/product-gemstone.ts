"use server";

/**
 * Admin-only Product gemstone write action (PRD 07-07). Replaces a Product's
 * gemstone rows in one call. No price (ADR-0007). `carat_weight` is stone carat,
 * not metal purity. Authorization is the JWT admin claim (ADR-0012).
 */

import { updateTag } from "next/cache";
import {
  productGemstonesSchema,
  type GemstoneItemInput,
} from "@/lib/validators";
import {
  requireAdmin,
  fieldErrorsOf,
  type ActionResult,
} from "./admin-guard";

/** Replace a Product's gemstone rows with `items`. */
export async function setProductGemstones(
  productId: string,
  items: GemstoneItemInput[],
): Promise<ActionResult<{ count: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }

  const parsed = productGemstonesSchema.safeParse(items);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  // Replace-style. ponytail: delete-then-insert under admin RLS, not a single
  // transaction — fine at a few stones per piece.
  const { error: delErr } = await auth.supabase
    .from("product_gemstone")
    .delete()
    .eq("product_id", productId);
  if (delErr) {
    return { ok: false, code: "error", message: delErr.message };
  }
  if (parsed.data.length > 0) {
    const { error: insErr } = await auth.supabase
      .from("product_gemstone")
      .insert(
        parsed.data.map((it) => ({
          product_id: productId,
          gem_type: it.gem_type,
          carat_weight: it.carat_weight ?? null,
          cut: it.cut ?? null,
          color: it.color ?? null,
          clarity: it.clarity ?? null,
          lab: it.lab ?? null,
          certificate_number: it.certificate_number ?? null,
          laser_inscription: it.laser_inscription ?? null,
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
