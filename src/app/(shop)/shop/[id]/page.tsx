import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import {
  getProduct,
  getGstSettings,
  getLatestRateRow,
  getLiveStock,
  getProductMedia,
  getProductGemstones,
  getProductVariants,
  getProductReviews,
  type ProductGemstoneRow,
} from "@/lib/shop/data";
import { reviewSummary, starString } from "@/lib/reviews";
import type { ProductRow } from "@/lib/catalog";
import { getCurrentRate, RateUnavailableError } from "@/lib/rates";
import { calculatePrice, type Price } from "@/lib/pricing";
import { gstDisplaySplit } from "@/lib/gst-display";
import {
  formatGrams,
  formatPaise,
  formatRate,
  formatTimeIST,
  materialEyebrow,
} from "@/lib/format";
import {
  PriceReceipt,
  PriceReceiptSkeleton,
} from "@/components/storefront/price-receipt";
import { ProductImage } from "@/components/storefront/product-image";
import { ProductGallery } from "@/components/storefront/product-gallery";
import { HallmarkBadge } from "@/components/storefront/hallmark-badge";
import { AddToCart } from "@/components/storefront/add-to-cart";
import { WishlistButton } from "@/components/storefront/wishlist-button";
import { ProductReviews } from "@/components/storefront/product-reviews";
import { VariantSelectorIsland } from "@/components/storefront/variant-selector-island";
import type { Database } from "@/lib/supabase/database.types";

type VariantRow = Database["public"]["Tables"]["product_variant"]["Row"];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return { title: "Product not found" };
  const description =
    product.description && product.description.length > 0
      ? product.description.slice(0, 155)
      : `${materialEyebrow(product.material, product.purity_karat)} · ${formatGrams(product.weight_grams)} · Live price`;
  return {
    title: product.name,
    description,
    openGraph: { type: "website", title: product.name, description },
  };
}

