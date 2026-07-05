"use server";

/**
 * Cart Server Actions (PRD 03) — the thin transport over the Cart store
 * (`lib/cart/store.ts`). Each action validates its input (Zod) and delegates;
 * every rule — stock clamp, guest identity (ADR-0014), ensure-or-create Cart,
 * live pricing (ADR-0002/0010), Cart Merge — lives in the store.
 *
 * Server Functions are reachable by direct POST, so each one establishes the
 * caller's identity itself (per the Next.js mutating-data guide) by handing the
 * store the caller's RLS-scoped client. Expected failures return a
 * discriminated `ActionResult`; unexpected DB errors surface as `error`.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  addToCartSchema,
  updateCartItemQuantitySchema,
  removeCartItemSchema,
  type AddToCartInput,
  type UpdateCartItemQuantityInput,
  type RemoveCartItemInput,
} from "@/lib/validators";
import {
  addLine,
  setLineQuantity,
  removeLine,
  viewCart,
  mergeCarts,
  type CartStoreResult,
  type CartLineResult,
} from "@/lib/cart/store";
import type { CartView } from "@/lib/cart/view";

/** Discriminated result so callers handle each failure mode explicitly. */
export type ActionResult<T> =
  | CartStoreResult<T>
  | { ok: false; code: "invalid"; fieldErrors: Record<string, string[]> };

/** Map a Zod error to a flat `{ path: messages[] }` for form display. */
function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Add a Product to the Cart (or raise an existing line), clamped to stock. */
export async function addToCart(
  input: AddToCartInput,
): Promise<ActionResult<CartLineResult>> {
  const parsed = addToCartSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  return addLine(await createClient(), parsed.data);
}

/** Set a Cart line's quantity (absolute), clamped to stock. */
export async function updateCartItemQuantity(
  input: UpdateCartItemQuantityInput,
): Promise<ActionResult<CartLineResult>> {
  const parsed = updateCartItemQuantitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  return setLineQuantity(await createClient(), parsed.data);
}

/** Remove a Cart line. RLS ensures only the owner can delete it. */
export async function removeCartItem(
  input: RemoveCartItemInput,
): Promise<ActionResult<{ cart_item_id: string }>> {
  const parsed = removeCartItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }
  return removeLine(await createClient(), parsed.data);
}

/** Read the caller's Cart with live line totals (ADR-0002). */
export async function getCart(): Promise<ActionResult<CartView>> {
  return viewCart(await createClient());
}

/** Cart Merge (ADR-0014) at the sign-up/login boundary. */
export async function mergeGuestCart(
  guestUserId: string,
): Promise<ActionResult<{ cart_id: string | null }>> {
  if (!z.string().uuid().safeParse(guestUserId).success) {
    return {
      ok: false,
      code: "invalid",
      fieldErrors: { guestUserId: ["must be a UUID"] },
    };
  }
  return mergeCarts(await createClient(), guestUserId);
}
