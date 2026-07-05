import Link from "next/link";
import { Suspense } from "react";
import {
  RateTicker,
  RateTickerSkeleton,
} from "@/components/storefront/rate-ticker";
import { SiteFooter } from "@/components/storefront/site-footer";

/**
 * Checkout chrome (PRD C5/C6 brief): the header collapses to wordmark +
 * ticker only — no nav, no cart link. A separate route group because the
 * `(shop)` layout hard-renders the full `SiteHeader`; the URL stays
 * `/checkout/…` (route groups don't affect paths).
 */
export default function CheckoutLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Suspense fallback={<RateTickerSkeleton />}>
        <RateTicker />
      </Suspense>
      <header className="flex items-center border-b px-4 py-4 md:px-12 md:py-[22px]">
        <Link
          href="/"
          className="font-display text-md tracking-[-0.02em] md:text-lg"
        >
          Nazeer &amp; Nazeers
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
