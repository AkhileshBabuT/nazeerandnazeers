/**
 * Admin operations data layer (PRD 05) — the service-role-backed I/O behind the
 * fulfillment + refund Server Actions.
 *
 * `orders` / `order_items` / `refunds` / `audit_log` and product restock are not
 * customer-writable under RLS (Foundation). The Server Action authorizes the
 * admin (JWT claim, ADR-0012) and then these helpers do the privileged writes
 * through the service client. The decisions — tax-share, resulting status,
 * legal transition — are made by the PURE cores (`refund.ts`, `state-machine.ts`);
 * this module is only the I/O that applies them, atomically per refund line.
 *
 * Every money-moving step is audited (ADR-0004): the refund, the restock, and
 * the status transition each append an `audit_log` row.
 */

import { createServiceClient } from "../supabase/service";
import type { Database } from "../supabase/database.types";
import { assertTransition, type OrderStatus } from "./state-machine";
import {
  planItemRefund,
  type RefundableItem,
  type OrderGstSnapshot,
} from "./refund";
import { recordAudit } from "./audit";
import { transitionOrder } from "./service";
import { restockProduct } from "./restock";
import { refundOrderManually } from "./stripe-payments";

type RefundKind = Database["public"]["Enums"]["refund_kind"];

/** The Order header fields the refund/fulfillment paths need. */
export interface AdminOrder {
  id: string;
  status: OrderStatus;
  total_paise: number;
  gst_metal_bps: number;
  gst_making_bps: number;
  stripe_payment_intent_id: string | null;
}

/** An order item with its product id (for restock) and refund columns. */
export interface AdminOrderItem extends RefundableItem {
  product_id: string | null;
}

/** Load an Order header (service-role) or null when it does not exist. */
export async function loadAdminOrder(orderId: string): Promise<AdminOrder | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("orders")
    .select(
      "id, status, total_paise, gst_metal_bps, gst_making_bps, stripe_payment_intent_id",
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  return data ?? null;
}

/** Load every line of an Order with the columns refund needs (service-role). */
export async function loadAdminOrderItems(
  orderId: string,
): Promise<AdminOrderItem[]> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("order_items")
    .select(
      "id, product_id, unit_price_paise, making_charges_paise, quantity, refunded_quantity",
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []).map((r) => ({
    order_item_id: r.id,
    product_id: r.product_id,
    unit_price_paise: r.unit_price_paise,
    making_charges_paise: r.making_charges_paise,
    quantity: r.quantity,
    refunded_quantity: r.refunded_quantity,
  }));
}

/** Insert a `refunds` row (service-role) and return its id. */
async function insertRefund(args: {
  orderId: string;
  orderItemId: string | null;
  kind: RefundKind;
  amountPaise: number;
  quantity: number | null;
  reason: string | null;
  stripeRefundId: string | null;
}): Promise<string> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("refunds")
    .insert({
      order_id: args.orderId,
      order_item_id: args.orderItemId,
      kind: args.kind,
      amount_paise: args.amountPaise,
      quantity: args.quantity,
      reason: args.reason,
      stripe_refund_id: args.stripeRefundId,
    })
    .select("id")
    .single();
  if (error) {
    throw error;
  }
  return data.id;
}

/**
 * Bump an order item's `refunded_quantity` by `qty`, guarding against a
 * concurrent refund: the update is conditioned on the count we read, so a race
 * fails loudly rather than over-refunding. The DB CHECK
 * (`refunded_quantity <= quantity`) is the final backstop.
 */
async function bumpRefundedQuantity(
  orderItemId: string,
  from: number,
  qty: number,
): Promise<void> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("order_items")
    .update({ refunded_quantity: from + qty })
    .eq("id", orderItemId)
    .eq("refunded_quantity", from)
    .select("id");
  if (error) {
    throw error;
  }
  if (!data || data.length === 0) {
    throw new Error(
      `Refund race on order item ${orderItemId}: refunded_quantity changed under us.`,
    );
  }
}

/** What an applied refund returns to the action. */
export interface AppliedRefund {
  refund_amount_paise: number;
  resulting_status: OrderStatus;
}

/**
 * Apply an item refund end to end (ADR-0004): plan the amount + resulting status
 * from the Order's FROZEN gst bps (never live settings), validate the transition
 * through the shared state machine, post ONE Stripe refund for the total, then
 * per line write a `refunds` row, bump `refunded_quantity`, and restock the
 * piece — each audited. The Order then transitions via `transitionOrder`.
 *
 * Refund is paid-only: the caller (action) rejects an unpaid Order before this
 * runs, so the PaymentIntent is guaranteed present.
 */
