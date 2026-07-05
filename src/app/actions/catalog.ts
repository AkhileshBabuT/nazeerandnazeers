"use server";

/**
 * Admin-only catalog write actions (PRD 02).
 *
 *  - `upsertProduct` — create or update a Product (pricing INPUTS only; no price
 *    column ever, ADR-0007), validated with Zod.
 *  - `postMetalRate` — APPEND a new `metal_rates` row (ADR-0008: never update in
 *    place; latest `effective_at` wins). Validated with Zod.
 *
 * Authorization is the JWT admin claim from Foundation (ADR-0012): we read
 * `app_metadata.user_role` from the verified token and reject non-admins before
 * touching the DB. RLS (`admin writes products` / `admin appends metal rates`)
 * is the real enforcement boundary — this check just turns an opaque RLS denial
 * into a clean typed result. Server Functions are reachable by direct POST, so
 * every one verifies authorization itself (per the Next.js mutating-data guide).
 *
 * Each action returns a discriminated `ActionResult` rather than throwing for
 * expected failures (unauthorized, validation), so a caller (admin UI, PRD 05)
 * can render field errors. Unexpected DB errors surface as `error`.
 */

import { z } from "zod";
import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  productInputSchema,
  metalRateInputSchema,
  type ProductInput,
  type MetalRateInput,
} from "@/lib/validators";

/** Discriminated result so callers handle each failure mode explicitly. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "unauthorized" }
  | { ok: false; code: "invalid"; fieldErrors: Record<string, string[]> }
  | { ok: false; code: "error"; message: string };

/**
 * Resolve the caller's admin status from the verified JWT claims (ADR-0012).
 * Returns the Supabase client too so the action reuses the same session.
 */
async function requireAdmin(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) {
    return { ok: false };
  }
  const role = (data.claims.app_metadata as { user_role?: string } | undefined)
    ?.user_role;
  if (role !== "admin") {
    return { ok: false };
  }
  return { ok: true, supabase };
}

/** Map a Zod error to a flat `{ path: messages[] }` for form display. */
function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/**
 * Create or update a Product. When `id` is supplied the row is updated; without
 * it a new Product is inserted. Validates the pricing inputs with Zod (the
 * gold-requires-purity/hallmark rules mirror the DB CHECK constraints).
 */
export async function upsertProduct(
  input: ProductInput & { id?: string },
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }

  const { id, ...rest } = input;
  const parsed = productInputSchema.safeParse(rest);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  // Build the row explicitly — never a price column (ADR-0007).
  const row = {
    ...(id ? { id } : {}),
    sku: parsed.data.sku,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    material: parsed.data.material,
    category_id: parsed.data.category_id,
    audience_id: parsed.data.audience_id,
    weight_grams: Number(parsed.data.weight_grams),
    purity_karat: parsed.data.purity_karat ?? null,
    making_charge_type: parsed.data.making_charge_type,
    making_charge_value: parsed.data.making_charge_value,
    hallmark_huid: parsed.data.hallmark_huid ?? null,
    stock_quantity: parsed.data.stock_quantity,
    is_active: parsed.data.is_active,
  };

  const { data, error } = await auth.supabase
    .from("products")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();

  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  // Revalidate cached product shells (read-your-own-writes, so `updateTag`):
  // the list tag plus the per-product tag used by `getProduct`.
  updateTag("products");
  updateTag(`product-${data.id}`);
  return { ok: true, data: { id: data.id } };
}

/**
 * Append a new Metal Rate row (ADR-0008). This is strictly an INSERT — there is
 * no update path; a rate change is always a new row, and the latest
 * `effective_at` becomes authoritative. The RLS policy only grants INSERT on
 * `metal_rates` to admins, never UPDATE/DELETE.
 */
export async function postMetalRate(
  input: MetalRateInput,
): Promise<ActionResult<{ id: string; effective_at: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }

  const parsed = metalRateInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  const { data, error } = await auth.supabase
    .from("metal_rates")
    .insert({
      material: parsed.data.material,
      rate_per_gram_paise: parsed.data.rate_per_gram_paise,
      source: parsed.data.source ?? null,
      // Omit effective_at to let the DB default to now(); honor an explicit one.
      ...(parsed.data.effective_at
        ? { effective_at: parsed.data.effective_at }
        : {}),
    })
    .select("id, effective_at")
    .single();

  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return {
    ok: true,
    data: { id: data.id, effective_at: data.effective_at },
  };
}
