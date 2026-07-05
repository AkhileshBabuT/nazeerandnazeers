"use server";

/**
 * Customer address-book actions (PRD 08). Owner-scoped: every write is keyed to
 * the signed-in user and RLS (`auth.uid() = user_id`) is the real boundary. No
 * price (ADR-0007). At most one default address per user (DB partial unique
 * index + the clear-then-set below).
 */

import { addressInputSchema, type AddressInput } from "@/lib/validators";
import {
  requireUser,
  fieldErrorsOf,
  type ActionResult,
} from "./admin-guard";

/** Create or update one of the caller's addresses. */
export async function upsertAddress(
  input: AddressInput & { id?: string },
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }

  const { id, ...rest } = input;
  const parsed = addressInputSchema.safeParse(rest);
  if (!parsed.success) {
    return {
      ok: false,
      code: "invalid",
      fieldErrors: fieldErrorsOf(parsed.error),
    };
  }

  // One default per user — clear any existing default before setting a new one.
  if (parsed.data.is_default) {
    await auth.supabase
      .from("addresses")
      .update({ is_default: false })
      .eq("user_id", auth.userId)
      .eq("is_default", true);
  }

  const row = {
    ...(id ? { id } : {}),
    user_id: auth.userId,
    full_name: parsed.data.full_name,
    phone: parsed.data.phone,
    line1: parsed.data.line1,
    line2: parsed.data.line2 ?? null,
    city: parsed.data.city,
    state: parsed.data.state,
    postal_code: parsed.data.postal_code,
    country: parsed.data.country,
    is_default: parsed.data.is_default,
  };

  const { data, error } = await auth.supabase
    .from("addresses")
    .upsert(row, { onConflict: "id" })
    .select("id")
    .single();
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: { id: data.id } };
}

/** Delete one of the caller's addresses. */
export async function deleteAddress(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  const { error } = await auth.supabase
    .from("addresses")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: { id } };
}

/** Make one of the caller's addresses the default (clearing any prior default). */
export async function setDefaultAddress(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const auth = await requireUser();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  await auth.supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", auth.userId)
    .eq("is_default", true);
  const { error } = await auth.supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", id)
    .eq("user_id", auth.userId);
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: { id } };
}
