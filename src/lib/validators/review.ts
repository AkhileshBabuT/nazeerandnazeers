/**
 * Zod schema for a product Review (PRD 08). Rating 1–5; optional title/body.
 * No price. Moderation (`is_approved`) and ownership are enforced by the action
 * + RLS, never trusted from the client.
 */

import { z } from "zod";

export const reviewInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().max(120).nullish(),
  body: z.string().max(2000).nullish(),
});

export type ReviewInput = z.infer<typeof reviewInputSchema>;
