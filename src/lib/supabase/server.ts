import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server-side Supabase client for use in Server Components, Route Handlers,
 * and Server Actions.
 *
 * Uses the `getAll`/`setAll` cookie interface from `@supabase/ssr` (the
 * `get`/`set`/`remove` trio is deprecated in this version). `cookies()` is
 * async in the Next.js App Router, so this function is async too.
 *
 * The `setAll` call is wrapped in try/catch because Server Components cannot
 * write cookies — only Route Handlers, Server Actions, and Middleware can.
 * When called from a Server Component, the write is silently skipped and the
 * Middleware client is responsible for refreshing the session. This is the
 * pattern documented by Supabase for the App Router.
 *
 * Typed against the generated `Database` schema (./database.types.ts) so all
 * `.from(...)` queries are checked against the real tables/columns.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "See .env.example.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component, which cannot set cookies.
          // Session refresh is handled by Middleware instead (Phase 1).
        }
      },
    },
  });
}
