import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "@/components/auth/login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = next?.startsWith("/") === true ? next : "/account";

  // Signed-in visitors don't need the form (PRD C10).
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) {
    redirect(target);
  }

  return (
    <>
      <h1 className="mb-7 mt-9 text-center font-display text-3xl tracking-[-0.02em]">
        Welcome back
      </h1>
      <LoginForm next={target} />
      <div className="my-7 h-px bg-border" />
      <p className="text-center text-xs text-muted-foreground">
        New here?{" "}
        <Link
          href={`/sign-up${next !== undefined ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="border-b border-foreground pb-0.5 text-foreground transition-colors hover:border-gold hover:text-gold"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
