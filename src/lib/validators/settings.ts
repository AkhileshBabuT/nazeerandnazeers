import { z } from "zod";

export const settingsInputSchema = z.object({
  gst_metal_bps: z
    .number()
    .int("must be a whole number")
    .min(0)
    .max(10000, "cannot exceed 100%"),
  gst_making_bps: z
    .number()
    .int("must be a whole number")
    .min(0)
    .max(10000, "cannot exceed 100%"),
  max_rate_age_seconds: z
    .number()
    .int("must be a whole number")
    .min(60, "minimum 60 seconds")
    .max(604800, "maximum 7 days"),
});

export type SettingsInput = z.infer<typeof settingsInputSchema>;