export async function applyItemRefund(args: {
  order: AdminOrder;
  items: AdminOrderItem[];
  requests: ReadonlyArray<{ order_item_id: string; quantity: number }>;
  reason: string | null;
}): Promise<AppliedRefund> {
  const { order, items, requests, reason } = args;
  if (!order.stripe_payment_intent_id) {
    throw new Error(
      `Order ${order.id} has no PaymentIntent; cannot refund (unpaid).`,
    );
  }

  const gst: OrderGstSnapshot = {
    gst_metal_bps: order.gst_metal_bps,
    gst_making_bps: order.gst_making_bps,
  };
  const plan = planItemRefund(items, requests, gst);

  // Fail fast BEFORE money moves: the Stripe refund below is irreversible, so
  // an illegal transition (e.g. already refunded) must throw here, not at the
  // final transitionOrder (which re-validates on persist).
  assertTransition(order.status, plan.resulting_status);

  // One Stripe refund for the batch total; its id rides on every line's row.
  const { stripeRefundId } = await refundOrderManually({
    paymentIntentId: order.stripe_payment_intent_id,
    amountPaise: plan.total_amount_paise,
    orderId: order.id,
    kind: "item",
    reason: reason ?? undefined,
  });

  const byId = new Map(items.map((i) => [i.order_item_id, i]));
  for (const line of plan.lines) {
    const item = byId.get(line.order_item_id);
    if (!item) {
      // planItemRefund already validated this; defensive only.
      throw new Error(`Order item ${line.order_item_id} vanished mid-refund.`);
    }
    await insertRefund({
      orderId: order.id,
      orderItemId: line.order_item_id,
      kind: "item",
      amountPaise: line.amount_paise,
      quantity: line.quantity,
      reason,
      stripeRefundId,
    });
    await bumpRefundedQuantity(line.order_item_id, item.refunded_quantity, line.quantity);
    await recordAudit({
      orderId: order.id,
      action: "refund_issued",
      entityType: "order_item",
      entityId: line.order_item_id,
      details: {
        kind: "item",
        amount_paise: line.amount_paise,
        quantity: line.quantity,
        stripe_refund_id: stripeRefundId,
        reason,
      },
    });
    if (item.product_id) {
      await restockProduct({
        productId: item.product_id,
        quantity: line.quantity,
        orderId: order.id,
        reason: "item_refund",
        orderItemId: line.order_item_id,
      });
    }
  }

  await transitionOrder({
    orderId: order.id,
    from: order.status,
    to: plan.resulting_status,
    reason: "item_refund",
  });

  return {
    refund_amount_paise: plan.total_amount_paise,
    resulting_status: plan.resulting_status,
  };
}

/**
 * Apply a goodwill/adjustment refund (ADR-0004): an arbitrary amount, NO restock,
 * no order item. Lands the Order in `partially_refunded` (or `refunded` if the
 * amount equals the whole order total — a full goodwill reversal). Stripe refund
 * + `refunds` row + audit + transition.
 */
export async function applyGoodwillRefund(args: {
  order: AdminOrder;
  amountPaise: number;
  reason: string | null;
}): Promise<AppliedRefund> {
  const { order, amountPaise, reason } = args;
  if (!order.stripe_payment_intent_id) {
    throw new Error(
      `Order ${order.id} has no PaymentIntent; cannot refund (unpaid).`,
    );
  }

  // A full-amount goodwill refund fully reverses the sale; otherwise partial.
  const resulting: OrderStatus =
    amountPaise >= order.total_paise ? "refunded" : "partially_refunded";
  // Fail fast BEFORE the irreversible Stripe refund (transitionOrder
  // re-validates on persist).
  assertTransition(order.status, resulting);

  const { stripeRefundId } = await refundOrderManually({
    paymentIntentId: order.stripe_payment_intent_id,
    amountPaise,
    orderId: order.id,
    kind: "goodwill",
    reason: reason ?? undefined,
  });

  await insertRefund({
    orderId: order.id,
    orderItemId: null,
    kind: "goodwill",
    amountPaise,
    quantity: null,
    reason,
    stripeRefundId,
  });
  await recordAudit({
    orderId: order.id,
    action: "refund_issued",
    entityType: "order",
    entityId: order.id,
    details: {
      kind: "goodwill",
      amount_paise: amountPaise,
      stripe_refund_id: stripeRefundId,
      reason,
    },
  });

  await transitionOrder({
    orderId: order.id,
    from: order.status,
    to: resulting,
    reason: "goodwill_refund",
  });

  return { refund_amount_paise: amountPaise, resulting_status: resulting };
}

/**
 * Advance a paid Order one fulfillment step (`paid → processing → shipped →
 * delivered`), validated by the shared state machine (ADR-0009). Delegates to
 * `transitionOrder`, so the move is validated, audited, and guarded against a
 * concurrent status change. An illegal step (skipping, or `paid → cancelled`)
 * throws.
 */
export async function advanceFulfillment(args: {
  order: AdminOrder;
  to: Extract<OrderStatus, "processing" | "shipped" | "delivered">;
}): Promise<{ from: OrderStatus; to: OrderStatus }> {
  await transitionOrder({
    orderId: args.order.id,
    from: args.order.status,
    to: args.to,
    reason: "fulfillment",
  });
  return { from: args.order.status, to: args.to };
}
