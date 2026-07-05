"use server";

/**
 * Thin Order read actions (PRD 04 §1.6) — `getPaymentSession` + `getOrderStatus`.
 *
 * Both read the Order under the caller's OWN RLS-scoped session (a foreign or
 * unknown id reads as zero rows → `not_found`), so direct POSTs learn nothing
 * about other customers' Orders. `getPaymentSession` re-retrieves the
 * `client_secret` live from Stripe via `orders.stripe_payment_intent_id` —
 * the secret is NEVER persisted anywhere readable (PRD §1.6 rule 2); without
 * this action a pay-page refresh would strand the customer. The gate decision
 * (pending-inside-window vs expired/cancelled/paid) lives in the pure
 * `gateFor` (src/lib/orders/payment-gate.ts), shared with the C6 page.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { messageOf } from "@/lib/utils";
import { stripe } from "@/lib/stripe";
import { orderNumberDisplay } from "@/lib/orders/checkout";
import { gateFor } from "@/lib/orders/payment-gate";
import type { OrderStatus } from "@/lib/orders/state-machine";

/** Discriminated payment-session result — C6 renders a gate per branch. */
export type PaymentSessionResult =
  | {
      ok: true;
      client_secret: string;
      /** ISO deadline = `created_at + RESERVATION_WINDOW_MS`. */
      deadline: string;
      total_paise: number;
      order_number_display: string;
    }
  | { ok: false; code: "not_found" }
  | { ok: false; code: "cancelled" }
  | { ok: false; code: "paid" }
  | { ok: false; code: "expired" }
  | { ok: false; code: "error"; message: string };

/**
 * Fetch the live Stripe `client_secret` for a pending Order inside its
 * 15-minute window. Anything else returns the gate it should show instead.
 */
export async function getPaymentSession(
  orderId: string,
): Promise<PaymentSessionResult> {
  if (!z.string().uuid().safeParse(orderId).success) {
    return { ok: false, code: "not_found" };
  }

  const supabase = await createClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select(
      "id, status, created_at, total_paise, order_number, order_year, stripe_payment_intent_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  if (!order) {
    return { ok: false, code: "not_found" };
  }

  const gate = gateFor(order.status, order.created_at, Date.now());
  if (gate.kind !== "active") {
    return { ok: false, code: gate.kind };
  }

  if (order.stripe_payment_intent_id === null) {
    // Checkout creates the intent right after the Order; a missing id means
    // that step failed — there is nothing to pay against.
    return { ok: false, code: "error", message: "Payment session unavailable." };
  }

  try {
    const intent = await stripe.paymentIntents.retrieve(
      order.stripe_payment_intent_id,
    );
    if (intent.client_secret === null) {
      return {
        ok: false,
        code: "error",
        message: "Payment session unavailable.",
      };
    }
    return {
      ok: true,
      client_secret: intent.client_secret,
      deadline: gate.deadlineIso,
      total_paise: order.total_paise,
      order_number_display: orderNumberDisplay(
        order.order_year,
        order.order_number,
      ),
    };
  } catch (err) {
    return { ok: false, code: "error", message: messageOf(err) };
  }
}

/** Order status for C7 polling. `auto_refunded` is the late-payment outcome. */
export type OrderStatusResult =
  | { ok: true; status: OrderStatus; auto_refunded: boolean }
  | { ok: false; code: "not_found" };

/**
 * Read the caller's Order status. `auto_refunded` distinguishes the safety
 * valve (status `cancelled` AND a Refund row exists — the payment arrived
 * after the hold ended and stock was gone, ADR-0004) from a plain cancel.
 */
export async function getOrderStatus(
  orderId: string,
): Promise<OrderStatusResult> {
  if (!z.string().uuid().safeParse(orderId).success) {
    return { ok: false, code: "not_found" };
  }

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) {
    return { ok: false, code: "not_found" };
  }

  let autoRefunded = false;
  if (order.status === "cancelled") {
    // Customers read their own Refund rows under RLS; a cancelled Order with
    // any refund is the auto-refund outcome (the only refund a cancelled
    // Order can carry — admin refunds require a paid Order, ADR-0009).
    const { count } = await supabase
      .from("refunds")
      .select("id", { count: "exact", head: true })
      .eq("order_id", orderId);
    autoRefunded = (count ?? 0) > 0;
  }

  return { ok: true, status: order.status, auto_refunded: autoRefunded };
}

