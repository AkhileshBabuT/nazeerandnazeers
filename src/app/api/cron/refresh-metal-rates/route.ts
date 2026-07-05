/**
 * Daily metal-rate refresh — GET /api/cron/refresh-metal-rates.
 *
 * Fetches the latest XAU/XAG spot prices and USD/INR rate from MetalpriceAPI,
 * converts them to paise-per-gram, and appends two rows to `metal_rates`
 * (one for gold, one for silver). Latest-row-wins semantics (ADR-0008) mean
 * the new rows immediately become the live rates.
 *
 * Scheduled by Vercel Cron (see vercel.json: 03:00 UTC daily). Vercel Cron
 * sends a GET with an `Authorization: Bearer ${CRON_SECRET}` header; we
 * require it when `CRON_SECRET` is configured so a public hit is rejected.
 */

import {
  paisFromMetalpriceRates,
  type MetalpriceRates,
} from "@/lib/admin/metal-rates-cron";
import { createServiceClient } from "@/lib/supabase/service";

export async function GET(request: Request): Promise<Response> {
  // Fail closed: in production the Cron secret is mandatory, so a missing env var
  // can never leave this endpoint publicly triggerable (it burns the metal-rate
  // API quota and appends rows). Locally (no secret) it stays open for dev.
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) {
    return Response.json({ error: "Server misconfigured." }, { status: 500 });
  }
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const response = await fetch(
      `https://api.metalpriceapi.com/v1/latest?api_key=${process.env.metalprice_api}&base=USD&currencies=XAU,XAG,INR`,
    );
    const data = (await response.json()) as {
      success: boolean;
      rates: MetalpriceRates;
      error?: string;
    };
    if (!response.ok || !data.success) {
      throw new Error(data.error ?? response.statusText);
    }

    const { gold_paise, silver_paise } = paisFromMetalpriceRates(data.rates);

    const db = createServiceClient();

    const { error: insertError } = await db.from("metal_rates").insert([
      { material: "gold", rate_per_gram_paise: gold_paise, source: "metalprice-api" },
      { material: "silver", rate_per_gram_paise: silver_paise, source: "metalprice-api" },
    ]);
    if (insertError) throw new Error(insertError.message);

    return Response.json({ ok: true, gold_paise, silver_paise });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Refresh failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
