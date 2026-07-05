"use client";

import { useRouter, usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWishlistToggle } from "./use-wishlist-toggle";

export function WishlistHeart({ productId }: { productId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const { saved, pending, toggle } = useWishlistToggle(productId, () =>
    router.push(`/login?next=${encodeURIComponent(pathname)}`),
  );

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending || saved === null}
      aria-label={saved ? "Remove from saved pieces" : "Save this piece"}
      aria-pressed={saved === true}
      className={cn(
        "absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full border bg-background/80 text-base backdrop-blur-sm transition-colors disabled:opacity-50",
        saved
          ? "border-gold text-gold"
          : "border-transparent text-muted-foreground hover:border-gold hover:text-gold",
      )}
    >
      <span aria-hidden>{saved ? "♥" : "♡"}</span>
    </button>
  );
}
