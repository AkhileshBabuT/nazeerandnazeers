/**
 * Stripe webhook core (PRD 04) — the body of the `payment_intent` handler, with
 * every I/O seam injected so the transition logic (including the late-payment
 * safety valve) is unit-testable without Stripe or Supabase.
 *
 * Both events write THROUGH the pure state machine (ADR-0009): the injected
 * `transitionOrder` validates every move against the legal-transition graph
 * before persisting it, so the webhook can never drive an Order to an
 * impossible state.
 *
 *   - `payment_intent.succeeded`:
 *       * Order `pending`   → `paid`; the Reservation becomes permanent
 *         (committed) — no stock change (ADR-0001).
 *       * Order `cancelled` → the late-payment safety valve (ADR-0004): try to
 *         re-reserve the stock; if available, revive `cancelled → paid`; if the
 *         unique piece is gone, AUTO-REFUND via Stripe and stay `cancelled`.
 *         This is the ONLY automatic Stripe refund.
 *       * Order already `paid`/post-payment → idempotent no-op.
 *   - `payment_intent.payment_failed`:
 *       * Order `pending` → `cancelled`; release the stock (ADR-0001).
 *       * Otherwise → no-op.
 *
 * Every transition + stock change is audited (by the RPCs at the DB and by
 * `transitionOrder` here for the status flip).
 */

import type { Database } from "../supabase/database.types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

/** The Order fields the webhook needs to decide a transition. */
export interface WebhookOrder {
  id: string;
  status: OrderStatus;
  total_paise: number;
}

/** Injected dependencies for the webhook core. */
export interface WebhookDeps {
  /** Find the Order for a PaymentIntent id, or null if none matches. */
  findOrderByPaymentIntent: (
    paymentIntentId: string,
  ) => Promise<WebhookOrder | null>;
  /** Commit the Reservations for an Order (active → committed). */
  commitReservations: (orderId: string) => Promise<void>;
  /** Release the Reservations + stock for an Order (the cancel path). */
  releaseReservations: (orderId: string) => Promise<void>;
  /**
   * The late-payment safety valve (ADR-0004): re-reserve a cancelled Order's
   * stock. Resolves `true` if every line was re-reserved (revivable), `false`
   * if any line's stock is gone (must auto-refund).
   */
  reviveReservations: (orderId: string) => Promise<boolean>;
  /**
   * The one status-transition operation: validate the move against the legal
   * graph, persist it guarded on `from`, audit it. Throws on an illegal move.
   */
  transitionOrder: (args: {
    orderId: string;
    from: OrderStatus;
    to: OrderStatus;
    reason: string;
  }) => Promise<void>;
  /** Issue a full Stripe refund for a PaymentIntent (safety-valve only). */
  refundPaymentIntent: (args: {
    paymentIntentId: string;
    amountPaise: number;
    orderId: string;
  }) => Promise<void>;
  /** Audit a non-transition event (e.g. an auto-refund that stays cancelled). */
  recordAudit: (args: {
    orderId: string;
    action: string;
    details: Record<string, unknown>;
  }) => Promise<void>;
  /** Write the auto-refund as a `refunds` row so the ledger can display it. */
  recordAutoRefund: (args: {
    orderId: string;
    amountPaise: number;
  }) => Promise<void>;
}

/** What the webhook core did, for the route's response + tests. */
export type WebhookOutcome =
  | { handled: false; reason: "unknown_event" | "order_not_found" }
  | { handled: true; action: "paid" }
  | { handled: true; action: "revived" }
  | { handled: true; action: "auto_refunded" }
  | { handled: true; action: "cancelled" }
  | { handled: true; action: "noop"; status: OrderStatus };

/** The minimal verified-event shape the core consumes (Stripe-agnostic). */
export interface VerifiedEvent {
  type: string;
  paymentIntentId: string;
}

/**
 * Handle a verified Stripe `payment_intent` event. Pure orchestration over the
 * injected deps; every status change goes through `transitionOrder`, which
 * validates the move before persisting it.
 */
export async function handleWebhookEvent(
  event: VerifiedEvent,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  if (
    event.type !== "payment_intent.succeeded" &&
    event.type !== "payment_intent.payment_failed"
  ) {
    return { handled: false, reason: "unknown_event" };
  }

  const order = await deps.findOrderByPaymentIntent(event.paymentIntentId);
  if (!order) {
    return { handled: false, reason: "order_not_found" };
  }

  if (event.type === "payment_intent.succeeded") {
    return handleSucceeded(order, event, deps);
  }
  return handleFailed(order, deps);
}

/** `payment_intent.succeeded` — paid, or the late-payment safety valve. */
async function handleSucceeded(
  order: WebhookOrder,
  event: VerifiedEvent,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  if (order.status === "pending") {
    // Normal path: pending → paid, Reservation permanent (no stock change).
    await deps.commitReservations(order.id);
    await deps.transitionOrder({
      orderId: order.id,
      from: "pending",
      to: "paid",
      reason: "payment_succeeded",
    });
    return { handled: true, action: "paid" };
  }

  if (order.status === "cancelled") {
    // Late-payment safety valve (ADR-0004): payment cleared after the 15-min
    // Reservation already expired and cancelled the Order.
    const revivable = await deps.reviveReservations(order.id);
    if (revivable) {
      // cancelled → paid is a LEGAL transition (the revive).
      await deps.transitionOrder({
        orderId: order.id,
        from: "cancelled",
        to: "paid",
        reason: "late_payment_revive",
      });
      return { handled: true, action: "revived" };
    }
    // Stock is gone — auto-refund and STAY cancelled. The only automatic refund.
    await deps.refundPaymentIntent({
      paymentIntentId: event.paymentIntentId,
      amountPaise: order.total_paise,
      orderId: order.id,
    });
    await deps.recordAutoRefund({ orderId: order.id, amountPaise: order.total_paise });
    await deps.recordAudit({
      orderId: order.id,
      action: "auto_refund_late_payment",
      details: {
        reason: "stock_unavailable_after_expiry",
        amount_paise: order.total_paise,
        payment_intent_id: event.paymentIntentId,
      },
    });
    return { handled: true, action: "auto_refunded" };
  }

  // Already paid / post-payment → idempotent no-op (a duplicate webhook).
  return { handled: true, action: "noop", status: order.status };
}

/** `payment_intent.payment_failed` — cancel a pending Order, release stock. */
async function handleFailed(
  order: WebhookOrder,
  deps: WebhookDeps,
): Promise<WebhookOutcome> {
  if (order.status === "pending") {
    await deps.releaseReservations(order.id);
    await deps.transitionOrder({
      orderId: order.id,
      from: "pending",
      to: "cancelled",
      reason: "payment_failed",
    });
    return { handled: true, action: "cancelled" };
  }
  // A failure on an already-resolved Order is a no-op (paid stays paid, etc.).
  return { handled: true, action: "noop", status: order.status };
}
