/**
 * Order state machine — the explicit lifecycle graph from ADR-0009.
 *
 * This is a PURE module: states + a legal-transition table + guard helpers, with
 * zero I/O. It is prototyped and unit-tested before `createOrderFromCart` is
 * written, and is the single spine both the checkout action and the Stripe
 * webhook write THROUGH — every status change is validated here first, so an
 * Order can never reach an impossible state.
 *
 * PRD 05 (Refund/Admin) reuses this module verbatim for the
 * `processing → shipped → delivered` fulfillment path and the refund
 * transitions; do not duplicate the table there.
 *
 * Two rules carry the most weight (ADR-0009 / ADR-0004):
 *   - `paid → cancelled` is DISALLOWED — once money is captured an Order can
 *     never become `cancelled`; `cancelled` means money never moved, full stop.
 *     Killing a paid Order is a Refund (lands in `refunded`), never a Cancel.
 *   - `cancelled → paid` is ALLOWED — the late-payment safety-valve revive: a
 *     `payment_intent.succeeded` arriving after the 15-minute Reservation already
 *     expired and cancelled the Order re-reserves and revives it (ADR-0004).
 */

import type { Database } from "../supabase/database.types";

/** The Order Status enum, sourced from the generated DB types (ADR-0009). */
export type OrderStatus = Database["public"]["Enums"]["order_status"];

/** Every Order Status, in lifecycle order. */
export const ORDER_STATES: readonly OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;

/**
 * The legal-transition adjacency table (ADR-0009). A status maps to the set of
 * statuses it may legally move TO. Any pair not present here is illegal —
 * notably `paid → cancelled` (absent by design) and every other
 * post-payment → cancelled move.
 */
const TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  // Checkout creates `pending`; the webhook drives it onward.
  pending: ["paid", "cancelled"],
  // Payment captured. Fulfillment or refund from here; NEVER cancelled.
  paid: ["processing", "refunded", "partially_refunded"],
  processing: ["shipped", "refunded", "partially_refunded"],
  shipped: ["delivered", "refunded", "partially_refunded"],
  delivered: ["refunded", "partially_refunded"],
  // Cancelled is terminal EXCEPT for the safety-valve revive to paid (ADR-0004).
  cancelled: ["paid"],
  // Fully refunded is terminal.
  refunded: [],
  // A partial refund can be followed by another, or by the final full refund.
  partially_refunded: ["partially_refunded", "refunded"],
};

/** The statuses for which money has moved — everything except pending/cancelled. */
const MONEY_NOT_MOVED: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "pending",
  "cancelled",
]);

/** Thrown when a caller attempts a transition the graph forbids. */
export class IllegalTransitionError extends Error {
  readonly from: OrderStatus;
  readonly to: OrderStatus;

  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Illegal Order Status transition: ${from} → ${to}.`);
    this.name = "IllegalTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** The statuses an Order in `from` may legally move to (a fresh array). */
export function nextStates(from: OrderStatus): OrderStatus[] {
  return [...TRANSITIONS[from]];
}

/** True iff moving `from → to` is a legal transition (ADR-0009). */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * Validate a transition, throwing `IllegalTransitionError` if it is not legal.
 * Both the action and the webhook call this immediately before writing the new
 * status, so an illegal move fails loudly rather than corrupting the Order.
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

/**
 * "Did money move?" — true for every status except `pending` and `cancelled`
 * (ADR-0009). Makes the Cancel/Refund split a clean query: a `cancelled` Order
 * is guaranteed to have moved no money.
 */
export function isMoneyMoved(status: OrderStatus): boolean {
  return !MONEY_NOT_MOVED.has(status);
}
