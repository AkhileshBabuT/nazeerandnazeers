"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { FacetOption, CollectionRow } from "@/lib/shop/data";
import { cn } from "@/lib/utils";

/**
 * Desktop "Shop" mega-menu (compass §4: minimal nav with a category mega-menu).
 * Server-fed category + collection lists; opens on hover or keyboard. The panel
 * links are only in the DOM while open, so Tab order is clean, and Escape /
 * click-away / selecting a link all close it.
 */
export function ShopMenu({
  categories,
  collections,
}: {
  categories: FacetOption[];
  collections: CollectionRow[];
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div
      ref={containerRef}
      className="static md:relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "eyebrow border-b border-transparent pb-px transition-colors hover:border-gold hover:text-gold",
          open && "border-gold text-gold",
        )}
      >
        Shop
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-20 mt-4 border-y bg-card px-4 py-8 md:inset-x-auto md:left-0 md:w-[420px] md:rounded-xs md:border md:px-8">
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="eyebrow text-muted-foreground">By Category</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {categories.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/shop?category=${c.slug}`}
                      onClick={close}
                      className="font-display text-md tracking-[-0.02em] transition-colors hover:text-gold"
                    >
                      {c.display_name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow text-muted-foreground">Collections</p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {collections.length === 0 ? (
                  <li className="text-sm text-muted-foreground">
                    Coming soon
                  </li>
                ) : (
                  collections.map((col) => (
                    <li key={col.id}>
                      <Link
                        href={`/collections/${col.slug}`}
                        onClick={close}
                        className="font-display text-md tracking-[-0.02em] transition-colors hover:text-gold"
                      >
                        {col.display_name}
                      </Link>
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>
          <Link
            href="/shop"
            onClick={close}
            className="eyebrow mt-8 inline-block border-b border-foreground pb-1 transition-colors hover:border-gold hover:text-gold"
          >
            View all pieces
          </Link>
        </div>
      )}
    </div>
  );
}
