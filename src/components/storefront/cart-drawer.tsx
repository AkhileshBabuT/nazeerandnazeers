"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCart } from "@/app/actions/cart";
import type { CartView } from "@/lib/cart/view";
import { formatPaise } from "@/lib/format";
import { ProductImage } from "./product-image";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Slide-out cart quick-view (compass §4: the cart drawer pattern). Additive —
 * `/cart` remains the full ledger sheet (linked as "View tray"); this is a glance
 * + the two CTAs. The header cart label is passed as `children` so the count
 * stays a server-streamed value. Read-only: quantity / remove live on `/cart`.
 */
export function CartDrawer({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [cart, setCart] = useState<CartView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    getCart().then((res) => {
      if (!alive) return;
      if (res.ok) {
        setCart(res.data);
      } else {
        setError(true);
      }
      setLoading(false);
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Reset to a loading state in the click handler (an event, not the effect) so
  // re-opening always re-fetches and shows the spinner.
  const openDrawer = () => {
    setError(false);
    setLoading(true);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const empty = !cart || cart.lines.length === 0;

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={openDrawer}
        className="eyebrow transition-colors hover:text-gold"
      >
        {children}
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Your tray"
          className="fixed inset-0 z-50 flex justify-end"
        >
          <button
            type="button"
            aria-label="Close tray"
            className="absolute inset-0 bg-foreground/30"
            onClick={close}
          />
          <aside className="relative flex h-full w-full max-w-[400px] flex-col border-l bg-card">
            <header className="flex items-center justify-between border-b px-6 py-5">
              <h2 className="font-display text-lg tracking-[-0.02em]">
                Your Tray
              </h2>
              <button
                type="button"
                onClick={close}
                className="eyebrow text-muted-foreground transition-colors hover:text-gold"
              >
                Close
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {loading ? (
                <p className="text-muted-foreground">Loading…</p>
              ) : error ? (
                <p className="font-display text-md italic">
                  Your tray could not be loaded.
                </p>
              ) : empty ? (
                <div className="py-12 text-center">
                  <p className="font-display text-md italic">
                    Your tray is empty
                  </p>
                  <Link
                    href="/shop"
                    onClick={close}
                    className="eyebrow mt-6 inline-block border-b border-foreground pb-1 transition-colors hover:border-gold hover:text-gold"
                  >
                    Browse the collection
                  </Link>
                </div>
              ) : (
                <ul className="space-y-5">
                  {cart.lines.map((line) => (
                    <li key={line.cart_item_id} className="flex gap-4">
                      <Link
                        href={`/shop/${line.product_id}`}
                        onClick={close}
                        className="w-16 shrink-0"
                      >
                        <ProductImage
                          sku={line.sku}
                          alt={line.name}
                          sizes="64px"
                        />
                      </Link>
                      <div className="flex-1">
                        <Link
                          href={`/shop/${line.product_id}`}
                          onClick={close}
                          className="font-display text-md tracking-[-0.02em] transition-colors hover:text-gold"
                        >
                          {line.name}
                        </Link>
                        <p className="ledger mt-1 text-xs text-muted-foreground">
                          Qty {line.quantity}
                        </p>
                        <p className="ledger mt-1 text-sm">
                          {line.price_unavailable ? (
                            <span className="text-hallmark">Rate updating</span>
                          ) : (
                            formatPaise(line.line_total)
                          )}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {cart && cart.lines.length > 0 && (
              <footer className="border-t px-6 py-5">
                {cart.has_unpriceable_lines && (
                  <p className="mb-3 text-xs text-hallmark">
                    A piece is awaiting today&apos;s rate — checkout reopens when
                    it returns.
                  </p>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="eyebrow text-muted-foreground">Subtotal</span>
                  <span className="ledger text-md">
                    {formatPaise(cart.total)}
                  </span>
                </div>
                <div className="mt-4 flex flex-col gap-3">
                  <Link
                    href="/checkout"
                    onClick={close}
                    aria-disabled={cart.has_unpriceable_lines}
                    className={cn(
                      buttonVariants({ width: "full" }),
                      cart.has_unpriceable_lines &&
                        "pointer-events-none opacity-50",
                    )}
                  >
                    Checkout
                  </Link>
                  <Link
                    href="/cart"
                    onClick={close}
                    className={buttonVariants({
                      variant: "outline",
                      width: "full",
                    })}
                  >
                    View tray
                  </Link>
                </div>
              </footer>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
