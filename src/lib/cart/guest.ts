/**
 * Guest identity — lazy anonymous sign-in for the Cart (ADR-0014, PRD 03).
 *
 * A Guest is an unauthenticated visitor who is signed in **anonymously**
 * (Supabase Anonymous Sign-ins) the moment they need a Cart. They get a real
 * JWT with a stable `auth.uid()` and the same `authenticated` Postgres role as
 * a logged-in Customer, so the one `auth.uid() = user_id` RLS model covers
 * everyone — no service-role path for Guests.
 *
 * `enable_anonymous_sign_ins = true` and `enable_manual_linking = true` are set
 * in supabase/config.toml (locally) and must be enabled on hosted Supabase too
 * (noted in .env.example). The API surface (`signInAnonymously`,
 * `getUser`/`getSession`) was verified against current Supabase docs, per
 * ADR-0014 ("not trusted from memory").
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/database.types";

export type ServerSupabase = SupabaseClient<Database>;

/**
 * Return the current user's id, signing the visitor in anonymously first if
 * they have no session. Idempotent: an already-authenticated Customer or Guest
 * keeps their existing `auth.uid()` and is never re-signed-in.
 *
 * Used by every Cart **write** so a Guest gets a real identity on their first
 * `addToCart` (PRD story 1). Reads (`getCart`) do not sign anyone in — an
 * unauthenticated visitor simply has an empty Cart.
 *
 * Throws if anonymous sign-in fails (e.g. the project has anonymous sign-ins
 * disabled) — failing loudly is correct; we never fabricate an identity.
 */
export async function ensureUserId(supabase: ServerSupabase): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (userData.user) {
    return userData.user.id;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    throw error;
  }
  if (!data.user) {
    throw new Error("Anonymous sign-in returned no user.");
  }
  return data.user.id;
}
