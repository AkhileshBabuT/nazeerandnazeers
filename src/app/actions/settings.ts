"use server";

import { requireAdmin, fieldErrorsOf, type ActionResult } from "@/app/actions/admin-guard";
import { settingsInputSchema, type SettingsInput } from "@/lib/validators";

/** Update the singleton settings row (admin only). */
export async function updateSettings(
  input: SettingsInput,
): Promise<ActionResult<void>> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, code: "unauthorized" };

  const parsed = settingsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const { error } = await auth.supabase
    .from("settings")
    .update({ ...parsed.data })
    .eq("id", true);
  if (error) return { ok: false, code: "error", message: error.message };
  return { ok: true, data: undefined };
}
