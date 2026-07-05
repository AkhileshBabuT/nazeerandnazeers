import Link from "next/link";
import {
  getCategories,
  getLiveStocks,
  listActiveProducts,
} from "@/lib/shop/data";
import { ProductCard } from "@/components/storefront/product-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "The Collection" };

type Filters = {
  material?: "gold" | "silver";
  category?: string;
  available: boolean;
};

function chipHref(f: Filters): string {
  const params = new URLSearchParams();
  if (f.material !== undefined) params.set("material", f.material);
  if (f.category !== undefined) params.set("category", f.category);
  if (f.available) params.set("available", "true");
  const qs = params.toString();
  return qs === "" ? "/shop" : `/shop?${qs}`;
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "eyebrow shrink-0 rounded-xs border px-3.5 py-[7px] transition-colors",
        active
          ? "border-foreground bg-foreground text-primary-foreground"
          : "border-border text-foreground hover:border-gold hover:text-gold",
      )}
    >
      {children}
    </Link>
  );
}

function SidebarLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "text-sm transition-colors hover:text-gold",
        active ? "text-gold" : "text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function CheckLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2.5 text-sm text-foreground transition-colors hover:text-gold"
    >
      <span
        className={cn(
          "flex h-[13px] w-[13px] shrink-0 rounded-xs border",
          active ? "border-foreground bg-foreground" : "border-border",
        )}
      />
      {children}
    </Link>
  );
}

// CSS icon shapes by tile position — matches landing page tiles.
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

/** C2 Catalog browse `/shop` — sidebar + 3-col grid, filtered by material,
 * category and availability. */
