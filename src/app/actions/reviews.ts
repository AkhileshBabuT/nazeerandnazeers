"use server";

/**
 * Product review actions (PRD 08). Customers write/edit/delete their own review
 * (always reset to pending — `is_approved = false`, RLS forbids self-approval);
 * admins moderate. No price (ADR-0007).
 */

import { updateTag } from "next/cache";
import { reviewInputSchema, type ReviewInput } from "@/lib/validators";
import {
  requireUser,
  requireAdmin,
  fieldErrorsOf,
  type ActionResult,
} from "./admin-guard";

/** Create or update the caller's review for a product (resets it to pending). */
export async function upsertReview(
  productId: string,
  input: ReviewInput,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  const parsed = reviewInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const { data, error } = await auth.supabase
    .from("reviews")
    .upsert(
      {
        user_id: auth.userId,
        product_id: productId,
        rating: parsed.data.rating,
        title: parsed.data.title ?? null,
        body: parsed.data.body ?? null,
        is_approved: false, // moderation gate — RLS forbids self-approval anyway
        updated_at: new Date().toISOString(),
      },
      { onConflict: "product_id,user_id" },
    )
    .select("id")
    .single();
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: { id: data.id } };
}

/** Delete the caller's review for a product. */
export async function deleteReview(
  productId: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  const { error } = await auth.supabase
    .from("reviews")
    .delete()
    .eq("user_id", auth.userId)
    .eq("product_id", productId);
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: { id: productId } };
}

/** The caller's own review (any approval state), for prefilling the form. */
export async function getMyReview(productId: string): Promise<{
  rating: number;
  title: string | null;
  body: string | null;
  is_approved: boolean;
} | null> {
  const auth = await requireUser();
  if (!auth.ok) {
    return null;
  }
  const { data } = await auth.supabase
    .from("reviews")
    .select("rating, title, body, is_approved")
    .eq("user_id", auth.userId)
    .eq("product_id", productId)
    .maybeSingle();
  return data ?? null;
}

/** Admin moderation — approve or unapprove a review. */
export async function setReviewApproved(
  reviewId: string,
  approved: boolean,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  const { data, error } = await auth.supabase
    .from("reviews")
    .update({ is_approved: approved })
    .eq("id", reviewId)
    .select("id")
    .single();
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  updateTag("reviews");
  return { ok: true, data: { id: data.id } };
}
