import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { toCatalogDetail, type ProductRow } from "@/lib/catalog";
import { getLiveStock } from "@/lib/shop/data";
import { formatGrams, formatPaise, materialEyebrow } from "@/lib/format";
import { ProductImage } from "@/components/storefront/product-image";
import { WishlistHeart } from "@/components/storefront/wishlist-heart";

/**
 * Product card (signature component, design handoff §4): cached shell
 * (image placeholder + museum label) with the live price/stock slot streamed
 * uncached in its own Suspense boundary.
 */
export function ProductCard({ product }: { product: ProductRow }) {
  return (
    <div className="group relative border bg-card transition-colors hover:border-gold">
      <WishlistHeart productId={product.id} />
      <Link href={`/shop/${product.id}`} className="block">
        <ProductImage
          sku={product.sku}
          alt={product.name}
          sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
        />
        <div className="p-[18px] pb-[22px]">
          <p className="flex items-baseline gap-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
            <span>
              {materialEyebrow(product.material, product.purity_karat)}
            </span>
            <span>·</span>
            <span className="ledger">{formatGrams(product.weight_grams)}</span>
          </p>
          <h3 className="mt-1.5 font-display text-lg tracking-[-0.02em]">
            {product.name}
          </h3>
          <div className="mt-2.5">
            <Suspense fallback={<PriceLineSkeleton />}>
              <CardLive product={product} />
            </Suspense>
          </div>
        </div>
      </Link>
    </div>
  );
}

/** Live price + availability — never from the cached shell. */
async function CardLive({ product }: { product: ProductRow }) {
  await connection();
  const [view, liveStock] = await Promise.all([
    toCatalogDetail(product),
    getLiveStock(product.id),
  ]);
  const inStock = (liveStock ?? product.stock_quantity) > 0;
  return (
    <>
      {view.pricing.status === "priced" ? (
        <p className="ledger text-base">
          {formatPaise(view.pricing.price.total)}
        </p>
      ) : (
        <p className="ledger text-sm text-muted-foreground">
          price on request
        </p>
      )}
      {!inStock && (
        <span className="pointer-events-none absolute left-0 top-0 flex aspect-[4/5] w-full items-start justify-end bg-background/40 p-3">
          <span className="eyebrow rounded-xs border border-hallmark bg-background/80 px-2 py-1 text-hallmark">
            Sold
          </span>
        </span>
      )}
    </>
  );
}

/** Exactly the size of the final price line — nothing jumps. */
function PriceLineSkeleton() {
  return (
    <p className="ledger text-base">
      <span className="inline-block h-[0.9375rem] w-24 animate-pulse bg-secondary align-baseline" />
    </p>
  );
}
