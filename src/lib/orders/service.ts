/**
 * Orders data layer (PRD 04) — the service-role-backed implementations of the
 * checkout/webhook injected seams.
 *
 * `orders` / `order_items` / `reservations` / `audit_log` are NOT
 * customer-writable under RLS (Foundation): creation and every transition happen
 * under service-role authority via these helpers. The Server Action establishes
 * the caller's identity itself (under their own RLS, to read their Cart) and
 * passes the verified `user_id` in; the actual order/reservation writes go
 * through the trusted service client and the SECURITY DEFINER RPCs.
 *
 * These wrap the atomic RPCs from migration 20260608000004 and the bookkeeping
 * (commit/release reservations, record a transition, attach the PaymentIntent).
 * The pure orchestration in checkout.ts / webhook.ts is what decides; this is
 * only the I/O.
 */

import { createServiceClient } from "../supabase/service";
import type { Database } from "../supabase/database.types";
import type {
  CheckoutCartLine,
  CreatedOrderRow,
} from "./checkout";
import type { WebhookOrder } from "./webhook";
import { assertTransition } from "./state-machine";
import { recordAudit } from "./audit";
import { restockProduct } from "./restock";


type ServiceClient = ReturnType<typeof createServiceClient>;
type OrderStatus = Database["public"]["Enums"]["order_status"];

/**
 * Load the caller's Cart lines with the full Product inputs checkout needs to
 * snapshot (incl. the per-piece HUID). Runs under the caller's OWN client (their
 * RLS) so only their Cart is visible. Returns an empty array when there is no
 * Cart or it is empty.
 */
export async function loadCheckoutCartLines(
  // The caller's RLS-scoped client (anon/authenticated session).
  supabase: Pick<ServiceClient, "from">,
): Promise<CheckoutCartLine[]> {
  const { data: cart, error } = await supabase
    .from("carts")
    .select(
      "id, cart_items(quantity, product_id, variant_id, products(id, sku, name, material, weight_grams, purity_karat, hallmark_huid, making_charge_type, making_charge_value), product_variant(id, sku, weight_grams, purity_karat, hallmark_huid, making_charge_type, making_charge_value, size_label, metal_tone))",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!cart || cart.cart_items.length === 0) {
    return [];
  }

  const lines: CheckoutCartLine[] = [];
  for (const item of cart.cart_items) {
    const p = item.products;
    if (!p) {
      continue;
    }
    // When a variant is present, use its pricing inputs (weight, purity, making charge).
    // The product's material is always used — variants don't switch material.
    const v = item.variant_id != null ? item.product_variant : null;
    lines.push({
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      sku: v ? v.sku : p.sku,
      name: p.name,
      material: p.material,
      weight_grams: String(v ? v.weight_grams : p.weight_grams),
      purity_karat: v ? v.purity_karat : p.purity_karat,
      hallmark_huid: v ? v.hallmark_huid : p.hallmark_huid,
      making_charge_type: v ? v.making_charge_type : p.making_charge_type,
      making_charge_value: v ? v.making_charge_value : p.making_charge_value,
      quantity: item.quantity,
      size_label: v ? v.size_label : null,
      metal_tone: v ? v.metal_tone : null,
    });
  }
  return lines;
}

/** Read the GST basis points from the `settings` singleton (service-role). */
export async function getGstSettings(): Promise<{
  gst_metal_bps: number;
  gst_making_bps: number;
}> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("settings")
    .select("gst_metal_bps, gst_making_bps")
    .limit(1)
    .single();
  if (error) {
    throw error;
  }
  return {
    gst_metal_bps: data.gst_metal_bps,
    gst_making_bps: data.gst_making_bps,
  };
}

/**
 * Invoke the atomic `reserve_and_create_order` RPC (the oversell guard). On an
 * `insufficient_stock` raise the RPC rolled everything back; we surface
 * `out_of_stock` so checkout aborts cleanly without a partial Order.
 */
export async function reserveAndCreateOrder(args: {
  userId: string;
  order: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
  expiresAt: string;
}): Promise<
  { ok: true; row: CreatedOrderRow } | { ok: false; reason: "out_of_stock" }
> {
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("reserve_and_create_order", {
    p_user_id: args.userId,
    p_order: args.order as Database["public"]["Tables"]["orders"]["Insert"] as never,
    p_items: args.items as never,
    p_expires_at: args.expiresAt,
  });

  if (error) {
    // The RPC raises `insufficient_stock:<product_id>` on the oversell guard.
    if (error.message.includes("insufficient_stock")) {
      return { ok: false, reason: "out_of_stock" };
    }
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error("reserve_and_create_order returned no row.");
  }
  return {
    ok: true,
    row: {
      order_id: row.order_id,
      order_number: row.order_number,
      order_year: row.order_year,
    },
  };
}

/** Attach a Stripe PaymentIntent id to an Order (service-role). */
export async function attachPaymentIntent(
  orderId: string,
  paymentIntentId: string,
): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc
    .from("orders")
    .update({ stripe_payment_intent_id: paymentIntentId, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    throw error;
  }
}

