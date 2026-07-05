"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { mergeGuestCart } from "@/app/actions/cart";
import { Button } from "@/components/ui/button";
import { UnderlineField } from "./underline-field";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    const supabase = createClient();

    // ADR-0014: capture the anonymous uid BEFORE the session swap so the
    // guest cart can be merged into the account cart.
    const { data: pre } = await supabase.auth.getUser();
    const guestUserId = pre.user?.is_anonymous ? pre.user.id : null;

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setPending(false);
      return;
    }
    if (guestUserId !== null) {
      // Merge failure is tolerated silently (PRD C10): max-not-sum,
      // stock-clamped; the worst case is the guest tray is left behind.
      try {
        await mergeGuestCart(guestUserId);
      } catch {
        // ignore
      }
    }
    router.push(next);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
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
        autoComplete="current-password"
        required
      />
      {error !== null && (
        <p className="border border-destructive px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" width="full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
