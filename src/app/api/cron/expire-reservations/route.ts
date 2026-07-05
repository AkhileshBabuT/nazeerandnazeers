/**
 * Reservation expiry sweep (PRD 04) — GET /api/cron/expire-reservations.
 *
 * The 15-minute Reservation expiry (ADR-0001): for every `active` Reservation
 * past its expiry whose Order is still `pending`, release the stock and
 * transition the Order `pending → cancelled`, all audited. The work is the
 * atomic `expire_reservations` RPC (migration 20260608000004); this route just
 * triggers it on a schedule and is also safe to call on-access.
 *
 * Scheduled by Vercel Cron (see vercel.json: every minute). Vercel Cron sends a
 * GET with an `Authorization: Bearer ${CRON_SECRET}` header; we require it when
 * `CRON_SECRET` is configured so a public hit cannot drive the sweep. Route
 * Handlers are uncached and run per-request here, which is what a cron needs.
 */

import { sweepExpiredReservations } from "@/lib/orders/service";

export async function GET(request: Request): Promise<Response> {
  // Fail closed: in production the Cron secret is mandatory so the sweep can
  // never be driven by an unauthenticated public hit. Locally (no secret) it
  // stays open for dev, matching the on-access-safe design.
  const secret = process.env.CRON_SECRET;
  if (process.env.NODE_ENV === "production" && !secret) {
    return Response.json({ error: "Server misconfigured." }, { status: 500 });
  }
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const cancelled = await sweepExpiredReservations();
    return Response.json({ ok: true, cancelled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sweep failed.";
    return Response.json({ ok: false, error: message }, { status: 500 });
  }
}