/** C3 Product detail `/shop/[id]` ★ the transparency showcase. */
export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ variant?: string }>;
}) {
  const { id } = await params;
  const { variant: variantId } = await searchParams;
  const product = await getProduct(id);
  if (!product) {
    notFound();
  }
  // Cached catalog reads (07-02 / 07-07) — part of the static prerender.
  const [media, gemstones, variants, reviews] = await Promise.all([
    getProductMedia(product.id),
    getProductGemstones(product.id),
    getProductVariants(product.id),
    getProductReviews(product.id),
  ]);
  const summary = reviewSummary(reviews.map((r) => r.rating));

  return (
    <>
    <nav className="eyebrow border-b px-4 py-3.5 text-muted-foreground md:px-12">
      <Link href="/shop" className="transition-colors hover:text-gold">Shop</Link>
      <span className="mx-2">·</span>
      <span>{product.material}</span>
    </nav>
    <div className="grid md:grid-cols-[7fr_5fr]">
      {/* Image panel: bleeds to the page edge, no border (C3 brief). */}
      <div>
        {media.length > 0 ? (
          <ProductGallery images={media} productName={product.name} />
        ) : (
          <>
            <ProductImage
              sku={product.sku}
              alt={product.name}
              eager
              sizes="(min-width: 768px) 58vw, 100vw"
            />
            <div className="flex gap-2 p-2">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="h-16 w-16 bg-secondary" />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Museum-label column. */}
      <div className="px-4 py-10 md:px-12">
        <p className="flex items-baseline gap-1.5 text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
          <span>{materialEyebrow(product.material, product.purity_karat)}</span>
          <span>·</span>
          <span className="ledger">{formatGrams(product.weight_grams)}</span>
        </p>
        <h1 className="mt-2 font-display text-2xl tracking-[-0.02em]">
          {product.name}
        </h1>
        {summary.count > 0 && (
          <p className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-gold">{starString(summary.average)}</span>
            <span className="ledger text-muted-foreground">
              {summary.average.toFixed(1)} · {summary.count} review{summary.count > 1 ? "s" : ""}
            </span>
          </p>
        )}
        {product.description !== null && product.description !== "" && (
          <p className="mt-4 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        )}
        <dl className="ledger mt-5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <div className="flex gap-2">
            <dt className="uppercase">SKU</dt>
            <dd>{product.sku}</dd>
          </div>
        </dl>
        <div className="mt-5">
          <WishlistButton productId={product.id} />
        </div>
        <GemstoneBlock gemstones={gemstones} />
        {variants.length > 0 && (
          <VariantSelectorIsland
            variants={variants}
            selectedId={variantId ?? null}
          />
        )}
        <hr className="my-6" />
        <Suspense fallback={<PriceReceiptSkeleton />}>
          <DetailLive product={product} variants={variants} selectedVariantId={variantId ?? null} />
        </Suspense>
      </div>
    </div>
    <ProductReviews productId={product.id} />
    </>
  );
}

/**
 * THE LEDGER — live receipt + availability + CTA. Uncached by design:
 * price is never stored, always computed (ADR-0002/0007); a stale rate shows
 * the calm notice, never a wrong number (ADR-0010).
 *
 * When the product has variants, `selectedVariantId` picks the active variant
 * to price from. Variant pricing inputs override the product base (ADR-0015).
 */
async function DetailLive({
  product,
  variants = [],
  selectedVariantId = null,
}: {
  product: ProductRow;
  variants?: VariantRow[];
  selectedVariantId?: string | null;
}) {
  await connection();

  // Resolve the variant (if any) that should drive the live price.
  const activeVariant =
    variants.length > 0
      ? (variants.find((v) => v.id === selectedVariantId) ??
         // Auto-select the first variant when none is explicitly chosen.
         variants[0])
      : null;

  // Live stock comes from the variant (if present) or the product.
  const [settings, liveStock, rateRow] = await Promise.all([
    getGstSettings(),
    activeVariant
      ? Promise.resolve(activeVariant.stock_quantity)
      : getLiveStock(product.id),
    getLatestRateRow(product.material),
  ]);

  // Build the pricing inputs: variant overrides product when present.
  const pricingInputs = activeVariant
    ? {
        material: product.material,
        weight_grams: activeVariant.weight_grams,
        purity_karat: activeVariant.purity_karat,
        making_charge_type: activeVariant.making_charge_type,
        making_charge_value: activeVariant.making_charge_value,
      }
    : product;

  let price: Price | null = null;
  let formulaRatePaise: number | null = null;
  try {
    const rate = await getCurrentRate(product.material);
    price = calculatePrice(pricingInputs, rate, settings);
    formulaRatePaise = rate.rate_per_gram_paise;
  } catch (err) {
    if (!(err instanceof RateUnavailableError)) {
      throw err;
    }
  }

  const stock = typeof liveStock === "number" ? liveStock : (liveStock ?? product.stock_quantity);
  const inStock = stock > 0;
  // Use the variant's HUID when present, else the product's.
  const displayHuid = activeVariant ? activeVariant.hallmark_huid : product.hallmark_huid;
  // For the formula, use the effective weight/purity.
  const effectiveWeight = activeVariant ? activeVariant.weight_grams : product.weight_grams;
  const effectivePurity = activeVariant ? activeVariant.purity_karat : product.purity_karat;

  if (price === null) {
    // price_unavailable: calm bordered notice in ledger styling (C3 brief).
    return (
      <div>
        <div className="border px-5 py-6">
          <p className="eyebrow text-muted-foreground">Today&apos;s price</p>
          <p className="mt-3 font-display text-md italic">
            Today&apos;s rate is being updated — price unavailable
          </p>
        </div>
        <button
          disabled
          className="eyebrow mt-6 w-full cursor-not-allowed border border-primary py-3 opacity-50"
        >
          Add to Cart
        </button>
      </div>
    );
  }

  const split = gstDisplaySplit(price, settings);
  const formula =
    formulaRatePaise === null
      ? undefined
      : product.material === "gold"
        ? `${formatGrams(effectiveWeight)} × ${formatRate(formulaRatePaise)} × ${effectivePurity}/24`
        : `${formatGrams(effectiveWeight)} × ${formatRate(formulaRatePaise)}`;

  return (
    <div>
      <PriceReceipt
        metalValuePaise={price.metal_value}
        makingChargesPaise={price.making_charges}
        gstMetalPaise={split.gst_metal}
        gstMakingPaise={split.gst_making}
        totalPaise={price.total}
        gstMetalBps={settings.gst_metal_bps}
        gstMakingBps={settings.gst_making_bps}
        metalFormula={formula}
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          priced at today&apos;s rate
          {rateRow !== null && (
            <span className="ledger"> · {formatTimeIST(rateRow.effective_at)}</span>
          )}
        </p>
        {displayHuid !== null && (
          <HallmarkBadge huid={displayHuid} />
        )}
      </div>
      <div className="mt-6">
        {inStock ? (
          <>
            {stock <= 2 && (
              <p className="eyebrow mb-3 text-hallmark">
                Only {stock} available
              </p>
            )}
            <AddToCart
              productId={product.id}
              maxQuantity={stock}
              variantId={activeVariant?.id ?? null}
            />
          </>
        ) : (
          <div className="border px-5 py-6">
            <p className="font-display text-md italic">
              This piece is reserved or sold
            </p>
            <Link
              href={`/shop?material=${product.material}`}
              className="eyebrow mt-4 inline-block border-b border-foreground pb-1 transition-colors hover:border-gold hover:text-gold"
            >
              Browse {product.material} pieces
            </Link>
          </div>
        )}
      </div>
      {/* Mobile sticky CTA — shows price + compact Add to Cart at bottom of viewport */}
      {inStock && (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 flex items-center gap-4 border-t bg-background px-4 py-3">
          <div className="flex-1">
            <p className="eyebrow text-muted-foreground">Today</p>
            <p className="ledger text-base">{formatPaise(price.total)}</p>
          </div>
          <AddToCart
            productId={product.id}
            maxQuantity={stock}
            variantId={activeVariant?.id ?? null}
            compact
          />
        </div>
      )}
    </div>
  );
}

/**
 * Static gemstone + certificate trust block (PRD 07-07 surfaced). Null when the
 * piece has no stones. `carat_weight` is the STONE carat, never the metal purity.
 */
function GemstoneBlock({ gemstones }: { gemstones: ProductGemstoneRow[] }) {
  if (gemstones.length === 0) {
    return null;
  }
  return (
    <div className="mt-6">
      <p className="eyebrow text-muted-foreground">Gemstone &amp; certificate</p>
      <ul className="mt-3 space-y-3">
        {gemstones.map((g) => (
          <li key={g.id} className="border-l-2 border-gold pl-3">
            <p className="font-display text-md">
              {g.gem_type}
              {g.carat_weight !== null && (
                <span className="ledger text-sm text-muted-foreground">
                  {" "}
                  · {g.carat_weight} ct
                </span>
              )}
            </p>
            <dl className="ledger mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {g.cut && <Spec label="Cut" value={g.cut} />}
              {g.color && <Spec label="Colour" value={g.color} />}
              {g.clarity && <Spec label="Clarity" value={g.clarity} />}
              {g.lab && <Spec label="Lab" value={g.lab} />}
              {g.certificate_number && (
                <Spec label="Cert" value={g.certificate_number} />
              )}
              {g.laser_inscription && (
                <Spec label="Inscription" value={g.laser_inscription} />
              )}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="uppercase">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
