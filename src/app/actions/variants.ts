"use server";
import { z } from "zod";
import { requireAdmin, fieldErrorsOf, type ActionResult } from "./admin-guard";
import { createServiceClient } from "@/lib/supabase/service";
import type { Database } from "@/lib/supabase/database.types";

type VariantRow = Database["public"]["Tables"]["product_variant"]["Row"];

const variantSchema = z.object({
  product_id: z.string().uuid(),
  sku: z.string().min(1),
  purity_karat: z.number().int().min(1).max(24).nullable(),
  size_label: z.string().nullable(),
  metal_tone: z.enum(["yellow", "white", "rose"]).nullable(),
  weight_grams: z.string().regex(/^\d+(\.\d{1,3})?$/, "must be a decimal number"),
  making_charge_type: z.enum(["flat", "percent"]),
  making_charge_value: z.number().int().min(0),
  stock_quantity: z.number().int().min(0),
  hallmark_huid: z.string().nullable(),
  is_active: z.boolean().default(true),
});

export async function upsertVariant(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, code: "unauthorized" };
  const parsed = variantSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("product_variant")
    .upsert(
      { ...parsed.data, weight_grams: parseFloat(parsed.data.weight_grams) },
      { onConflict: "sku" },
    )
    .select("id")
    .single();
  if (error) return { ok: false, code: "error", message: error.message };
  return { ok: true, data: { id: data.id } };
}

export async function deleteVariant(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, code: "unauthorized" };
  if (!z.string().uuid().safeParse(id).success)
    return { ok: false, code: "invalid", fieldErrors: { id: ["must be a UUID"] } };
  const svc = createServiceClient();
  const { error } = await svc.from("product_variant").delete().eq("id", id);
  if (error) return { ok: false, code: "error", message: error.message };
  return { ok: true, data: { id } };
}

export async function getVariantsForProduct(
  productId: string,
): Promise<ActionResult<{ variants: VariantRow[] }>> {
  const guard = await requireAdmin();
  if (!guard.ok) return { ok: false, code: "unauthorized" };
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("product_variant")
    .select("*")
    .eq("product_id", productId)
    .order("purity_karat", { ascending: true });
  if (error) return { ok: false, code: "error", message: error.message };
  return { ok: true, data: { variants: data ?? [] } };
}
