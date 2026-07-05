"use client";

import Link from "next/link";

export default function ShopError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 text-center md:px-0">
      <h1 className="font-display text-xl tracking-[-0.02em]">
        We couldn&rsquo;t load this page
      </h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Something went wrong. Please try again.
      </p>
      <div className="mt-8 flex items-center justify-center gap-4">
        <button
          onClick={reset}
          className="inline-flex h-9 items-center bg-primary px-4 text-sm text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
        <Link
          href="/shop"
          className="text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-gold"
        >
          Browse pieces
        </Link>
      </div>
    </div>
  );
}
