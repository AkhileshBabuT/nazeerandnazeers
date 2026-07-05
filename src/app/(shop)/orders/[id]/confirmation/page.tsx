import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { getOrderStatus } from "@/app/actions/orders";
import { createClient } from "@/lib/supabase/server";
import { fulfillmentPath } from "@/lib/checkout/confirmation";
import {
  snapshotReceipt,
  type SnapshotReceipt,
} from "@/lib/checkout/order-receipt";
import { orderNumberDisplay } from "@/lib/orders/checkout";
import type { OrderStatus } from "@/lib/orders/state-machine";
import { formatPaise } from "@/lib/format";
import { PriceReceipt } from "@/components/storefront/price-receipt";
import { StatusPoller } from "@/components/checkout/status-poller";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Order confirmation" };

/** One frozen `order_items` row, as this certificate renders it (ADR-0003). */
interface ConfirmationLine {
  id: string;
  name_snapshot: string;
  unit_price_paise: number;
  making_charges_paise: number;
  quantity: number;
}

/**
 * C7 Confirmation `/orders/[id]/confirmation` (PRD 04 C7) — the Stripe
 * `return_url` landing. The certificate shell is read once, server-side,
 * from the Order's FROZEN snapshot columns under the caller's own RLS (a
 * foreign or unknown id reads as zero rows → 404). Live status resolution —
 * the webhook race — belongs to the StatusPoller island, which starts from
 * the server-read status and polls `getOrderStatus` while still pending.
 * All five state cards render here on the server; the island only picks one.
 */
export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connection();

  if (!z.string().uuid().safeParse(id).success) {
    notFound();
  }

  const supabase = await createClient();
  const [orderRes, itemsRes, statusResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "order_number, order_year, total_paise, gst_metal_bps, gst_making_bps",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select("id, name_snapshot, unit_price_paise, making_charges_paise, quantity")
      .eq("order_id", id),
    getOrderStatus(id),
  ]);
  if (orderRes.error !== null) throw orderRes.error;
  if (itemsRes.error !== null) throw itemsRes.error;
  const order = orderRes.data;
  if (order === null || !statusResult.ok) {
    notFound();
  }

  const orderNo = orderNumberDisplay(order.order_year, order.order_number);
  const lines: ConfirmationLine[] = itemsRes.data;
  const receipt = snapshotReceipt(lines, order);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 py-10 md:py-14">
      <StatusPoller
        orderId={id}
        initialStatus={statusResult.status}
        initialAutoRefunded={statusResult.auto_refunded}
        processing={<ProcessingCard orderNo={orderNo} />}
        paid={
          <PaidCertificate
            orderId={id}
            orderNo={orderNo}
            lines={lines}
            receipt={receipt}
            totalPaise={order.total_paise}
            gstMetalBps={order.gst_metal_bps}
            gstMakingBps={order.gst_making_bps}
          />
        }
        autoRefunded={
          <RefundedCard orderNo={orderNo} totalPaise={order.total_paise} />
        }
        cancelled={<CancelledCard />}
        timeout={<TimeoutCard orderNo={orderNo} />}
      />
    </div>
  );
}

/**
 * Processing: the same certificate card holding a quiet pulsing gold rule —
 * no spinners (C7 brief: a document, not a dopamine burst).
 */
function ProcessingCard({ orderNo }: { orderNo: string }) {
  return (
    <section
      aria-live="polite"
      className="rounded-sm border bg-card px-6 py-16 text-center md:px-10"
    >
      <div className="mx-auto h-px w-24 animate-pulse bg-gold" aria-hidden />
      <h1 className="mt-8 font-display text-lg italic tracking-[-0.02em]">
        Confirming your payment…
      </h1>
      <p className="ledger mt-3 text-sm text-muted-foreground">{orderNo}</p>
    </section>
  );
}

/**
 * Paid (and revived — a revive IS a plain success): the certificate. A thin
 * gold double-rule frame around the white card; the frozen receipt; the
 * four-step timeline derived from the order state machine.
 */
