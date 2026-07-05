/**
 * Zod schemas for Product pricing inputs (ADR-0007) and shared domain enums.
 *
 * These validate the *inputs* a Product carries — never a price (price is
 * computed by lib/pricing.ts). Money fields are integer Paise (ADR-0006);
 * `weight_grams` is a decimal string mirroring the Postgres `numeric` column so
 * it never touches a float on the way in.
 */

import { z } from "zod";

export const materialSchema = z.enum(["gold", "silver"]);
export const makingChargeTypeSchema = z.enum(["flat", "percent"]);

/** A non-negative integer Paise / basis-points value. */
const nonNegativeInt = z.number().int().nonnegative();

/** A positive integer Paise value (rates, etc.). */
const positiveInt = z.number().int().positive();

/** Decimal weight in grams, e.g. "7.350" — kept as a string (no float). */
export const weightGramsSchema = z
  .string()
  .regex(/^\d+(\.\d{1,3})?$/, "weight_grams must be a decimal with up to 3 dp")
  .refine((v) => Number(v) > 0, "weight_grams must be greater than 0");

/**
 * Product pricing inputs. Gold requires a `purity_karat` (1–24) and a
 * `hallmark_huid`; silver carries neither (purity_factor = 1.0). Mirrors the
 * CHECK constraints on `public.products`.
 */
export const productInputSchema = z
  .object({
    sku: z.string().min(1),
    name: z.string().min(1),
    description: z.string().nullish(),
    material: materialSchema,
    category_id: z.uuid(),
    audience_id: z.uuid(),
    weight_grams: weightGramsSchema,
    purity_karat: z.number().int().min(1).max(24).nullish(),
    making_charge_type: makingChargeTypeSchema,
    making_charge_value: nonNegativeInt, // flat → Paise; percent → bps
    hallmark_huid: z.string().nullish(),
    stock_quantity: z.number().int().nonnegative().default(0),
    is_active: z.boolean().default(true),
  })
  .refine(
    (p) => p.material !== "gold" || p.purity_karat != null,
    { message: "Gold products require purity_karat", path: ["purity_karat"] },
  )
  .refine(
    (p) => p.material !== "gold" || (p.hallmark_huid?.length ?? 0) > 0,
    { message: "Gold products require hallmark_huid", path: ["hallmark_huid"] },
  );

export type ProductInput = z.infer<typeof productInputSchema>;

/** A Metal Rate to be appended to the append-only time-series (ADR-0008). */
export const metalRateInputSchema = z.object({
  material: materialSchema,
  rate_per_gram_paise: positiveInt,
  source: z.string().nullish(),
  effective_at: z.string().datetime().optional(),
});

export type MetalRateInput = z.infer<typeof metalRateInputSchema>;

