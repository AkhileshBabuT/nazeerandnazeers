/**
 * Stripe webhook (PRD 04) — POST /api/webhooks/stripe.
 *
 * Receives `payment_intent.succeeded` / `payment_intent.payment_failed` events
 * and drives the Order state machine (ADR-0009) through the pure webhook core
 * (src/lib/orders/webhook.ts). The route's job is the untrusted-edge concerns:
 *   - read the RAW request body (signature verification needs the exact bytes —
 *     never the parsed JSON);
 *   - verify the Stripe signature against `STRIPE_WEBHOOK_SECRET` (mandatory; an
 *     unverified body is rejected with 400);
 *   - hand the verified event to the core, which decides the transition and
 *     runs the late-payment safety valve (ADR-0004) against the service-role
 *     data layer.
 *
 * Route Handlers are uncached and run per-request in this Next.js version, which
 * is exactly what a webhook needs. We always return 200 for a handled (or
 * idempotently-ignored) event so Stripe does not retry a correctly-processed
 * delivery; only signature/processing FAILURES return non-2xx.
 */

import type Stripe from "stripe";
import {
  handleWebhookEvent,
  type VerifiedEvent,
} from "@/lib/orders/webhook";
import {
  constructWebhookEvent,
  refundOrderPaymentIntent,
} from "@/lib/orders/stripe-payments";
import { recordAudit } from "@/lib/orders/audit";
import {
  findOrderByPaymentIntent,
  commitReservations,
  releaseReservations,
  reviveReservations,
  transitionOrder,
  recordAutoRefund,
} from "@/lib/orders/service";

/** Pull the PaymentIntent id off a `payment_intent.*` event. */
function paymentIntentIdOf(event: Stripe.Event): string | null {
  const obj = event.data.object as { id?: string; object?: string };
  if (obj.object === "payment_intent" && typeof obj.id === "string") {
    return obj.id;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: "Missing stripe-signature." }, { status: 400 });
  }

  // The RAW body — signature verification must run on the exact bytes Stripe
  // signed, so we never JSON.parse before verifying.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature.";
    return Response.json({ error: message }, { status: 400 });
  }

  const paymentIntentId = paymentIntentIdOf(event);
  if (!paymentIntentId) {
    // A verified event we don't act on (not a payment_intent.*). Ack it.
    return Response.json({ received: true, handled: false });
  }

  const verified: VerifiedEvent = { type: event.type, paymentIntentId };

  try {
    const outcome = await handleWebhookEvent(verified, {
      findOrderByPaymentIntent,
      commitReservations,
      releaseReservations,
      reviveReservations,
      transitionOrder,
      refundPaymentIntent: refundOrderPaymentIntent,
      recordAudit,
      recordAutoRefund,
    });
    return Response.json({ received: true, ...outcome });
  } catch (err) {
    // A genuine processing failure — return 500 so Stripe retries the delivery.
    const message = err instanceof Error ? err.message : "Webhook processing failed.";
    return Response.json({ error: message }, { status: 500 });
  }
}
