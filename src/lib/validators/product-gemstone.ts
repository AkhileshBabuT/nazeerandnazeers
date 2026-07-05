/**
 * Zod schema for Product gemstone / certificate rows (PRD 07-07).
 *
 * `carat_weight` is the STONE's carat (mass), distinct from the metal's Purity
 * Karat (`products.purity_karat`). No price here (ADR-0007).
 */

import { z } from "zod";

export const gemstoneItemSchema = z.object({
  gem_type: z.string().min(1, "Stone type is required"),
  carat_weight: z.number().nonnegative().nullish(),
  cut: z.string().nullish(),
  color: z.string().nullish(),
  clarity: z.string().nullish(),
  lab: z.string().nullish(),
  certificate_number: z.string().nullish(),
  laser_inscription: z.string().nullish(),
});

export const productGemstonesSchema = z.array(gemstoneItemSchema);

export type GemstoneItemInput = z.infer<typeof gemstoneItemSchema>;
