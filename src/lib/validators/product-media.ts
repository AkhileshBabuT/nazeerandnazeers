/**
 * Zod schema for Product media gallery rows (PRD 07-02). Images carry display
 * metadata only — never a price (ADR-0007).
 */

import { z } from "zod";

export const mediaItemSchema = z.object({
  url: z.string().min(1, "URL is required"),
  alt_text: z.string().nullish(),
  is_primary: z.boolean().default(false),
  sort_order: z.number().int().nonnegative().default(0),
});

export const productMediaSchema = z.array(mediaItemSchema);

export type MediaItemInput = z.infer<typeof mediaItemSchema>;