/** Find the Order behind a PaymentIntent id (the webhook's entry point). */
export async function findOrderByPaymentIntent(
  paymentIntentId: string,
): Promise<WebhookOrder | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("orders")
    .select("id, status, total_paise")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  return { id: data.id, status: data.status, total_paise: data.total_paise };
}

/** Mark an Order's active Reservations permanent (committed) on payment success. */
export async function commitReservations(orderId: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc
    .from("reservations")
    .update({ status: "committed", updated_at: new Date().toISOString() })
    .eq("order_id", orderId)
    .eq("status", "active");
  if (error) {
    throw error;
  }
}

/**
 * Release an Order's active Reservations and return the stock (the cancel path
 * on payment failure). Increments each Product's `stock_quantity` back, marks
 * the reservations released, and audits the restock.
 */
export async function releaseReservations(orderId: string): Promise<void> {
  const svc = createServiceClient();
  const { data: rows, error } = await svc
    .from("reservations")
    .select("id, product_id, variant_id, quantity")
    .eq("order_id", orderId)
    .eq("status", "active");
  if (error) {
    throw error;
  }

  for (const r of rows ?? []) {
    if (r.variant_id) {
      // Variant path: restock on product_variant directly.
      const { data: varRow, error: varReadErr } = await svc
        .from("product_variant")
        .select("stock_quantity")
        .eq("id", r.variant_id)
        .single();
      if (varReadErr) throw varReadErr;
      const { error: varUpdErr } = await svc
        .from("product_variant")
        .update({
          stock_quantity: varRow.stock_quantity + r.quantity,
          updated_at: new Date().toISOString(),
        })
        .eq("id", r.variant_id);
      if (varUpdErr) throw varUpdErr;
    } else {
      await restockProduct({
        productId: r.product_id,
        quantity: r.quantity,
        orderId,
        reason: "payment_failed",
      });
    }
    const { error: relErr } = await svc
      .from("reservations")
      .update({ status: "released", updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (relErr) {
      throw relErr;
    }
  }
}

/**
 * The late-payment safety valve's re-reservation (ADR-0004). Delegates to the
 * `revive_or_release_reservation` RPC, whose guarded decrement re-reserves the
 * stock atomically; returns `true` if revivable, `false` if any line's stock is
 * gone (the caller then auto-refunds).
 */
export async function reviveReservations(orderId: string): Promise<boolean> {
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("revive_or_release_reservation", {
    p_order_id: orderId,
  });
  if (error) {
    throw error;
  }
  return data === true;
}

/**
 * The ONE status-transition operation: validate the move against the legal
 * transition graph (ADR-0009), persist it guarded on the expected `from`, and
 * audit it. Callers cannot get the assert→persist→audit sequence wrong because
 * the sequence IS the interface. Throws `IllegalTransitionError` on an illegal
 * move; a lost race (row already moved on) is a silent no-op, which keeps the
 * webhook idempotent under Stripe retries.
 */
export async function transitionOrder(args: {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  reason: string;
}): Promise<void> {
  assertTransition(args.from, args.to);
  const svc = createServiceClient();
  // Guard the write with the expected `from` status so a concurrent transition
  // (e.g. the expiry sweep) cannot be clobbered: the update is a no-op if the
  // row already moved on.
  const { data, error } = await svc
    .from("orders")
    .update({ status: args.to, updated_at: new Date().toISOString() })
    .eq("id", args.orderId)
    .eq("status", args.from)
    .select("id");
  if (error) {
    throw error;
  }
  if (!data || data.length === 0) {
    // The Order was not in `from` — a race; do not audit a transition that did
    // not happen. The webhook is idempotent, so this is safe to ignore.
    return;
  }
  await recordAudit({
    orderId: args.orderId,
    action: "order_status_changed",
    entityType: "order",
    entityId: args.orderId,
    details: { from: args.from, to: args.to, reason: args.reason },
  });
}

/** Sentinel reason that identifies auto-refund rows in the refund ledger. */
export const AUTO_REFUND_REASON = "auto_refund_late_payment";

/**
 * Write the late-payment auto-refund as a `refunds` row so the admin ledger
 * can display it with an AUTO chip. Uses a sentinel `reason` to distinguish
 * it from admin-issued goodwill refunds.
 */
export async function recordAutoRefund(args: {
  orderId: string;
  amountPaise: number;
}): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.from("refunds").insert({
    order_id: args.orderId,
    kind: "goodwill",
    amount_paise: args.amountPaise,
    reason: AUTO_REFUND_REASON,
  });
  if (error) throw error;
}

/**
 * Run the 15-minute Reservation expiry sweep via the `expire_reservations` RPC
 * (release stock + cancel still-pending Orders, audited). Returns the number of
 * Orders cancelled. `now` is injectable so the expiry is testable with a
 * controlled clock; production passes the DB `now()` by omitting it.
 */
export async function sweepExpiredReservations(now?: Date): Promise<number> {
  const svc = createServiceClient();
  const { data, error } = await svc.rpc("expire_reservations", {
    ...(now ? { p_now: now.toISOString() } : {}),
  });
  if (error) {
    throw error;
  }
  return typeof data === "number" ? data : 0;
}
