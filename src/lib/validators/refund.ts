/**
 * Zod schemas for the admin Refund + fulfillment surface (PRD 05).
 *
 * Two refund shapes, kept categorically distinct (ADR-0004):
 *   - **item** refund — one or more order items, each with a unit quantity. The
 *     amount is RECOMPUTED server-side from the Order's frozen snapshot
 *     (ADR-0003/0005); the client never sends an amount, so it cannot dictate
 *     the refund total. Restocks each item.
 *   - **goodwill** refund — an arbitrary Paise amount not tied to an item.
 *     Restocks nothing. The amount IS client-supplied here (it is a discretionary
 *     adjustment), validated as positive integer Paise (ADR-0006).
 *
 * Refund is never Cancel: there is no "cancel a paid order" payload here. The
 * fulfillment schema only names a target status; the legal transition is
 * enforced by the shared state machine, not by Zod.
 */

import { z } from "zod";

/** A UUID, mirroring the DB's uuid primary keys (ADR-0012/0013). */
const uuid = z.string().uuid();

/** One line of an item refund: which order item, how many units. */
export const refundItemLineSchema = z.object({
  order_item_id: uuid,
  quantity: z
    .number()
    .int("refund quantity must be a whole number of units")
    .positive("refund quantity must be at least 1"),
});

export type RefundItemLine = z.infer<typeof refundItemLineSchema>;

/**
 * An item refund: the Order plus one or more item lines. No amount — the server
 * recomputes it from the snapshot (ADR-0003/0005). `reason` is free text for the
 * `refunds` row + audit trail.
 */
export const itemRefundSchema = z.object({
  order_id: uuid,
  items: z
    .array(refundItemLineSchema)
    .min(1, "an item refund must name at least one order item"),
  reason: z.string().max(500).optional(),
});

export type ItemRefundInput = z.infer<typeof itemRefundSchema>;

/**
 * A goodwill/adjustment refund: an arbitrary Paise amount, no item, no restock
 * (ADR-0004). The amount is the only money the admin sets directly.
 */
export const goodwillRefundSchema = z.object({
  order_id: uuid,
  amount_paise: z
    .number()
    .int("amount must be integer Paise")
    .positive("a goodwill refund must be a positive amount"),
  reason: z.string().min(1, "Reason is required for goodwill refunds").max(500),
});

export type GoodwillRefundInput = z.infer<typeof goodwillRefundSchema>;

/** The fulfillment targets an admin can advance a paid Order toward (ADR-0009). */
export const fulfillmentTargetSchema = z.enum([
  "processing",
  "shipped",
  "delivered",
]);

/** Advance an Order's fulfillment to a target status (validated by the machine). */
export const advanceFulfillmentSchema = z.object({
  order_id: uuid,
  to: fulfillmentTargetSchema,
});

export type AdvanceFulfillmentInput = z.infer<typeof advanceFulfillmentSchema>;
