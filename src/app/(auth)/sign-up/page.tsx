import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata = { title: "Create an account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = next?.startsWith("/") === true ? next : "/account";

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user && !data.user.is_anonymous) {
    redirect(target);
  }

  return (
    <>
      <h1 className="mb-7 mt-9 text-center font-display text-3xl tracking-[-0.02em]">
        Create an account
      </h1>
      <SignUpForm next={target} />
      <div className="my-7 h-px bg-border" />
      <p className="text-center text-xs text-muted-foreground">
        Already have an account?{" "}
        <Link
          href={`/login${next !== undefined ? `?next=${encodeURIComponent(next)}` : ""}`}
          className="border-b border-foreground pb-0.5 text-foreground transition-colors hover:border-gold hover:text-gold"
        >
          Sign in
        </Link>
      </p>
    </>
  );
}
