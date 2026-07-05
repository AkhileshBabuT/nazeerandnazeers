import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getPaymentSession } from "@/app/actions/orders";
import { createClient } from "@/lib/supabase/server";
import { nowMs } from "@/lib/admin/dashboard";
import { snapshotReceipt } from "@/lib/checkout/order-receipt";
import { formatPaise } from "@/lib/format";
import { PriceReceipt } from "@/components/storefront/price-receipt";
import { ReservationCountdown } from "@/components/checkout/reservation-countdown";
import { PaymentSection } from "@/components/checkout/payment-element";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Payment" };

/**
 * C6 Payment `/checkout/[orderId]/pay` ★ the gated screen (PRD 04, §1.6).
 *
 * The gate decision is SERVER-SIDE: `getPaymentSession` (ownership via RLS +
 * `pending` + inside the 15-minute window via the shared `gateFor`) decides
 * what renders. In every non-active state the payment form is ABSENT from the
 * tree — never rendered-then-hidden, never disabled. The active state mounts
 * the ReservationCountdown island, which hard-unmounts the gateway subtree
 * the moment the client clock hits 0 (the pure `countdownView` is the tested
 * decision; the server gate stays authoritative on refresh).
 */
export default async function PayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  await connection();

  const session = await getPaymentSession(orderId);

  if (!session.ok) {
    if (session.code === "not_found") {
      notFound();
    }
    if (session.code === "paid") {
      // Idempotent revisit — money already moved; the certificate lives at C7.
      redirect(`/orders/${orderId}/confirmation`);
    }
    if (session.code === "cancelled") {
      return <CancelledGate />;
    }
    if (session.code === "expired") {
      return <ExpiredGate />;
    }
    // code === "error" — quiet gate; nothing was charged.
    return <ErrorGate />;
  }

  // The snapshotted receipt for the disclosure — read from the Order's FROZEN
  // columns under the caller's own RLS (ADR-0003: no live rates at read time).
  const supabase = await createClient();
  const [{ data: order }, { data: items }] = await Promise.all([
    supabase
      .from("orders")
      .select("gst_metal_bps, gst_making_bps")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("unit_price_paise, making_charges_paise, quantity")
      .eq("order_id", orderId),
  ]);
  const breakdown =
    order !== null && items !== null && items.length > 0
      ? {
          ...snapshotReceipt(items, order),
          gstMetalBps: order.gst_metal_bps,
          gstMakingBps: order.gst_making_bps,
        }
      : null;

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-10 md:py-14">
      <ReservationCountdown
        deadlineIso={session.deadline}
        initialNowMs={nowMs()}
        expired={<ExpiredGate />}
      >
        <section className="mt-8 rounded-sm border bg-card p-6 md:p-8">
          <p className="eyebrow text-muted-foreground">
            Order {session.order_number_display} — price locked
          </p>
          <p className="ledger mt-3 inline-block border-b border-gold pb-1 text-xl">
            {formatPaise(session.total_paise)}
          </p>

          {breakdown !== null && (
            <details className="mt-6 border-t pt-3">
              <summary className="eyebrow cursor-pointer text-muted-foreground transition-colors hover:text-gold">
                Price breakdown
              </summary>
              <div className="mt-3">
                <PriceReceipt
                  metalValuePaise={breakdown.metalValuePaise}
                  makingChargesPaise={breakdown.makingChargesPaise}
                  gstMetalPaise={breakdown.gstMetalPaise}
                  gstMakingPaise={breakdown.gstMakingPaise}
                  totalPaise={session.total_paise}
                  gstMetalBps={breakdown.gstMetalBps}
                  gstMakingBps={breakdown.gstMakingBps}
                />
              </div>
            </details>
          )}

          <PaymentSection
            clientSecret={session.client_secret}
            totalPaise={session.total_paise}
            orderId={orderId}
          />
        </section>
      </ReservationCountdown>
    </div>
  );
}

/**
 * Expired gate (the countdown hit 0 client-side OR the server check failed):
 * the engraved hourglass, the Cormorant line, one honest sentence — the
 * expiry sweep returns the pieces to stock. No payment form in this tree.
 */
function ExpiredGate() {
  return (
    <div className="flex flex-col items-center px-4 py-24 text-center">
      <HourglassGlyph />
      <h1 className="mt-6 font-display text-lg tracking-[-0.02em]">
        Your 15-minute hold has ended
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        The piece has returned to the collection — its price will follow the
        live rate when you come back.
      </p>
      <Link href="/cart" className={buttonVariants({ className: "mt-8" })}>
        Return to cart
      </Link>
    </div>
  );
}

/** Cancelled gate: payment failed earlier and the hold was released. */
function CancelledGate() {
  return (
    <div className="flex flex-col items-center px-4 py-24 text-center">
      <p className="eyebrow text-muted-foreground">Order cancelled</p>
      <h1 className="mt-4 font-display text-lg tracking-[-0.02em]">
        This payment didn&apos;t go through
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        The order was cancelled and the hold on your pieces was released — you
        have not been charged.
      </p>
      <Link href="/cart" className={buttonVariants({ className: "mt-8" })}>
        Return to cart
      </Link>
    </div>
  );
}

/** Quiet error gate — the payment session could not be opened. */
function ErrorGate() {
  return (
    <div className="flex flex-col items-center px-4 py-24 text-center">
      <p className="eyebrow text-muted-foreground">Payment</p>
      <h1 className="mt-4 font-display text-lg tracking-[-0.02em]">
        We couldn&apos;t open your payment session
      </h1>
      <p className="mt-3 max-w-sm text-sm text-muted-foreground">
        You have not been charged. Please refresh in a moment — your order
        stays held while its window lasts.
      </p>
      <Link
        href="/cart"
        className={buttonVariants({ variant: "outline", className: "mt-8" })}
      >
        Return to cart
      </Link>
    </div>
  );
}

/** Engraved hourglass — thin single-stroke line treatment (C6 brief). */
function HourglassGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="40"
      height="40"
      fill="none"
      stroke="currentColor"
      strokeWidth="0.75"
      strokeLinecap="round"
      className="text-muted-foreground"
      aria-hidden
    >
      <path d="M7 3h10M7 21h10" />
      <path d="M8 3v2.5c0 2.5 1.5 3.9 4 6.5 2.5-2.6 4-4 4-6.5V3" />
      <path d="M8 21v-2.5c0-2.5 1.5-3.9 4-6.5 2.5 2.6 4 4 4 6.5V21" />
      <path d="M10.8 18.5h2.4" />
    </svg>
  );
}
