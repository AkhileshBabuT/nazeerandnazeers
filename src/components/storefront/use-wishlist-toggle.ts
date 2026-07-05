"use client";

import { useEffect, useState, useTransition } from "react";
import { toggleWishlist, isWishlisted } from "@/app/actions/wishlist";

/** Shared brain for WishlistButton (PDP) and WishlistHeart (product card). */
export function useWishlistToggle(
  productId: string,
  onUnauthorized: () => void,
) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    isWishlisted(productId).then((v) => {
      if (alive) setSaved(v);
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  const toggle = () =>
    startTransition(async () => {
      const res = await toggleWishlist(productId);
      if (res.ok) {
        setSaved(res.data.wishlisted);
      } else if (res.code === "unauthorized") {
        onUnauthorized();
      }
    });

  return { saved, pending, toggle };
}