export default async function ShopPage({
  searchParams,
}: {
  searchParams: Promise<{
    material?: string;
    category?: string;
    available?: string;
  }>;
}) {
  const sp = await searchParams;
  const material =
    sp.material === "gold" || sp.material === "silver" ? sp.material : undefined;
  const available = sp.available === "true";

  const categories = await getCategories();
  const category = categories.find((c) => c.slug === sp.category);

  let products = await listActiveProducts({
    material,
    categoryId: category?.id,
  });
  if (available) {
    const stocks = await getLiveStocks(products.map((p) => p.id));
    products = products.filter((p) => (stocks.get(p.id) ?? 0) > 0);
  }

  const base: Filters = { material, category: category?.slug, available };
  const count = String(products.length).padStart(2, "0");
  const noFilters = !material && !category && !available;

  return (
    <div className="px-4 md:px-12">
      {/* ── Page head ── */}
      <div className="flex items-end justify-between border-b pb-[18px] pt-12">
        <h1 className="font-display text-2xl tracking-[-0.02em]">
          The Collection
        </h1>
        <span className="ledger hidden text-sm text-muted-foreground md:inline">
          {count} pieces
        </span>
      </div>
      {/* Mobile count (below heading) */}
      <p className="ledger mt-2.5 text-xs text-muted-foreground md:hidden">
        {count} pieces
      </p>

      {/* ── Category tiles (desktop only) ── */}
      {categories.length > 0 && (
        <div className="mt-6 hidden grid-cols-5 gap-4 md:grid">
          {categories.slice(0, 5).map((cat, i) => {
            const isActive = category?.id === cat.id;
            return (
              <Link
                key={cat.id}
                href={chipHref({
                  ...base,
                  category: isActive ? undefined : cat.slug,
                })}
                className={cn(
                  "flex flex-col border bg-card transition-colors hover:border-gold",
                  isActive ? "border-gold" : "border-border",
                )}
              >
                <div className="flex aspect-[3/2] items-center justify-center bg-secondary">
                  {TILE_ICONS[i % TILE_ICONS.length]}
                </div>
                <div className="px-3 pb-3.5 pt-2.5">
                  <p
                    className={cn(
                      "font-display text-md font-medium tracking-[-0.02em] transition-colors",
                      isActive ? "text-gold" : "text-foreground",
                    )}
                  >
                    {cat.display_name}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Mobile: horizontal scroll chips ── */}
      <div className="mt-[18px] flex gap-2 overflow-x-auto pb-1 md:hidden">
        <Chip href="/shop" active={noFilters}>
          All
        </Chip>
        <Chip
          href={chipHref({ ...base, material: material === "gold" ? undefined : "gold" })}
          active={material === "gold"}
        >
          Gold
        </Chip>
        <Chip
          href={chipHref({ ...base, material: material === "silver" ? undefined : "silver" })}
          active={material === "silver"}
        >
          Silver
        </Chip>
        <Chip
          href={chipHref({ ...base, available: !available })}
          active={available}
        >
          In Stock
        </Chip>
        {categories.map((cat) => (
          <Chip
            key={cat.id}
            href={chipHref({
              ...base,
              category: category?.id === cat.id ? undefined : cat.slug,
            })}
            active={category?.id === cat.id}
          >
            {cat.display_name}
          </Chip>
        ))}
      </div>

      {/* ── Body: sidebar + grid column ── */}
      <div className="mt-8 grid grid-cols-1 pb-16 md:grid-cols-[232px_1fr] md:gap-10">
        {/* Sidebar (desktop only) */}
        <aside className="hidden flex-col gap-8 md:flex">
          {/* Collections */}
          {categories.length > 0 && (
            <div>
              <div className="eyebrow mb-3.5 border-b pb-3 text-muted-foreground">
                Collections
              </div>
              <div className="flex flex-col gap-2.5">
                {categories.map((cat) => (
                  <SidebarLink
                    key={cat.id}
                    href={chipHref({
                      ...base,
                      category:
                        category?.id === cat.id ? undefined : cat.slug,
                    })}
                    active={category?.id === cat.id}
                  >
                    {cat.display_name}
                  </SidebarLink>
                ))}
              </div>
            </div>
          )}

          {/* Material */}
          <div>
            <div className="eyebrow mb-3.5 border-b pb-3 text-muted-foreground">
              Material
            </div>
            <div className="flex flex-col gap-2.5">
              <CheckLink
                href={chipHref({
                  ...base,
                  material: material === "gold" ? undefined : "gold",
                })}
                active={material === "gold"}
              >
                Gold
              </CheckLink>
              <CheckLink
                href={chipHref({
                  ...base,
                  material: material === "silver" ? undefined : "silver",
                })}
                active={material === "silver"}
              >
                Silver
              </CheckLink>
            </div>
          </div>

          {/* Availability */}
          <div>
            <div className="eyebrow mb-3.5 border-b pb-3 text-muted-foreground">
              Availability
            </div>
            <CheckLink
              href={chipHref({ ...base, available: !available })}
              active={available}
            >
              In stock only
            </CheckLink>
          </div>
        </aside>

        {/* Grid column */}
        <div>
          {/* Desktop filter chips */}
          <div className="mb-6 hidden gap-2.5 md:flex">
            <Chip
              href={chipHref({ ...base, material: undefined })}
              active={material === undefined}
            >
              All
            </Chip>
            <Chip
              href={chipHref({ ...base, material: "gold" })}
              active={material === "gold"}
            >
              Gold
            </Chip>
            <Chip
              href={chipHref({ ...base, material: "silver" })}
              active={material === "silver"}
            >
              Silver
            </Chip>
          </div>

          {products.length === 0 ? (
            <div className="flex flex-col items-center border bg-card px-12 py-24 text-center">
              <span className="block h-16 w-16 rounded-full border border-gold" />
              <p className="mt-7 font-display text-xl italic">
                Nothing here yet — the goldsmiths are at work
              </p>
              {!noFilters && (
                <p className="mt-3 text-sm text-muted-foreground">
                  No pieces match these filters. Try widening your selection.
                </p>
              )}
              <Link
                href="/shop"
                className="eyebrow mt-7 border border-foreground px-7 py-3 transition-colors hover:border-gold hover:text-gold"
              >
                Back to all pieces
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-6">
              {products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
