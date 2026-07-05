import { z } from "zod";

export const shippingMethodSchema = z.object({
  name: z.string().min(1, "name is required").max(120),
  description: z.string().max(500).default(""),
  base_rate_paise: z
    .number()
    .int("must be a whole number")
    .min(0, "cannot be negative"),
  per_gram_paise: z
    .number()
    .int("must be a whole number")
    .min(0, "cannot be negative"),
  free_above_paise: z
    .number()
    .int("must be a whole number")
    .min(1, "must be positive if set")
    .nullable()
    .optional(),
  is_active: z.boolean().default(true),
});

export type ShippingMethodInput = z.infer<typeof shippingMethodSchema>;
