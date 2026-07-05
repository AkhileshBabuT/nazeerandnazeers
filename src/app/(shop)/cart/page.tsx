import Link from "next/link";
import { connection } from "next/server";
import { getCart } from "@/app/actions/cart";
import { getGstSettings } from "@/lib/shop/data";
import type { CartViewLine } from "@/lib/cart/view";
import { formatPaise } from "@/lib/format";
import { cartGstDisplaySplit } from "@/lib/gst-display";
import { PriceReceipt } from "@/components/storefront/price-receipt";
import { ProductImage } from "@/components/storefront/product-image";
import { CartLineControls } from "@/components/storefront/cart-line-controls";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Your Tray" };

/**
 * C4 Cart `/cart` — the live-priced ledger sheet. Per-user, so UNCACHED by
 * design (`getCart` reads cookies); the `(shop)/loading.tsx` boundary streams
 * it. Totals recompute on every server render (ADR-0002); a line whose rate is
 * updating shows em-dashes + "RATE UPDATING" and blocks checkout. Copy never
 * implies a hold — reservation begins at order create (ADR-0001).
 */
export default async function CartPage() {
  await connection();
  const result = await getCart();

  if (!result.ok) {
    return (
      <div className="px-4 py-24 text-center md:px-12">
        <p className="font-display text-lg italic">
          Your tray could not be loaded — please try again
        </p>
      </div>
    );
  }

  const cart = result.data;

  if (cart.lines.length === 0) {
    return <EmptyTray />;
  }

  const settings = await getGstSettings();
  const pricedLines = cart.lines.filter(
    (l): l is Extract<CartViewLine, { price_unavailable: false }> =>
      !l.price_unavailable,
  );
  const split = cartGstDisplaySplit(pricedLines, settings);

  return (
    <div className="px-4 py-10 md:px-12 md:py-14">
      <div className="flex items-baseline justify-between border-b pb-3.5">
        <h1 className="font-display text-2xl tracking-[-0.02em]">Your Tray</h1>
        <Link
          href="/shop"
          className="eyebrow text-muted-foreground transition-colors hover:text-gold"
        >
          Continue shopping
        </Link>
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-[2fr_1fr] md:gap-12">
        {/* Left: the cart lines. */}
        <ul>
          {cart.lines.map((line) => (
            <CartLineRow key={line.cart_item_id} line={line} />
          ))}
        </ul>

        {/* Right: sticky totals receipt. */}
        <aside className="md:sticky md:top-8 md:self-start">
          <div className="rounded-xs border p-6">
            <p className="eyebrow text-muted-foreground">Today&apos;s price — live</p>
            <div className="mt-5">
              <PriceReceipt
                metalValuePaise={cart.metal_value}
                makingChargesPaise={cart.making_charges}
                gstMetalPaise={split.gst_metal}
                gstMakingPaise={split.gst_making}
                totalPaise={cart.total}
                gstMetalBps={settings.gst_metal_bps}
                gstMakingBps={settings.gst_making_bps}
              />
            </div>

            {cart.has_unpriceable_lines ? (
              <>
                <div className="mt-6 border border-hallmark/40 px-4 py-3">
                  <p className="text-xs text-hallmark">
                    One or more pieces are awaiting today&apos;s rate. Checkout
                    reopens the moment the rate updates.
                  </p>
                </div>
                <button
                  type="button"
                  disabled
                  className={buttonVariants({
                    variant: "outline",
                    width: "full",
                    className: "mt-6",
                  })}
                >
                  Proceed to Checkout
                </button>
              </>
            ) : (
              <Link
                href="/checkout"
                className={buttonVariants({ width: "full", className: "mt-6" })}
              >
                Proceed to Checkout
              </Link>
            )}

            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Prices follow the live metal rate until you check out. Your price
              is locked when you place the order.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A single hairline-ruled cart line (priced or rate-updating). */
function CartLineRow({ line }: { line: CartViewLine }) {
  return (
    <li className="flex gap-4 border-b py-6 first:pt-0">
      <Link
        href={`/shop/${line.product_id}`}
        className="block w-20 shrink-0 md:w-24"
      >
        <ProductImage sku={line.sku} alt={line.name} sizes="96px" />
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
              {line.material === "gold" ? "Gold" : "Sterling Silver"}
            </p>
            <Link href={`/shop/${line.product_id}`}>
              <h2 className="mt-1 font-display text-lg tracking-[-0.02em] transition-colors hover:text-gold">
                {line.name}
              </h2>
            </Link>
            <p className="ledger mt-1 text-xs uppercase text-muted-foreground">
              {line.sku}
            </p>
          </div>
          <div className="shrink-0 text-right">
            {line.price_unavailable ? (
              <>
                <p className="ledger text-base">—</p>
                <p className="eyebrow mt-1 text-hallmark">RATE UPDATING</p>
              </>
            ) : (
              <p className="ledger text-base">{formatPaise(line.line_total)}</p>
            )}
          </div>
        </div>
        <CartLineControls
          cartItemId={line.cart_item_id}
          productId={line.product_id}
          quantity={line.quantity}
        />
      </div>
    </li>
  );
}

/** Empty tray (design brief): centered, Cormorant italic, outline CTA. */
function EmptyTray() {
  return (
    <div className="flex flex-col items-center px-4 py-24 text-center md:px-12">
      <span className="block h-[52px] w-[72px] border border-gold rounded-xs" />
      <p className="mt-7 font-display text-lg italic">Your tray is empty</p>
      <p className="mt-2.5 text-sm text-muted-foreground">
        Every piece is priced live to the paise. Begin with The Collection.
      </p>
      <Link
        href="/shop"
        className="eyebrow mt-7 border border-foreground px-7 py-3 transition-colors hover:border-gold hover:text-gold"
      >
        Browse The Collection
      </Link>
    </div>
  );
}
