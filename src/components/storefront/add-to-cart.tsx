"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { addToCart, type ActionResult } from "@/app/actions/cart";
import type { CartLineResult } from "@/lib/cart/store";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * Add-to-cart island (C3): quantity stepper + charcoal CTA over the
 * `addToCart` action's discriminated result. Stock clamping surfaces inline
 * (PRD story 8); a guest's first add lazily creates the anonymous session
 * server-side (ADR-0014).
 */
export function AddToCart({
  productId,
  maxQuantity,
  variantId,
  compact = false,
}: {
  productId: string;
  maxQuantity: number;
  variantId?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [qty, setQty] = useState(1);
  const [state, formAction, pending] = useActionState<
    { requested: number; result: ActionResult<CartLineResult> } | null,
    FormData
  >(
    async () => ({
      requested: qty,
      result: await addToCart({ product_id: productId, quantity: qty, variant_id: variantId }),
    }),
    null,
  );
  const result = state?.result ?? null;

  useEffect(() => {
    if (result?.ok === true) {
      // Refresh server components so the header cart count bumps.
      router.refresh();
    }
  }, [result, router]);

  // Any server clamp: the action succeeded but returned fewer than requested
  // (stock may have dropped below the prop-provided max since render).
  const clamped =
    state !== null &&
    state.result.ok &&
    state.result.data.quantity < state.requested;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex items-stretch gap-3">
        {!compact && (
          <div className="flex items-stretch border">
            <button
              type="button"
              aria-label="Decrease quantity"
              className="w-10 cursor-pointer transition-colors hover:text-gold disabled:opacity-40"
              disabled={qty <= 1 || pending}
              onClick={() => setQty((q) => Math.max(1, q - 1))}
            >
              −
            </button>
            <span className="ledger flex w-12 items-center justify-center border-x text-base">
              {qty}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              className="w-10 cursor-pointer transition-colors hover:text-gold disabled:opacity-40"
              disabled={qty >= maxQuantity || pending}
              onClick={() => setQty((q) => Math.min(maxQuantity, q + 1))}
            >
              +
            </button>
          </div>
        )}
        <Button type="submit" width="full" disabled={pending} aria-busy={pending} className={compact ? "" : "flex-1"}>
          {pending ? "Adding…" : "Add to Cart"}
        </Button>
      </div>
      {result?.ok === true && (
        <p className="text-sm">
          Added to your tray.{" "}
          <Link href="/cart" className="underline transition-colors hover:text-gold">
            View tray
          </Link>
          {clamped && (
            <span className="mt-1 block text-muted-foreground">
              Only {result.data.quantity} available — quantity adjusted
            </span>
          )}
        </p>
      )}
      {result?.ok === false && (
        <p className="text-sm text-destructive">
          {result.code === "not_found"
            ? "This piece is no longer available."
            : "Could not add to your tray — please try again."}
        </p>
      )}
    </form>
  );
}
