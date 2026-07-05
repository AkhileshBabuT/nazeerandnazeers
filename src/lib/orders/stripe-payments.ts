/**
 * Stripe payment helpers for checkout (PRD 04) — PaymentIntent creation, the
 * safety-valve refund, and webhook signature verification. Thin wrappers over
 * the shared `stripe` client (src/lib/stripe.ts), kept apart from the pure
 * orchestration so the orchestration stays Stripe-agnostic and unit-testable.
 *
 * INR notes: amounts are in the smallest currency unit, which for INR is the
 * Paise — exactly our money unit (ADR-0006), so `amountPaise` passes straight
 * through with `currency: "inr"`. No float conversion.
 */

import { stripe } from "../stripe";
import type Stripe from "stripe";
import type { CheckoutPaymentIntent } from "./checkout";

/**
 * Create a PaymentIntent in INR for an Order's snapshotted total. The Order id
 * and number ride along in `metadata` so the webhook (and a human in the Stripe
 * dashboard) can tie the payment back to the Order.
 */
export async function createOrderPaymentIntent(args: {
  amountPaise: number;
  orderId: string;
  orderNumber: string;
}): Promise<CheckoutPaymentIntent> {
  const intent = await stripe.paymentIntents.create({
    amount: args.amountPaise, // INR smallest unit = Paise (ADR-0006).
    currency: "inr",
    // Let Stripe pick eligible methods; confirmation happens client-side.
    automatic_payment_methods: { enabled: true },
    metadata: {
      order_id: args.orderId,
      order_number: args.orderNumber,
    },
  });
  return { id: intent.id, client_secret: intent.client_secret };
}

/**
 * Issue a FULL Stripe refund for a PaymentIntent — the late-payment safety valve
 * only (ADR-0004). This is the single automatic refund in the system; all
 * business refunds are admin-manual (PRD 05).
 */
export async function refundOrderPaymentIntent(args: {
  paymentIntentId: string;
  amountPaise: number;
  orderId: string;
}): Promise<void> {
  await stripe.refunds.create({
    payment_intent: args.paymentIntentId,
    amount: args.amountPaise,
    reason: "requested_by_customer",
    metadata: { order_id: args.orderId, reason: "late_payment_safety_valve" },
  });
}

/**
 * Issue a manual BUSINESS refund against an Order's PaymentIntent (PRD 05) and
 * return the Stripe refund id for the `refunds` row (ADR-0004). Used for both
 * item-level refunds (amount = item price + its recomputed tax share) and
 * goodwill/adjustment refunds. A partial amount refunds the original charge in
 * part; the same call full-refunds when the amount equals the remaining charge.
 *
 * Distinct from `refundOrderPaymentIntent` (the automatic late-payment safety
 * valve, PRD 04) by intent and metadata — that one is the only AUTOMATIC refund;
 * these are admin-initiated. Amounts are Paise = INR smallest unit (ADR-0006).
 */
export async function refundOrderManually(args: {
  paymentIntentId: string;
  amountPaise: number;
  orderId: string;
  kind: "item" | "goodwill";
  reason?: string;
}): Promise<{ stripeRefundId: string }> {
  const refund = await stripe.refunds.create({
    payment_intent: args.paymentIntentId,
    amount: args.amountPaise,
    reason: "requested_by_customer",
    metadata: {
      order_id: args.orderId,
      refund_kind: args.kind,
      ...(args.reason ? { admin_reason: args.reason } : {}),
    },
  });
  return { stripeRefundId: refund.id };
}

/**
 * Verify a Stripe webhook signature and return the parsed event, or throw. The
 * raw request body (a string) and the `stripe-signature` header are required;
 * the signing secret comes from `STRIPE_WEBHOOK_SECRET`. Signature verification
 * is mandatory — an unverified body is never trusted.
 */
export function constructWebhookEvent(
  rawBody: string,
  signature: string,
): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET. See .env.example.");
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
