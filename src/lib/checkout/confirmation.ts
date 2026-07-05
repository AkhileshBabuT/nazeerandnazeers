/**
 * C7 confirmation view (PRD 04 C7) — PURE. The StatusPoller island is a
 * trivial switch over `confirmationView`, so every webhook-race outcome is
 * decided (and unit-tested) here:
 *
 *  - `processing`   — Order still `pending`, under the polling cap.
 *  - `paid`         — money moved (`paid` or any later status). This covers
 *                     the REVIVED order (`cancelled → paid`, ADR-0004): a
 *                     revive reads as a plain success, never a special case.
 *  - `auto_refunded`— the late-payment safety valve: status `cancelled` AND a
 *                     Refund row exists (the only refund a cancelled Order can
 *                     carry — `getOrderStatus` computes the flag).
 *  - `cancelled`    — plain cancel: money never moved (ADR-0009).
 *  - `timeout`      — still `pending` past the cap; honest "check your orders
 *                     page" copy (email is deferred — no promises).
 *
 * `fulfillmentPath` derives the PAID → PROCESSING → SHIPPED → DELIVERED
 * timeline stations from the order state machine instead of hardcoding them:
 * from each status it follows the single onward transition that is not a
 * refund/cancel branch.
 */

import { nextStates, type OrderStatus } from "@/lib/orders/state-machine";

/** Poll `getOrderStatus` every 2s… (PRD §1.6). */
export const POLL_INTERVAL_MS = 2_000;
/** …for at most 60s (2s × 30), then stop and show the timeout state. */
export const POLL_CAP_MS = 60_000;

/** What the confirmation page shows right now. */
export type ConfirmationView =
  | { kind: "processing" }
  | { kind: "paid" }
  | { kind: "auto_refunded" }
  | { kind: "cancelled" }
  | { kind: "timeout" };

/** Decide the confirmation state from a status snapshot + elapsed poll time. */
export function confirmationView({
  status,
  autoRefunded,
  elapsedMs,
  capMs = POLL_CAP_MS,
}: {
  status: OrderStatus;
  autoRefunded: boolean;
  elapsedMs: number;
  capMs?: number;
}): ConfirmationView {
  if (status === "cancelled") {
    return autoRefunded ? { kind: "auto_refunded" } : { kind: "cancelled" };
  }
  if (status === "pending") {
    return elapsedMs >= capMs ? { kind: "timeout" } : { kind: "processing" };
  }
  // Money moved (paid or any post-payment status) — incl. the revived order.
  return { kind: "paid" };
}

/** The refund/cancel branches the fulfillment timeline must not walk. */
const OFF_PATH: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  "cancelled",
  "refunded",
  "partially_refunded",
]);

/**
 * The happy fulfillment path from `from`, derived from the state machine:
 * follow the unique onward transition that is not a refund/cancel branch.
 * `fulfillmentPath("paid")` = paid → processing → shipped → delivered.
 */
export function fulfillmentPath(from: OrderStatus = "paid"): OrderStatus[] {
  const path: OrderStatus[] = [from];
  let current = from;
  for (;;) {
    const onward = nextStates(current).filter((s) => !OFF_PATH.has(s));
    const next = onward.length === 1 ? onward[0] : undefined;
    if (next === undefined) {
      return path;
    }
    current = next;
    path.push(current);
  }
}
