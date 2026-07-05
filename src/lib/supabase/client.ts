import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

/**
 * Browser-side Supabase client for use in Client Components.
 *
 * Cookie handling is managed automatically by `@supabase/ssr` in the browser
 * (it reads/writes `document.cookie`), so no custom cookie methods are needed.
 *
 * Typed against the generated `Database` schema (./database.types.ts) so all
 * `.from(...)` queries are checked against the real tables/columns.
 */
export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "See .env.example.",
    );
  }

  return createBrowserClient<Database>(url, anonKey);
}
