/**
 * Shared admin-action helpers (PRD 07+). Plain module (NOT "use server") so it
 * can export the sync `fieldErrorsOf`, the `ActionResult` type, and the
 * `requireAdmin` guard — a "use server" module may export only async functions.
 *
 * Authorization mirrors `catalog.ts` (ADR-0012): read the verified JWT admin
 * claim and reject non-admins before touching the DB. RLS is the real boundary;
 * this turns an opaque RLS denial into a clean typed result. New action files
 * (collections, media, gemstone, variants) import these instead of re-declaring
 * them. (`catalog.ts` predates this module and keeps its own private copies —
 * left untouched per the surgical-changes rule.)
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Discriminated result so callers handle each failure mode explicitly. */
export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "unauthorized" }
  | { ok: false; code: "invalid"; fieldErrors: Record<string, string[]> }
  | { ok: false; code: "error"; message: string };

/** Resolve admin status from the verified JWT claims; returns the client too. */
export async function requireAdmin(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>> }
  | { ok: false }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data) {
    return { ok: false };
  }
  const role = (data.claims.app_metadata as { user_role?: string } | undefined)
    ?.user_role;
  if (role !== "admin") {
    return { ok: false };
  }
  return { ok: true, supabase };
}

/**
 * Resolve the signed-in user (any role, incl. anonymous guests) from the
 * verified session. For customer-owned writes (addresses, wishlists, …) where
 * RLS keys on `auth.uid() = user_id`; returns the client + uid.
 */
export async function requireUser(): Promise<
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; userId: string }
  | { ok: false }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { ok: false };
  }
  return { ok: true, supabase, userId: data.user.id };
}

/** Map a Zod error to a flat `{ path: messages[] }` for form display. */
export function fieldErrorsOf(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
