/**
 * Product restock — the ONE place stock is incremented back (the increment-back
 * direction ADR-0001 leaves in app code; decrements stay in the guarded RPCs).
 * Both return paths delegate here: a payment-failure release
 * (service.ts/releaseReservations) and an item refund (admin.ts).
 *
 * Releases only ADD stock, so a read-modify-write carries no oversell race; a
 * guarded decrement is only needed on reserve. That invariant lives here, once.
 * Every restock is audited.
 */

import { createServiceClient } from "../supabase/service";
import { recordAudit } from "./audit";

/** Why stock is coming back; fixes the audit action + details shape. */
export type RestockReason = "payment_failed" | "item_refund";

/**
 * Increment a Product's `stock_quantity` by `quantity` and audit it.
 * `orderItemId` rides on the audit details for the refund path.
 */
export async function restockProduct(args: {
  productId: string;
  quantity: number;
  orderId: string;
  reason: RestockReason;
  orderItemId?: string;
}): Promise<void> {
  const svc = createServiceClient();
  const { data: prod, error: readErr } = await svc
    .from("products")
    .select("stock_quantity")
    .eq("id", args.productId)
    .single();
  if (readErr) {
    throw readErr;
  }
  const { error: updErr } = await svc
    .from("products")
    .update({
      stock_quantity: prod.stock_quantity + args.quantity,
      updated_at: new Date().toISOString(),
    })
    .eq("id", args.productId);
  if (updErr) {
    throw updErr;
  }
  await recordAudit({
    orderId: args.orderId,
    action: args.reason === "item_refund" ? "stock_restocked" : "stock_released",
    entityType: "product",
    entityId: args.productId,
    details: {
      quantity: args.quantity,
      ...(args.orderItemId ? { order_item_id: args.orderItemId } : {}),
      reason: args.reason,
    },
  });
}
