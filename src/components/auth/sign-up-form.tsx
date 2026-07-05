"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { mergeGuestCart } from "@/app/actions/cart";
import { Button } from "@/components/ui/button";
import { UnderlineField } from "./underline-field";

export function SignUpForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);
  const [hasGuestCart, setHasGuestCart] = useState(false);

  useEffect(() => {
    // "Your tray comes with you" note for guests holding an anonymous session.
    createClient()
      .auth.getUser()
      .then(({ data }) => setHasGuestCart(data.user?.is_anonymous === true))
      .catch(() => setHasGuestCart(false));
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = createClient();

    // ADR-0014: capture the anonymous uid BEFORE the session swap.
    const { data: pre } = await supabase.auth.getUser();
    const guestUserId = pre.user?.is_anonymous ? pre.user.id : null;

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
    });
    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }
    if (!data.session) {
      // Email confirmation is on — no session yet, merge happens at login.
      setConfirmSent(true);
      setPending(false);
      return;
    }
    if (guestUserId !== null) {
      try {
        await mergeGuestCart(guestUserId);
      } catch {
        // Merge failure tolerated silently (PRD C10).
      }
    }
    router.push(next);
    router.refresh();
  }

  if (confirmSent) {
    return (
      <p className="border px-4 py-4 text-sm">
        Check your email to confirm your account, then sign in.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      {hasGuestCart && (
        <p className="border px-4 py-3 text-sm text-muted-foreground">
          Your selected pieces will come with you.
        </p>
      )}
      <UnderlineField
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
      />
      <UnderlineField
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
      />
      {error !== null && (
        <p className="border border-destructive px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" width="full" disabled={pending}>
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
