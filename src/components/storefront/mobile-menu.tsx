"use client";

import Link from "next/link";
import { useState } from "react";
import type { FacetOption, CollectionRow } from "@/lib/shop/data";

const links = [
  { href: "/shop?material=gold", label: "Gold" },
  { href: "/shop?material=silver", label: "Silver" },
  { href: "/shop", label: "The Collection" },
  { href: "/account", label: "Account" },
];

/** Mobile nav (design handoff §2): hamburger of three 18×1px ink lines.
 * Mirrors the desktop mega-menu — category + collection sections inline. */
export function MobileMenu({
  categories,
  collections,
}: {
  categories: FacetOption[];
  collections: CollectionRow[];
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        className="flex cursor-pointer flex-col gap-1 py-2"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="h-px w-[18px] bg-foreground" />
        <span className="h-px w-[18px] bg-foreground" />
        <span className="h-px w-[18px] bg-foreground" />
      </button>
      {open && (
        <nav className="absolute inset-x-0 top-full z-10 flex max-h-[80vh] flex-col overflow-y-auto border-b bg-card">
          {links.map((l) => (
            <Link
              key={l.label}
              href={l.href}
              className="eyebrow border-t px-4 py-4"
              onClick={close}
            >
              {l.label}
            </Link>
          ))}
          <p className="eyebrow border-t px-4 pt-4 text-muted-foreground">
            By Category
          </p>
          {categories.map((c) => (
            <Link
              key={c.id}
              href={`/shop?category=${c.slug}`}
              className="px-4 py-2.5 font-display text-md tracking-[-0.02em]"
              onClick={close}
            >
              {c.display_name}
            </Link>
          ))}
          {collections.length > 0 && (
            <>
              <p className="eyebrow border-t px-4 pt-4 text-muted-foreground">
                Collections
              </p>
              {collections.map((col) => (
                <Link
                  key={col.id}
                  href={`/collections/${col.slug}`}
                  className="px-4 py-2.5 font-display text-md tracking-[-0.02em]"
                  onClick={close}
                >
                  {col.display_name}
                </Link>
              ))}
            </>
          )}
        </nav>
      )}
    </div>
  );
}
