import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * Trusted, SERVER-ONLY Supabase client using the service-role key.
 *
 * Bypasses RLS — use only in trusted server contexts that legitimately need to
 * read/write rows the public/authenticated policies hide. In the catalog this
 * is the `settings` singleton (GST basis points, ADR-0005), which is admin-only
 * readable under RLS yet must be read server-side to compute a live price.
 *
 * Never import this from client-side code: the service-role key must never reach
 * the browser. No cookie/session wiring — this client carries no user identity;
 * it acts with full privilege, so callers must enforce their own authorization
 * before using it for anything beyond reading server-side config.
 *
 * Typed against the generated `Database` schema so `.from(...)` queries are
 * checked against the real tables/columns.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "See .env.example.",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
