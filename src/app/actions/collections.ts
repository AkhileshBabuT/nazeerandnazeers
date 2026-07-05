"use server";

/**
 * Admin-only Collection write action (PRD 07-01). Create/update a Collection
 * and replace its Product membership in one call. No price column ever
 * (ADR-0007); a Collection is pure merchandising metadata.
 *
 * Like `catalog.ts`, authorization is the JWT admin claim (ADR-0012); RLS is
 * the real boundary. Returns a discriminated `ActionResult` (see admin-guard).
 */

import { updateTag } from "next/cache";
import { collectionInputSchema, type CollectionInput } from "@/lib/validators";
import {
  requireAdmin,
  fieldErrorsOf,
  type ActionResult,
} from "./admin-guard";

/**
 * Create or update a Collection. When `productIds` is provided, the Collection's
 * membership is REPLACED with that list (ordered by array index).
 */
export async function upsertCollection(
  input: CollectionInput & { id?: string; productIds?: string[] },
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }

  const { id, productIds, ...rest } = input;
  const parsed = collectionInputSchema.safeParse(rest);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  // Build the row explicitly — no price column (ADR-0007).
  const row = {
    ...(id ? { id } : {}),
    slug: parsed.data.slug,
    display_name: parsed.data.display_name,
    description: parsed.data.description ?? null,
    hero_image: parsed.data.hero_image ?? null,
    sort_order: parsed.data.sort_order,
    is_active: parsed.data.is_active,
    meta_title: parsed.data.meta_title ?? null,
    meta_description: parsed.data.meta_description ?? null,
  };

  const { data, error } = await auth.supabase
    .from("collections")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }

  // Replace membership when supplied. ponytail: delete-then-insert under admin
  // RLS, not a single transaction — fine at hundreds of items; if membership
  // grows huge or concurrent admin edits matter, move to a SECURITY DEFINER RPC.
  if (productIds) {
    const { error: delErr } = await auth.supabase
      .from("product_collections")
      .delete()
      .eq("collection_id", data.id);
    if (delErr) {
      return { ok: false, code: "error", message: delErr.message };
    }
    if (productIds.length > 0) {
      const { error: insErr } = await auth.supabase
        .from("product_collections")
        .insert(
          productIds.map((pid, i) => ({
            collection_id: data.id,
            product_id: pid,
            sort_order: i,
          })),
        );
      if (insErr) {
        return { ok: false, code: "error", message: insErr.message };
      }
    }
  }

  updateTag("collections");
  return { ok: true, data: { id: data.id } };
}
