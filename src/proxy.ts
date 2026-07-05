import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy (Next 16; the renamed Middleware) — PRD 06 §1.5.
 *
 * Two jobs, both optimistic UX only:
 * 1. Refresh the Supabase session on every matched request (the documented
 *    `@supabase/ssr` pattern: `getClaims()` re-issues expired tokens and the
 *    `setAll` below propagates the refreshed cookies to browser and render).
 * 2. Redirect visitors without the admin claim away from `/admin/*`.
 *
 * Real enforcement lives in `requireAdmin()` inside every admin action and in
 * RLS — the Proxy is never the security boundary (Next docs: "optimistic
 * checks" only).
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Always call: refreshes an expired session as a side effect.
  const { data } = await supabase.auth.getClaims();

  if (request.nextUrl.pathname.startsWith("/admin")) {
    const role = (
      data?.claims.app_metadata as { user_role?: string } | undefined
    )?.user_role;
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return response;
}

export const config = {
  // Skip static assets and the Stripe webhook (signature-verified, no session).
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/webhooks|.*\\.(?:png|jpg|jpeg|webp|svg|ico)$).*)",
  ],
};
