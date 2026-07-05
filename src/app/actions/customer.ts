"use server";

import { z } from "zod";
import { requireUser, fieldErrorsOf, type ActionResult } from "@/app/actions/admin-guard";

const profileInputSchema = z.object({
  full_name: z.string().max(200).optional(),
  phone: z.string().max(20).optional(),
});

export type ProfileInput = z.infer<typeof profileInputSchema>;

/** Update the signed-in customer's profile (name + phone). RLS owns the row. */
export async function updateCustomerProfile(
  input: ProfileInput,
): Promise<ActionResult<void>> {
  const auth = await requireUser();
  if (!auth.ok) return { ok: false, code: "unauthorized" };

  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const { error } = await auth.supabase
    .from("customers")
    .upsert({
      user_id: auth.userId,
      full_name: parsed.data.full_name ?? null,
      phone: parsed.data.phone ?? null,
    });
  if (error) return { ok: false, code: "error", message: error.message };
  return { ok: true, data: undefined };
}
