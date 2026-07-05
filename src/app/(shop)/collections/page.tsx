import Link from "next/link";
import { listCollections } from "@/lib/shop/data";

export const metadata = { title: "Collections" };

/**
 * Storefront collections index `/collections` (PRD 08 — surfacing 07-01 data).
 * Curated, cross-category edits. Reuses the shop page's gallery-wall language.
 */
export default async function CollectionsPage() {
  const collections = await listCollections();

  return (
    <div className="px-4 pt-10 md:px-12 md:pt-14">
      <div className="flex items-baseline justify-between border-b pb-3.5">
        <h1 className="font-display text-2xl tracking-[-0.02em]">Collections</h1>
        <span className="ledger text-xs uppercase text-muted-foreground">
          {String(collections.length).padStart(2, "0")} edits
        </span>
      </div>

      {collections.length === 0 ? (
        <div className="flex flex-col items-center py-24">
          <span className="h-12 w-12 rounded-full border border-foreground/30" />
          <p className="mt-6 font-display text-lg italic">
            No collections yet — curated edits are on the way
          </p>
          <Link
            href="/shop"
            className="eyebrow mt-8 border border-primary px-6 py-3 transition-colors hover:border-gold hover:text-gold"
          >
            View all pieces
          </Link>
        </div>
      ) : (
        <div className="mb-8 mt-6 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          {collections.map((c) => (
            <Link
              key={c.id}
              href={`/collections/${c.slug}`}
              className="group block border transition-colors hover:border-gold"
            >
              <div
                className="flex aspect-[4/5] items-center justify-center bg-secondary bg-cover bg-center text-foreground/20"
                style={
                  c.hero_image
                    ? { backgroundImage: `url(${c.hero_image})` }
                    : undefined
                }
              >
                {!c.hero_image && "N&N"}
              </div>
              <div className="p-4">
                <h2 className="font-display text-lg tracking-[-0.01em] transition-colors group-hover:text-gold">
                  {c.display_name}
                </h2>
                {c.description && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {c.description}
                  </p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
