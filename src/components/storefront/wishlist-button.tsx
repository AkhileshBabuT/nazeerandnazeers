"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWishlistToggle } from "./use-wishlist-toggle";

export function WishlistButton({ productId }: { productId: string }) {
  const pathname = usePathname();
  const [needAuth, setNeedAuth] = useState(false);
  const { saved, pending, toggle } = useWishlistToggle(productId, () =>
    setNeedAuth(true),
  );

  if (needAuth) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="eyebrow inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-gold"
      >
        <span aria-hidden>♡</span> Sign in to save
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || saved === null}
      aria-pressed={saved === true}
      className={cn(
        "eyebrow inline-flex items-center gap-2 transition-colors disabled:opacity-50",
        saved ? "text-gold" : "text-muted-foreground hover:text-gold",
      )}
    >
      <span aria-hidden>{saved ? "♥" : "♡"}</span>
      {saved ? "Saved" : "Save"}
    </button>
  );
}
