/**
 * Zod schemas for Cart operations (PRD 03).
 *
 * The Cart stores no prices — only a Product reference and a quantity (ADR-0002).
 * These validate the *inputs* to the cart Server Actions; quantities are further
 * clamped to the Product's `stock_quantity` by the action itself (a soft UX
 * clamp — the hard reservation is Checkout's job, ADR-0001), so the schema only
 * enforces the shape, not stock.
 *
 * `product_id` / `cart_item_id` are UUIDs (the Postgres primary keys). Quantity
 * is a positive integer (the `cart_items.quantity > 0` CHECK); a zero/negative
 * quantity is a remove, not an update, and is rejected here.
 */

import { z } from "zod";

/** A positive integer quantity (mirrors the `cart_items.quantity > 0` CHECK). */
const positiveQuantity = z
  .number()
  .int("quantity must be a whole number")
  .positive("quantity must be greater than 0");

/** Add a Product (or a specific Variant) to the Cart. */
export const addToCartSchema = z.object({
  product_id: z.string().uuid(),
  quantity: positiveQuantity.default(1),
  variant_id: z.string().uuid().nullish(),
});

export type AddToCartInput = z.infer<typeof addToCartSchema>;

/** Set a Cart line's quantity to an absolute value (not a delta). */
export const updateCartItemQuantitySchema = z.object({
  cart_item_id: z.string().uuid(),
  quantity: positiveQuantity,
});

export type UpdateCartItemQuantityInput = z.infer<
  typeof updateCartItemQuantitySchema
>;

/** Remove a Cart line outright. */
export const removeCartItemSchema = z.object({
  cart_item_id: z.string().uuid(),
});

export type RemoveCartItemInput = z.infer<typeof removeCartItemSchema>;
