"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

type GalleryImage = { id: string; url: string; alt_text: string | null };

/**
 * PDP image gallery (PRD 08 — surfacing 07-02 media). Main image + thumbnail
 * strip; click a thumbnail to switch. Uses CSS background-image because
 * product_media holds arbitrary admin URLs (unconfigured hosts), so next/image
 * optimization doesn't apply — the SKU-based `ProductImage` (next/image) stays
 * the fallback when a piece has no uploaded gallery.
 */
export function ProductGallery({
  images,
  productName,
}: {
  images: GalleryImage[];
  productName: string;
}) {
  const [active, setActive] = useState(0);
  const current = images[active] ?? images[0]!;

  return (
    <div>
      <div
        role="img"
        aria-label={current.alt_text ?? productName}
        className="aspect-[4/5] w-full bg-secondary bg-cover bg-center"
        style={{ backgroundImage: `url(${current.url})` }}
      />
      {images.length > 1 && (
        <div className="flex gap-2 p-2">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`View image ${i + 1} of ${images.length}`}
              aria-current={i === active}
              className={cn(
                "h-16 w-16 cursor-pointer bg-secondary bg-cover bg-center border transition-colors",
                i === active
                  ? "border-gold"
                  : "border-transparent hover:border-foreground/30",
              )}
              style={{ backgroundImage: `url(${img.url})` }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