function PaidCertificate({
  orderId,
  orderNo,
  lines,
  receipt,
  totalPaise,
  gstMetalBps,
  gstMakingBps,
}: {
  orderId: string;
  orderNo: string;
  lines: ConfirmationLine[];
  receipt: SnapshotReceipt;
  totalPaise: number;
  gstMetalBps: number;
  gstMakingBps: number;
}) {
  return (
    <div className="rounded-sm border border-gold p-1">
      <section className="rounded-sm border border-gold bg-card px-6 py-10 md:px-10">
        <header className="text-center">
          <h1 className="eyebrow text-muted-foreground">Order confirmed</h1>
          <p className="ledger mt-3 text-lg">{orderNo}</p>
        </header>

        <ul className="mt-8 border-t">
          {lines.map((line) => (
            <li
              key={line.id}
              className="flex items-baseline justify-between gap-4 border-b py-3"
            >
              <span className="font-display text-md tracking-[-0.02em]">
                {line.name_snapshot}
              </span>
              {line.quantity > 1 && (
                <span className="ledger shrink-0 text-sm text-muted-foreground">
                  × {line.quantity}
                </span>
              )}
            </li>
          ))}
        </ul>

        <div className="mt-6">
          <PriceReceipt
            metalValuePaise={receipt.metalValuePaise}
            makingChargesPaise={receipt.makingChargesPaise}
            gstMetalPaise={receipt.gstMetalPaise}
            gstMakingPaise={receipt.gstMakingPaise}
            totalPaise={totalPaise}
            gstMetalBps={gstMetalBps}
            gstMakingBps={gstMakingBps}
          />
        </div>

        <div className="mt-10">
          <p className="eyebrow text-muted-foreground">What happens next</p>
          <NextStepsTimeline path={fulfillmentPath("paid")} />
        </div>

        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <Link
            href={`/account/orders/${orderId}`}
            className={buttonVariants()}
          >
            View order
          </Link>
          <Link
            href="/shop"
            className={buttonVariants({ variant: "outline" })}
          >
            Continue shopping
          </Link>
        </div>
      </section>
    </div>
  );
}

/**
 * The four fulfillment stations on a hairline (C7 brief): small-caps labels,
 * square nodes (radius rule — nothing pill-shaped here), first node filled
 * charcoal. The station order comes from the state machine, not a literal.
 */
function NextStepsTimeline({ path }: { path: readonly OrderStatus[] }) {
  return (
    <ol className="relative mt-4 flex justify-between">
      <span
        className="absolute left-2 right-2 top-[3px] h-px bg-border"
        aria-hidden
      />
      {path.map((station, i) => (
        <li key={station} className="relative flex flex-col items-center gap-2">
          <span
            className={
              i === 0
                ? "h-[7px] w-[7px] bg-foreground"
                : "h-[7px] w-[7px] border bg-card"
            }
            aria-hidden
          />
          <span
            className={
              i === 0 ? "eyebrow" : "eyebrow text-muted-foreground"
            }
          >
            {station}
          </span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Auto-refunded (ADR-0004 safety valve): the certificate form kept, stamped
 * sienna REFUNDED — two unhurried sentences, the amount in mono, nothing
 * apologetic in red.
 */
function RefundedCard({
  orderNo,
  totalPaise,
}: {
  orderNo: string;
  totalPaise: number;
}) {
  return (
    <section className="rounded-sm border bg-card px-6 py-10 text-center md:px-10">
      <p className="eyebrow text-muted-foreground">Order {orderNo}</p>
      <span className="eyebrow mt-6 inline-block -rotate-6 border-2 border-hallmark px-4 py-1.5 text-hallmark">
        Refunded
      </span>
      <p className="mx-auto mt-8 max-w-md text-sm text-muted-foreground">
        Your payment arrived after the 15-minute hold had ended, and the piece
        had already been claimed. A full refund of{" "}
        <span className="ledger text-foreground">
          {formatPaise(totalPaise)}
        </span>{" "}
        is on its way to your original payment method.
      </p>
      <p className="mx-auto mt-4 max-w-md text-sm text-muted-foreground">
        If anything looks off, write to{" "}
        <a
          href="mailto:contact@nazeerandnazeers.example"
          className="underline underline-offset-2 transition-colors hover:text-gold"
        >
          contact@nazeerandnazeers.example
        </a>
        .
      </p>
      <Link
        href="/shop"
        className={buttonVariants({ variant: "outline", className: "mt-8" })}
      >
        Continue shopping
      </Link>
    </section>
  );
}

/**
 * Still pending past the 60s cap: honest copy pointing to the orders page —
 * email is deferred, so no email promises.
 */
function TimeoutCard({ orderNo }: { orderNo: string }) {
  return (
    <section className="rounded-sm border bg-card px-6 py-12 text-center md:px-10">
      <p className="eyebrow text-muted-foreground">Order {orderNo}</p>
      <h1 className="mt-4 font-display text-lg tracking-[-0.02em]">
        This is taking longer than usual
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        Your payment is still being confirmed. Check your orders page in a few
        minutes — the latest status will be there.
      </p>
      <Link
        href="/account/orders"
        className={buttonVariants({ className: "mt-8" })}
      >
        Go to your orders
      </Link>
    </section>
  );
}

/** Plain cancel: the payment did not complete and money never moved. */
function CancelledCard() {
  return (
    <section className="rounded-sm border bg-card px-6 py-12 text-center md:px-10">
      <p className="eyebrow text-muted-foreground">Order cancelled</p>
      <h1 className="mt-4 font-display text-lg tracking-[-0.02em]">
        This payment didn&apos;t go through
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm text-muted-foreground">
        The order was cancelled and the hold on your pieces was released — you
        have not been charged.
      </p>
      <Link href="/cart" className={buttonVariants({ className: "mt-8" })}>
        Return to cart
      </Link>
    </section>
  );
}
