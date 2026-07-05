/**
 * Zod schemas for Checkout (PRD 04).
 *
 * `createOrderFromCart` takes two things from the client: the shipping address to
 * snapshot onto the Order (ADR-0003) and the total the client last saw, used by
 * the re-confirm tolerance guard (ADR-0002). Both are validated here before any
 * stock is touched.
 *
 * The seen total is integer Paise (ADR-0006) — a non-negative integer, never a
 * float or a Rupee decimal. The shipping address is a flat, snapshot-friendly
 * shape (the `orders.shipping_address` column is JSONB; this fixes its schema).
 * Shipping rate/courier math is explicitly out of scope (PRD 04 "Out of Scope").
 */

import { z } from "zod";

/** A snapshot-friendly Indian shipping address. Stored as JSONB on the Order. */
export const shippingAddressSchema = z.object({
  full_name: z.string().min(1, "full name is required").max(200),
  phone: z
    .string()
    .min(7, "a valid phone number is required")
    .max(20),
  line1: z.string().min(1, "address line 1 is required").max(200),
  line2: z.string().max(200).optional(),
  city: z.string().min(1, "city is required").max(120),
  state: z.string().min(1, "state is required").max(120),
  /** Indian PIN code: exactly 6 digits. */
  postal_code: z
    .string()
    .regex(/^\d{6}$/, "postal code must be a 6-digit PIN code"),
  country: z.string().min(1).max(120).default("India"),
});

export type ShippingAddress = z.infer<typeof shippingAddressSchema>;

/**
 * The checkout payload. `seen_total_paise` is the live total the client last
 * displayed (integer Paise); the action recomputes the true total and applies
 * the re-confirm tolerance (ADR-0002) before reserving stock.
 */
export const checkoutSchema = z.object({
  shipping_address: shippingAddressSchema,
  seen_total_paise: z
    .number()
    .int("seen total must be integer Paise")
    .nonnegative("seen total must be non-negative"),
  /** Selected shipping method id (ADR-0016). Null = no method selected (shipping = 0). */
  shipping_method_id: z.string().uuid().nullable().optional(),
  /** Applied coupon code (ADR-0017). Null = no coupon. */
  coupon_code: z.string().max(50).trim().nullable().optional(),
});

export type CheckoutInput = z.infer<typeof checkoutSchema>;
