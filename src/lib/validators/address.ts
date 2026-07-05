/**
 * Zod schema for a saved customer Address (PRD 08). Reuses the checkout
 * `shippingAddressSchema` shape (so a saved address can autofill checkout) plus
 * an `is_default` flag. No price — an address is contact data only.
 */

import { z } from "zod";
import { shippingAddressSchema } from "./checkout";

export const addressInputSchema = shippingAddressSchema.extend({
  is_default: z.boolean().default(false),
});

export type AddressInput = z.infer<typeof addressInputSchema>;
