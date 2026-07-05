/**
 * Refund core (PRD 05) — PURE, no I/O.
 *
 * Two things live here, both deterministic and unit-tested before any DB code:
 *
 *  1. **Item refund amount** — recompute one order item's refund from the
 *     order item's OWN snapshotted `unit_price_paise` + `making_charges_paise`
 *     and the ORDER's snapshotted `gst_metal_bps` / `gst_making_bps`
 *     (ADR-0003/0005). The amount = (pre-tax price + its GST share) × quantity.
 *     This reads the Order's frozen bps, NEVER today's `settings` — that is the
 *     immutability linchpin: changing `settings` cannot alter an old refund.
 *
 *  2. **Resulting Order state** — given how many units of every line are now
 *     refunded, decide the next status: any unit still un-refunded →
 *     `partially_refunded`; the last unit gone → `refunded` (ADR-0004/0009). The
 *     actual transition is validated through the shared state machine, never a
 *     bespoke table here.
 *
 * The GST share is recomputed with the SAME round-half-up rule the original
 * snapshot used (`divRoundHalfUp` from pricing.ts), so a refund can never
 * disagree with the bill by a Paisa.
 */

import { divRoundHalfUp } from "../pricing";
import type { OrderStatus } from "./state-machine";

const BPS_DEN = BigInt(10000);

/** The Order's frozen GST basis points (ADR-0005). Read from the Order, not settings. */
export interface OrderGstSnapshot {
  gst_metal_bps: number;
  gst_making_bps: number;
}

/** One order item's frozen money columns + refund progress (ADR-0003/0004). */
export interface RefundableItem {
  order_item_id: string;
  /** Pre-tax per-unit price = metal value + making charge (ADR-0003). */
  unit_price_paise: number;
  /** Per-unit making charge, a subset of `unit_price_paise` (ADR-0003). */
  making_charges_paise: number;
  /** Units originally ordered. */
  quantity: number;
  /** Units already refunded so far (ADR-0004). */
  refunded_quantity: number;
}

/**
 * The recomputed GST share for ONE unit of an item, from the Order's frozen bps.
 * Mirrors `calculatePrice`'s GST exactly: disjoint bases (metal vs making), each
 * rounded to integer Paise independently, then summed (ADR-0011).
 */
export function itemUnitGstSharePaise(
  item: Pick<RefundableItem, "unit_price_paise" | "making_charges_paise">,
  gst: OrderGstSnapshot,
): number {
  const making = BigInt(item.making_charges_paise);
  // Pre-tax price = metal value + making charge; metal value is the remainder.
  const metalValue = BigInt(item.unit_price_paise) - making;
  if (metalValue < BigInt(0)) {
    throw new Error(
      "Invalid order item: making_charges_paise exceeds unit_price_paise.",
    );
  }
  const gstMetal = divRoundHalfUp(metalValue * BigInt(gst.gst_metal_bps), BPS_DEN);
  const gstMaking = divRoundHalfUp(making * BigInt(gst.gst_making_bps), BPS_DEN);
  return Number(gstMetal + gstMaking);
}

/**
 * The full refund amount for `quantity` units of an item: (pre-tax price + its
 * recomputed GST share) per unit, times quantity (ADR-0004). Tax-inclusive,
 * because the customer paid tax-inclusive.
 */
export function itemRefundAmountPaise(
  item: RefundableItem,
  quantity: number,
  gst: OrderGstSnapshot,
): number {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`Refund quantity must be a positive integer, got ${quantity}.`);
  }
  const remaining = item.quantity - item.refunded_quantity;
  if (quantity > remaining) {
    throw new Error(
      `Cannot refund ${quantity} unit(s); only ${remaining} remain on the item.`,
    );
  }
  const perUnit = item.unit_price_paise + itemUnitGstSharePaise(item, gst);
  return perUnit * quantity;
}

/** A requested refund of N units of a specific order item. */
export interface RefundItemRequest {
  order_item_id: string;
  quantity: number;
}

/** The computed plan for ONE item line of a refund. */
export interface RefundLinePlan {
  order_item_id: string;
  quantity: number;
  amount_paise: number;
}

/**
 * Decide the Order's resulting status after a set of item refunds is applied,
 * given every line's post-refund `refunded_quantity`. If any unit anywhere is
 * still un-refunded → `partially_refunded`; if every unit of every line is
 * refunded → `refunded` (ADR-0004/0009).
 *
 * `lines` must be the FULL set of the Order's items with their refunded counts
 * AFTER this refund is applied.
 */
export function resultingStatusAfterItemRefund(
  lines: ReadonlyArray<Pick<RefundableItem, "quantity" | "refunded_quantity">>,
): Extract<OrderStatus, "partially_refunded" | "refunded"> {
  const allRefunded = lines.every(
    (l) => l.refunded_quantity >= l.quantity,
  );
  return allRefunded ? "refunded" : "partially_refunded";
}

/**
 * Plan a multi-item refund: validate each requested line against the item's
 * remaining quantity, compute each line's amount from the Order's frozen bps,
 * and the post-refund counts to derive the resulting status. Pure — the caller
 * applies the plan (Stripe + DB writes).
 */
export interface ItemRefundPlan {
  lines: RefundLinePlan[];
  total_amount_paise: number;
  resulting_status: Extract<OrderStatus, "partially_refunded" | "refunded">;
}

export function planItemRefund(
  items: ReadonlyArray<RefundableItem>,
  requests: ReadonlyArray<RefundItemRequest>,
  gst: OrderGstSnapshot,
): ItemRefundPlan {
  if (requests.length === 0) {
    throw new Error("An item refund must name at least one order item.");
  }
  const byId = new Map(items.map((i) => [i.order_item_id, i]));
  // Track post-refund counts per item, starting from current state.
  const refundedAfter = new Map(
    items.map((i) => [i.order_item_id, i.refunded_quantity]),
  );

  const lines: RefundLinePlan[] = [];
  let total = 0;
  for (const req of requests) {
    const item = byId.get(req.order_item_id);
    if (!item) {
      throw new Error(`Order item ${req.order_item_id} is not on this Order.`);
    }
    // Account for an earlier request against the same item in this same batch.
    const already = refundedAfter.get(req.order_item_id) ?? item.refunded_quantity;
    const remaining = item.quantity - already;
    if (req.quantity > remaining) {
      throw new Error(
        `Cannot refund ${req.quantity} unit(s) of item ${req.order_item_id}; ` +
          `only ${remaining} remain.`,
      );
    }
    const amount = itemRefundAmountPaise(
      { ...item, refunded_quantity: already },
      req.quantity,
      gst,
    );
    lines.push({
      order_item_id: req.order_item_id,
      quantity: req.quantity,
      amount_paise: amount,
    });
    total += amount;
    refundedAfter.set(req.order_item_id, already + req.quantity);
  }

  const postLines = items.map((i) => ({
    quantity: i.quantity,
    refunded_quantity: refundedAfter.get(i.order_item_id) ?? i.refunded_quantity,
  }));

  return {
    lines,
    total_amount_paise: total,
    resulting_status: resultingStatusAfterItemRefund(postLines),
  };
}
