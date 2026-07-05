import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { AdminNav } from "@/components/admin/admin-nav";

/**
 * A0 Admin gate + chrome. The layout gate is UX only: `requireAdmin()` inside
 * every admin action + RLS are the real boundary (ADR-0012). Non-admins get a
 * plain 404 — the panel is not advertised. The async gate sits inside Suspense
 * so the route still satisfies Cache Components' dynamic-IO rules.
 */
export default function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <Suspense fallback={null}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const role = (
    data?.claims.app_metadata as { user_role?: string } | undefined
  )?.user_role;
  if (error || role !== "admin") {
    notFound();
  }
  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r bg-secondary">
        <div className="eyebrow border-b px-5 py-6 font-medium tracking-[0.12em] text-foreground">
          N&amp;N · Admin
        </div>
        <AdminNav />
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8 text-sm">{children}</main>
    </div>
  );
}
