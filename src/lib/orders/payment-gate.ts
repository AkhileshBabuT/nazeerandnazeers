/**
 * Payment gate decision (PRD 04, §1.6 rule 1) — PURE.
 *
 * The C6 pay screen and `getPaymentSession` must agree on one question: given
 * an Order's status and creation time, may the Stripe gateway render right now?
 * The answer lives here, clock-injected, so both callers share the exact same
 * boundary (now >= created_at + RESERVATION_WINDOW_MS is EXPIRED — the deadline
 * instant itself is already outside the window) and the branches are
 * unit-testable.
 *
 * Customers cannot read `reservations.expires_at` (admin-only RLS), so the
 * window is derived from `orders.created_at` + the 15-minute constant — the v1
 * anchor (PRD gap G11).
 */

import { RESERVATION_WINDOW_MS } from "./checkout";
import { isMoneyMoved, type OrderStatus } from "./state-machine";

/** What the pay screen may show for an Order right now. */
export type PaymentGate =
  | { kind: "active"; deadlineIso: string }
  | { kind: "expired" }
  | { kind: "cancelled" }
  /** Money has moved (paid or any post-payment status) — go to confirmation. */
  | { kind: "paid" };

/** The payment deadline for an Order: `created_at + RESERVATION_WINDOW_MS`. */
export function paymentDeadlineIso(createdAtIso: string): string {
  return new Date(Date.parse(createdAtIso) + RESERVATION_WINDOW_MS).toISOString();
}

/**
 * Decide the gate for an Order. `pending` inside the window is the ONLY state
 * that may mount the gateway; `cancelled` means money never moved (ADR-0009);
 * every money-moved status routes to confirmation.
 */
export function gateFor(
  status: OrderStatus,
  createdAtIso: string,
  nowMs: number,
): PaymentGate {
  if (status === "cancelled") {
    return { kind: "cancelled" };
  }
  if (isMoneyMoved(status)) {
    return { kind: "paid" };
  }
  // status === "pending": the window decides.
  const deadlineMs = Date.parse(createdAtIso) + RESERVATION_WINDOW_MS;
  if (nowMs >= deadlineMs) {
    return { kind: "expired" };
  }
  return { kind: "active", deadlineIso: new Date(deadlineMs).toISOString() };
}
