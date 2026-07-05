import Link from "next/link";
import Image from "next/image";
import { listActiveProducts, getCategories } from "@/lib/shop/data";
import { ProductCard } from "@/components/storefront/product-card";
import { cn } from "@/lib/utils";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const HERO_BANNERS = ["herobanner1.png", "herobanner2.png"];

export const metadata = { title: "Nazeer & Nazeers" };

// Decorative CSS shapes for category tiles — positional, not semantic.
const TILE_ICONS = [
  <span key="0" className="block h-8 w-8 rounded-full border border-gold" />,
  <span key="1" className="block h-3 w-10 rounded-full border border-gold" />,
  <span key="2" className="block h-[10px] w-11 rounded-[2px] border border-gold" />,
  <span
    key="3"
    className="block h-[22px] w-3.5 border border-gold"
    style={{ borderRadius: "999px 999px 10px 10px" }}
  />,
  <span key="4" className="block h-7 w-7 rotate-45 border border-gold" />,
];

const TABS = [
  { key: "best", label: "Best Sellers", href: "/" },
  { key: "trending", label: "Trending Now", href: "/?tab=trending" },
  { key: "gold", label: "Only Gold", href: "/?tab=gold" },
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const tab = sp.tab === "gold" ? "gold" : sp.tab === "trending" ? "trending" : "best";
  // ponytail: "trending" uses the same data as "best" until a trending_score column exists
  const material =
    tab === "gold" ? ("gold" as const) : undefined;

  const [products, categories] = await Promise.all([
    listActiveProducts({ material }),
    getCategories(),
  ]);
  const featured = products.slice(0, 8); // two full rows of 4
  const count = String(products.length).padStart(2, "0");

  return (
    <>
      {/* ── Hero: full-bleed 3-panel sliding banner ── */}
      <section className="relative h-[480px] overflow-hidden border-b md:h-[640px]">
        {/* sliding track */}
        <div className="absolute inset-0 flex h-full w-[200%] animate-[slideBanner_24s_ease-in-out_infinite]">
          {HERO_BANNERS.map((filename, i) => (
            <div key={i} className="relative h-full w-1/2">
              <Image
                src={`${SUPABASE_URL}/storage/v1/object/public/hero-banners/${filename}`}
                alt="Nazeer and Nazeers"
                fill
                className="object-cover"
                priority={i === 0}
              />
            </div>
          ))}
        </div>
        {/* legibility scrim */}
        <div className="absolute inset-0 bg-gradient-to-b from-foreground/[.28] to-foreground/[.42]" />
        {/* centered text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
          <h1 className="font-display text-2xl font-medium leading-[1.04] tracking-[-0.02em] text-white md:text-display">
            Nazeer &amp; Nazeers
          </h1>
          <p className="mt-4 text-xs uppercase leading-[1.7] tracking-[0.1em] text-white/90 md:mt-[22px] md:text-sm md:tracking-[0.12em]">
            Custom gold &amp; silver jewellery — priced to the paise, live
          </p>
          <Link
            href="/shop"
            className="mt-7 border-b border-white/80 pb-1 text-xs uppercase tracking-[0.1em] text-white transition-colors hover:border-gold hover:text-gold md:mt-10 md:tracking-[0.12em]"
          >
            Enter the Collection
          </Link>
        </div>
        {/* slide indicator dots */}
        <div className="absolute bottom-[18px] left-1/2 flex -translate-x-1/2 gap-2 md:bottom-[22px]">
          <span className="block h-0.5 w-7 bg-white/85" />
          <span className="block h-0.5 w-7 bg-white/40" />
        </div>
      </section>

      {/* ── Collection section: tiles + tabs + grid ── */}
      <section className="px-4 pt-14 md:px-12 md:pt-20">
        {/* Category tiles — desktop only */}
        {categories.length > 0 && (
          <div className="mb-9 hidden grid-cols-5 gap-4 md:grid">
            {categories.slice(0, 5).map((cat, i) => (
              <Link
                key={cat.id}
                href={`/shop?category=${cat.id}`}
                className="flex flex-col border border-border bg-card transition-colors hover:border-gold"
              >
                <div className="flex aspect-[3/2] items-center justify-center bg-secondary">
                  {TILE_ICONS[i % TILE_ICONS.length]}
                </div>
                <div className="px-3.5 pb-3.5 pt-3">
                  <p className="font-display text-md font-medium tracking-[-0.02em]">
                    {cat.display_name}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Section header */}
        <div className="flex items-baseline justify-between border-b pb-3.5">
          <h2 className="text-sm uppercase tracking-[0.08em]">The Collection</h2>
          <span className="ledger text-xs uppercase text-muted-foreground">
            {count} pieces
          </span>
        </div>

        {/* Tab bar — desktop only */}
        <div className="hidden items-center justify-center gap-14 border-b md:flex">
          {TABS.map(({ key, label, href }) => (
            <Link
              key={key}
              href={href}
              className={cn(
                "pb-1.5 pt-8 font-display text-lg tracking-[-0.02em] transition-colors",
                tab === key
                  ? "border-b-2 border-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Product grid */}
        {featured.length === 0 ? (
          <div className="flex flex-col items-center py-20">
            <span className="h-12 w-12 rounded-full border border-foreground/30" />
            <p className="mt-6 font-display text-lg italic">
              Nothing here yet — the goldsmiths are at work
            </p>
          </div>
        ) : (
          <>
            <div className="mt-7 grid grid-cols-2 gap-3 md:mt-7 md:grid-cols-4 md:gap-5">
              {featured.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>

            {/* Mobile: text link */}
            <Link
              href="/shop"
              className="eyebrow mt-6 block border border-foreground py-3.5 text-center transition-colors hover:border-gold hover:text-gold md:hidden"
            >
              View all {count} pieces
            </Link>

            {/* Desktop: filled button */}
            <div className="mt-12 hidden justify-center pb-4 md:flex">
              <Link
                href="/shop"
                className="eyebrow bg-foreground px-12 py-3.5 text-primary-foreground transition-colors hover:bg-black"
              >
                View Collection
              </Link>
            </div>
          </>
        )}
      </section>

      {/* ── Entry tiles: Gold / Silver ── */}
      <section className="grid grid-cols-1 gap-4 px-4 py-12 md:grid-cols-2 md:gap-6 md:px-12 md:py-20">
        <Link
          href="/shop?material=gold"
          className="flex flex-col items-start border border-foreground p-8 transition-colors hover:border-gold md:p-14"
        >
          <span className="block h-11 w-11 rounded-full border border-gold" />
          <span className="mt-7 font-display text-xl tracking-[-0.02em]">Gold</span>
          <span className="eyebrow mt-2.5 text-muted-foreground">View gold pieces →</span>
        </Link>
        <Link
          href="/shop?material=silver"
          className="flex flex-col items-start border border-foreground p-8 transition-colors hover:border-gold md:p-14"
        >
          <span className="mb-1 mt-1 block h-[34px] w-[34px] rotate-45 border border-silver" />
          <span className="mt-6 font-display text-xl tracking-[-0.02em]">Silver</span>
          <span className="eyebrow mt-2.5 text-muted-foreground">View silver pieces →</span>
        </Link>
      </section>
    </>
  );
}
