import { z } from "zod";

export const couponSchema = z.object({
  code: z
    .string()
    .min(1, "code is required")
    .max(50)
    .transform((s) => s.toUpperCase().trim()),
  discount_type: z.enum(["percent", "flat"]),
  /** percent → basis points (e.g. 1000 = 10%); flat → Paise amount. */
  discount_value: z
    .number()
    .int("must be a whole number")
    .min(1, "must be positive"),
  min_order_paise: z
    .number()
    .int("must be a whole number")
    .min(0)
    .default(0),
  max_uses: z
    .number()
    .int("must be a whole number")
    .min(1)
    .nullable()
    .optional(),
  per_user_limit: z
    .number()
    .int("must be a whole number")
    .min(1)
    .default(1),
  is_active: z.boolean().default(true),
  valid_from: z.string().datetime().optional(),
  valid_until: z.string().datetime().nullable().optional(),
});

export type CouponInput = z.infer<typeof couponSchema>;
