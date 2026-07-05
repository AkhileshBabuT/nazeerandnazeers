"use server";

/**
 * Checkout Server Action (PRD 04) — `createOrderFromCart`.
 *
 * Turns the caller's Cart into an immutable Order: re-confirms the live total
 * against what the client last saw (ADR-0002), atomically reserves stock (the
 * oversell guard, ADR-0001), snapshots rates/prices/GST/shipping (ADR-0003/0005),
 * and issues a Stripe PaymentIntent in INR. The decision logic lives in the pure
 * `runCheckout` core (src/lib/orders/checkout.ts); this wrapper only wires the
 * production seams and verifies the caller's identity.
 *
 * Server Functions are reachable by direct POST, so this establishes the
 * caller's identity itself (per the Next.js mutating-data guide). The Cart is
 * read under the caller's OWN RLS-scoped session; the Order/reservation writes
 * run under service-role via the SECURITY DEFINER RPCs (orders are not
 * customer-writable — Foundation's RLS). Expected failures return a
 * discriminated `ActionResult`; unexpected errors surface as `error`.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { messageOf } from "@/lib/utils";
import { checkoutSchema, type CheckoutInput } from "@/lib/validators";
import { getCurrentRate } from "@/lib/rates";
import { runCheckout, type CheckoutResult } from "@/lib/orders/checkout";
import {
  loadCheckoutCartLines,
  getGstSettings,
  reserveAndCreateOrder,
  attachPaymentIntent,
} from "@/lib/orders/service";
import { createOrderPaymentIntent } from "@/lib/orders/stripe-payments";
import { loadShippingMethod } from "@/lib/shipping/service";
import { loadAndValidateCoupon } from "@/lib/coupons/service";

/** Discriminated result so callers handle each checkout outcome explicitly. */
export type CheckoutActionResult =
  | {
      ok: true;
      order_id: string;
      order_number: string;
      total_paise: number;
      client_secret: string | null;
    }
  | { ok: false; code: "invalid"; fieldErrors: Record<string, string[]> }
  | { ok: false; code: "unauthenticated" }
  | { ok: false; code: "empty_cart" }
  | { ok: false; code: "price_unavailable"; material: "gold" | "silver" }
  | {
      ok: false;
      code: "reconfirm";
      message: string;
      seen_total_paise: number;
      true_total_paise: number;
      tolerance_paise: number;
    }
  | { ok: false; code: "out_of_stock" }
  | { ok: false; code: "invalid_shipping_method" }
  | { ok: false; code: "invalid_coupon" }
  | { ok: false; code: "coupon_exhausted" }
  | { ok: false; code: "error"; message: string };

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
 * Create an Order from the caller's Cart. The seen total (ADR-0002) and shipping
 * address are validated, then the pure core runs the reserve/snapshot/pay flow.
 */
export async function createOrderFromCart(
  input: CheckoutInput,
): Promise<CheckoutActionResult> {
  const parsed = checkoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  // Anonymous sessions are not allowed to place orders.
  const user = userData.user;
  if (!user || user.is_anonymous) return { ok: false, code: "unauthenticated" };
  const userId = user.id;

  let result: CheckoutResult;
  try {
    result = await runCheckout(parsed.data, {
      userId,
      loadCartLines: () => loadCheckoutCartLines(supabase),
      loadSettings: getGstSettings,
      resolveRate: getCurrentRate,
      loadShippingMethod,
      resolveCoupon: loadAndValidateCoupon,
      reserveAndCreate: reserveAndCreateOrder,
      createPaymentIntent: createOrderPaymentIntent,
      attachPaymentIntent,
      now: () => Date.now(),
    });
  } catch (err) {
    return { ok: false, code: "error", message: messageOf(err) };
  }

  return toActionResult(result);
}

/** Translate the core result into the action's discriminated result. */
function toActionResult(result: CheckoutResult): CheckoutActionResult {
  if (result.ok) {
    return {
      ok: true,
      order_id: result.order_id,
      order_number: result.order_number,
      total_paise: result.total_paise,
      client_secret: result.client_secret,
    };
  }
  switch (result.code) {
    case "unauthenticated":
      return { ok: false, code: "unauthenticated" };
    case "empty_cart":
      return { ok: false, code: "empty_cart" };
    case "price_unavailable":
      return { ok: false, code: "price_unavailable", material: result.material };
    case "reconfirm":
      return {
        ok: false,
        code: "reconfirm",
        message:
          "The gold rate updated; please review your new total before paying.",
        seen_total_paise: result.seen_total_paise,
        true_total_paise: result.true_total_paise,
        tolerance_paise: result.tolerance_paise,
      };
    case "out_of_stock":
      return { ok: false, code: "out_of_stock" };
    case "invalid_shipping_method":
      return { ok: false, code: "invalid_shipping_method" };
    case "invalid_coupon":
      return { ok: false, code: "invalid_coupon" };
    case "coupon_exhausted":
      return { ok: false, code: "coupon_exhausted" };
  }
}

