"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { shippingMethodSchema } from "@/lib/validators/shipping";
import {
  requireAdmin,
  fieldErrorsOf,
  type ActionResult,
} from "@/app/actions/admin-guard";

export async function createShippingMethod(
  input: unknown,
): Promise<ActionResult<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, code: "unauthorized" };

  const parsed = shippingMethodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const svc = createServiceClient();
  const { error } = await svc.from("shipping_methods").insert({
    name: parsed.data.name,
    description: parsed.data.description,
    base_rate_paise: parsed.data.base_rate_paise,
    per_gram_paise: parsed.data.per_gram_paise,
    free_above_paise: parsed.data.free_above_paise ?? null,
    is_active: parsed.data.is_active,
  });
  if (error) return { ok: false, code: "error", message: error.message };

  revalidatePath("/admin/shipping");
  return { ok: true, data: undefined };
}

export async function updateShippingMethod(
  id: string,
  input: unknown,
): Promise<ActionResult<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, code: "unauthorized" };

  const parsed = shippingMethodSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const svc = createServiceClient();
  const { error } = await svc
    .from("shipping_methods")
    .update({
      name: parsed.data.name,
      description: parsed.data.description,
      base_rate_paise: parsed.data.base_rate_paise,
      per_gram_paise: parsed.data.per_gram_paise,
      free_above_paise: parsed.data.free_above_paise ?? null,
      is_active: parsed.data.is_active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, code: "error", message: error.message };

  revalidatePath("/admin/shipping");
  return { ok: true, data: undefined };
}

export async function deleteShippingMethod(id: string): Promise<ActionResult<void>> {
  const admin = await requireAdmin();
  if (!admin.ok) return { ok: false, code: "unauthorized" };

  const svc = createServiceClient();
  const { error } = await svc.from("shipping_methods").delete().eq("id", id);
  if (error) return { ok: false, code: "error", message: error.message };

  revalidatePath("/admin/shipping");
  return { ok: true, data: undefined };
}
