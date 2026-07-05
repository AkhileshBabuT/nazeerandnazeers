import Link from "next/link";
import { Suspense } from "react";
import { getCategories, listCollections } from "@/lib/shop/data";
import { CartCount } from "./cart-count";
import { CartDrawer } from "./cart-drawer";
import { WishlistCount } from "./wishlist-count";
import { MobileMenu } from "./mobile-menu";
import { ShopMenu } from "./shop-menu";

function HeaderLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="eyebrow border-b border-transparent pb-px transition-colors hover:border-gold hover:text-gold"
    >
      {children}
    </Link>
  );
}

/** Storefront header (design handoff §2). Async: reads the cached category +
 * collection lists once and feeds both the desktop mega-menu and mobile nav. */
export async function SiteHeader() {
  const [categories, collections] = await Promise.all([
    getCategories(),
    listCollections(),
  ]);
  return (
    <header className="relative flex items-center border-b px-4 py-4 md:px-12 md:py-[22px]">
      <Link
        href="/"
        aria-label="Nazeer & Nazeers — home"
        className="font-display text-md tracking-[-0.02em] md:text-lg"
      >
        Nazeer &amp; Nazeers
      </Link>
      <nav aria-label="Main navigation" className="ml-16 hidden items-center gap-7 md:flex">
        <ShopMenu categories={categories} collections={collections} />
        <HeaderLink href="/shop?material=gold">Gold</HeaderLink>
        <HeaderLink href="/shop?material=silver">Silver</HeaderLink>
        <HeaderLink href="/shop">The Collection</HeaderLink>
      </nav>
      <div className="ml-auto flex items-center gap-7">
        <span className="hidden md:inline">
          <Suspense fallback={null}>
            <WishlistCount />
          </Suspense>
        </span>
        <span className="hidden md:inline">
          <HeaderLink href="/account">Account</HeaderLink>
        </span>
        <CartDrawer>
          <Suspense fallback={<span>Cart</span>}>
            <CartCount />
          </Suspense>
        </CartDrawer>
        <MobileMenu categories={categories} collections={collections} />
      </div>
    </header>
  );
}
