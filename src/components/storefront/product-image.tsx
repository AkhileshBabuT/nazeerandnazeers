"use client";

import Image from "next/image";
import { useState } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

/** Public Supabase Storage URL for a product photo, keyed by SKU. */
export function productImageUrl(sku: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/product-images/${sku}.png`;
}

/**
 * Product photo (Supabase Storage, optimized through next/image) in a 4:5
 * frame. The engraved N&N monogram is the graceful fallback: a product with no
 * uploaded image — or a transient load failure — shows the placeholder, never a
 * broken <img>. Client component because `onError` needs the browser.
 */
export function ProductImage({
  sku,
  alt,
  sizes = "(min-width: 768px) 33vw, 100vw",
  eager = false,
}: {
  sku: string;
  alt: string;
  sizes?: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <MonogramField />;
  }

  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-secondary">
      <Image
        src={productImageUrl(sku)}
        alt={alt}
        fill
        sizes={sizes}
        loading={eager ? "eager" : "lazy"}
        className="object-cover"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/** G1 placeholder: warm stone field with an engraved-line monogram glyph. */
function MonogramField() {
  return (
    <div className="flex aspect-[4/5] items-center justify-center bg-secondary">
      <span className="flex h-16 w-16 items-center justify-center rounded-full border border-foreground/15 font-display text-md text-foreground/20">
        N&amp;N
      </span>
    </div>
  );
}
