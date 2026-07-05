/**
 * Zod schema for a Collection (PRD 07-01) — a curated, cross-category group of
 * Products. Carries merchandising metadata only; NEVER a price (ADR-0007).
 */

import { z } from "zod";

export const collectionInputSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be kebab-case"),
  display_name: z.string().min(1),
  description: z.string().nullish(),
  hero_image: z.string().nullish(),
  sort_order: z.number().int().nonnegative().default(0),
  is_active: z.boolean().default(true),
  meta_title: z.string().nullish(),
  meta_description: z.string().nullish(),
});

export type CollectionInput = z.infer<typeof collectionInputSchema>;
