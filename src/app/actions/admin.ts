"use server";

/**
 * Admin operations Server Actions (PRD 05) — fulfillment + refunds + the admin
 * Orders read view. Also includes `setProductStock` for the A6 inventory adjust form.
 *
 * Every action is admin-only, gated by the JWT admin claim from Foundation
 * (ADR-0012): we read `app_metadata.user_role` from the verified token and reject
 * non-admins before any privileged work. RLS (`admin manages orders` /
 * `admin manages refunds` / ...) is the real enforcement boundary; this check
 * turns an opaque RLS denial into a clean typed result. Server Functions are
 * reachable by direct POST, so each verifies authorization itself.
 *
 * Refund is kept categorically distinct from Cancel (ADR-0004): there is no
 * "cancel a paid order" action here. Refunds apply ONLY to paid Orders — an
 * unpaid Order is rejected up front (`not_refundable`), so the Cancel/Refund
 * split never blurs. The amount/tax-share/status decisions live in the pure
 * cores (`lib/orders/refund.ts`, `state-machine.ts`); these actions wire the
 * production seams (`lib/orders/admin.ts`) and surface a discriminated result.
 */

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { messageOf } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import {
  itemRefundSchema,
  goodwillRefundSchema,
  advanceFulfillmentSchema,
  type ItemRefundInput,
  type GoodwillRefundInput,
  type AdvanceFulfillmentInput,
} from "@/lib/validators";
import { IllegalTransitionError, type OrderStatus } from "@/lib/orders/state-machine";
import {
  loadAdminOrder,
  loadAdminOrderItems,
  applyItemRefund,
  applyGoodwillRefund,
  advanceFulfillment,
} from "@/lib/orders/admin";
import { isMoneyMoved } from "@/lib/orders/state-machine";

/** Discriminated result so the admin UI handles each failure mode explicitly. */
export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "unauthorized" }
  | { ok: false; code: "invalid"; fieldErrors: Record<string, string[]> }
  | { ok: false; code: "not_found" }
  | { ok: false; code: "not_refundable"; message: string }
  | { ok: false; code: "illegal_transition"; from: OrderStatus; to: OrderStatus }
  | { ok: false; code: "error"; message: string };

/**
 * Resolve the caller's admin status from the verified JWT claims (ADR-0012).
 * Mirrors the catalog action's guard so authorization is one consistent shape.
 */
async function requireAdmin(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) {
    return { ok: false };
  }
  const role = (data.claims.app_metadata as { user_role?: string } | undefined)
    ?.user_role;
  if (role !== "admin") {
    return { ok: false };
  }
  return { ok: true, supabase };
}

/** Map a Zod error to a flat `{ path: messages[] }` for form display. */
function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}


/** Shape of an applied refund returned to the caller. */
export interface RefundOutcome {
  refund_amount_paise: number;
  resulting_status: OrderStatus;
}

/**
 * Refund one or more Order Items (the primary refund path, ADR-0004). The amount
 * is recomputed server-side from the Order's frozen snapshot incl. each item's
 * tax share (ADR-0003/0005) — the client cannot dictate it. Each item is
 * restocked; the Order lands in `partially_refunded` or `refunded`.
 */
export async function refundOrderItems(
  input: ItemRefundInput,
): Promise<AdminResult<RefundOutcome>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  const parsed = itemRefundSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  try {
    const order = await loadAdminOrder(parsed.data.order_id);
    if (!order) {
      return { ok: false, code: "not_found" };
    }
    // Refund is paid-only — Cancel/Refund split (ADR-0004). An unpaid Order
    // (pending/cancelled) never moves money, so it can never be refunded.
    if (!isMoneyMoved(order.status)) {
      return {
        ok: false,
        code: "not_refundable",
        message: `Order is ${order.status}; only paid Orders can be refunded (Cancel ≠ Refund).`,
      };
    }
    const items = await loadAdminOrderItems(order.id);
    const outcome = await applyItemRefund({
      order,
      items,
      requests: parsed.data.items.map((l) => ({
        order_item_id: l.order_item_id,
        quantity: l.quantity,
      })),
      reason: parsed.data.reason ?? null,
    });
    return { ok: true, data: outcome };
  } catch (err) {
    if (err instanceof IllegalTransitionError) {
      return { ok: false, code: "illegal_transition", from: err.from, to: err.to };
    }
    return { ok: false, code: "error", message: messageOf(err) };
  }
}

/**
 * Issue a goodwill/adjustment refund of an arbitrary amount (ADR-0004). Restocks
 * nothing; lands the Order in `partially_refunded` (or `refunded` for a full
 * reversal). Paid-only, same as item refunds.
 */
export async function goodwillRefund(
  input: GoodwillRefundInput,
): Promise<AdminResult<RefundOutcome>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  const parsed = goodwillRefundSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  try {
    const order = await loadAdminOrder(parsed.data.order_id);
    if (!order) {
      return { ok: false, code: "not_found" };
    }
    if (!isMoneyMoved(order.status)) {
      return {
        ok: false,
        code: "not_refundable",
        message: `Order is ${order.status}; only paid Orders can be refunded (Cancel ≠ Refund).`,
      };
    }
    const outcome = await applyGoodwillRefund({
      order,
      amountPaise: parsed.data.amount_paise,
      reason: parsed.data.reason ?? null,
    });
    return { ok: true, data: outcome };
  } catch (err) {
    if (err instanceof IllegalTransitionError) {
      return { ok: false, code: "illegal_transition", from: err.from, to: err.to };
    }
    return { ok: false, code: "error", message: messageOf(err) };
  }
}

