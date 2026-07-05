import Link from "next/link";
import { notFound } from "next/navigation";
import { getCollectionWithProducts } from "@/lib/shop/data";
import { ProductCard } from "@/components/storefront/product-card";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getCollectionWithProducts(slug);
  if (!data) {
    return { title: "Collection" };
  }
  return {
    title: data.collection.meta_title ?? data.collection.display_name,
    description:
      data.collection.meta_description ??
      data.collection.description ??
      undefined,
  };
}

/**
 * Storefront collection detail `/collections/[slug]` (PRD 08 — surfacing
 * 07-01 data). The curated edit's active pieces in admin-defined order. Unknown
 * / inactive slug → 404. Reuses ProductCard (live price/stock streams uncached).
 */
export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getCollectionWithProducts(slug);
  if (!data) {
    notFound();
  }
  const { collection, products } = data;

  return (
    <div className="px-4 pt-10 md:px-12 md:pt-14">
      <p className="eyebrow text-xs text-muted-foreground">
        <Link href="/shop" className="transition-colors hover:text-gold">SHOP</Link>
        {" · "}
        <Link href="/collections" className="transition-colors hover:text-gold">COLLECTIONS</Link>
        {" · "}
        <span>{collection.display_name.toUpperCase()}</span>
      </p>
      <h1 className="mt-3.5 font-display text-[42px] font-medium tracking-[-0.02em]">
        {collection.display_name}
      </h1>
      {collection.description && (
        <p className="mt-2.5 max-w-[620px] text-[15px] leading-[1.6] text-muted-foreground">
          {collection.description}
        </p>
      )}
      <div className="mt-7 border-b border-border" />

      {products.length === 0 ? (
        <p className="py-24 text-center font-display text-lg italic">
          No pieces in this collection yet
        </p>
      ) : (
        <div className="mb-8 mt-6 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