/**
 * Advance a paid Order's fulfillment one step (`paid → processing → shipped →
 * delivered`, ADR-0009). The legal move is enforced by the shared state machine;
 * an illegal step (skipping, or `paid → cancelled`) is rejected.
 */
export async function advanceOrderFulfillment(
  input: AdvanceFulfillmentInput,
): Promise<AdminResult<{ from: OrderStatus; to: OrderStatus }>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  const parsed = advanceFulfillmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "invalid", fieldErrors: fieldErrorsOf(parsed.error) };
  }

  try {
    const order = await loadAdminOrder(parsed.data.order_id);
    if (!order) {
      return { ok: false, code: "not_found" };
    }
    const moved = await advanceFulfillment({ order, to: parsed.data.to });
    return { ok: true, data: moved };
  } catch (err) {
    if (err instanceof IllegalTransitionError) {
      return { ok: false, code: "illegal_transition", from: err.from, to: err.to };
    }
    return { ok: false, code: "error", message: messageOf(err) };
  }
}

/** A row in the admin Orders list — the snapshotted bill + current state. */
export interface AdminOrderListRow {
  id: string;
  order_number: number;
  order_year: number;
  status: OrderStatus;
  total_paise: number;
  created_at: string;
  user_id: string;
}

/**
 * List Orders for the admin dashboard, newest first (ADR-0003 read path: the
 * snapshotted totals only, never recomputed from rates). Runs under the admin's
 * OWN RLS session (`admin manages orders` grants the read), not service-role.
 */
export async function listOrders(
  limit = 50,
): Promise<AdminResult<AdminOrderListRow[]>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  const { data, error } = await auth.supabase
    .from("orders")
    .select("id, order_number, order_year, status, total_paise, created_at, user_id")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: data ?? [] };
}

/** The full admin Order detail: header snapshot + line items + refunds. */
export interface AdminOrderDetail {
  id: string;
  order_number: number;
  order_year: number;
  status: OrderStatus;
  subtotal_paise: number;
  making_charges_paise: number;
  gst_paise: number;
  total_paise: number;
  gst_metal_bps: number;
  gst_making_bps: number;
  created_at: string;
  items: Array<{
    id: string;
    sku_snapshot: string;
    name_snapshot: string;
    unit_price_paise: number;
    making_charges_paise: number;
    quantity: number;
    refunded_quantity: number;
    hallmark_huid_snapshot: string | null;
  }>;
  refunds: Array<{
    id: string;
    kind: string;
    amount_paise: number;
    quantity: number | null;
    reason: string | null;
    created_at: string;
  }>;
}

/**
 * Load one Order's full snapshotted bill + lines + refunds for the admin detail
 * view (read path; no recomputation from rates — ADR-0003). Admin RLS scopes it.
 */
export async function getOrderDetail(
  orderId: string,
): Promise<AdminResult<AdminOrderDetail>> {
  const auth = await requireAdmin();
  if (!auth.ok) {
    return { ok: false, code: "unauthorized" };
  }
  if (!z.string().uuid().safeParse(orderId).success) {
    return { ok: false, code: "invalid", fieldErrors: { order_id: ["invalid id"] } };
  }
  const { data, error } = await auth.supabase
    .from("orders")
    .select(
      `id, order_number, order_year, status, subtotal_paise, making_charges_paise, gst_paise, total_paise, gst_metal_bps, gst_making_bps, created_at,
       order_items(id, sku_snapshot, name_snapshot, unit_price_paise, making_charges_paise, quantity, refunded_quantity, hallmark_huid_snapshot),
       refunds(id, kind, amount_paise, quantity, reason, created_at)`,
    )
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  if (!data) {
    return { ok: false, code: "not_found" };
  }
  return {
    ok: true,
    data: {
      id: data.id,
      order_number: data.order_number,
      order_year: data.order_year,
      status: data.status,
      subtotal_paise: data.subtotal_paise,
      making_charges_paise: data.making_charges_paise,
      gst_paise: data.gst_paise,
      total_paise: data.total_paise,
      gst_metal_bps: data.gst_metal_bps,
      gst_making_bps: data.gst_making_bps,
      created_at: data.created_at,
      items: data.order_items,
      refunds: data.refunds,
    },
  };
}

/** A6 inventory — directly set a product's stock_quantity (admin only). */
export async function setProductStock(productId: string, qty: number): Promise<void> {
  const auth = await requireAdmin();
  if (!auth.ok) return;
  z.string().uuid().parse(productId);
  z.number().int().min(0).parse(qty);
  const { error } = await auth.supabase
    .from("products")
    .update({ stock_quantity: qty })
    .eq("id", productId);
  if (error) throw error;
  revalidatePath("/admin/inventory");
}
