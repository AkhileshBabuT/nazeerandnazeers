import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { orderNumberDisplay } from "@/lib/orders/checkout";
import { formatPaise } from "@/lib/format";
import type { OrderStatus } from "@/lib/orders/state-machine";

export const metadata = { title: "Your orders" };

const PAGE_SIZE = 50;

/** Border + text colour keyed to order status for the eyebrow chip. */
function statusChip(status: OrderStatus): string {
  if (status === "delivered") return "border-rate-up/50 text-rate-up";
  if (status === "refunded" || status === "partially_refunded") {
    return "border-hallmark/50 text-hallmark";
  }
  if (status === "cancelled") return "border-border text-muted-foreground line-through";
  return "border-border text-foreground"; // paid, processing, shipped, pending
}

/** Short date in IST (e.g. "12 Jun 2026"). */
function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

/**
 * C8 /account/orders — the customer's order history. Reads own orders
 * under RLS (no service-role), newest first. Signed-out → login.
 */
export default async function OrderHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    redirect("/login?next=/account/orders");
  }

  const { page: pageStr } = await searchParams;
  const page = Math.max(0, parseInt(pageStr ?? "", 10) || 0);
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: orders, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, order_year, status, total_paise, created_at, order_items(name_snapshot)",
    )
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) throw error;

  const sinceYear = user.created_at.slice(0, 4);

  return (
    <div className="px-4 py-14 md:px-12">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="font-display text-xl tracking-[-0.02em]">Your orders</h1>
          <p className="eyebrow mt-1 text-muted-foreground">Since {sinceYear}</p>
        </div>
        <Link
          href="/account"
          className="eyebrow text-xs text-muted-foreground underline-offset-2 hover:text-gold"
        >
          ← Account
        </Link>
      </div>

      {!orders || orders.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          {/* Document icon — rectangle with folded top-right corner */}
          <span className="relative block h-14 w-10 border border-foreground/25">
            <span className="absolute right-0 top-0 h-3.5 w-3.5 border-b border-l border-foreground/25 bg-background" />
          </span>
          <p className="eyebrow mt-6 text-muted-foreground">No orders yet</p>
          <Link
            href="/shop"
            className="eyebrow mt-4 inline-block border-b border-foreground pb-1 text-sm transition-colors hover:border-gold hover:text-gold"
          >
            Browse pieces
          </Link>
        </div>
      ) : (
        <>
          {/* Column headers — desktop only */}
          <div className="mt-8 hidden grid-cols-[160px_1fr_130px_130px] gap-4 border-b pb-2.5 md:grid">
            <span className="eyebrow text-muted-foreground">Order</span>
            <span className="eyebrow text-muted-foreground">Piece</span>
            <span className="eyebrow text-muted-foreground">Status</span>
            <span className="eyebrow text-right text-muted-foreground">Amount</span>
          </div>

          <ul className="border-t md:border-t-0">
            {orders.map((order) => {
              const firstPiece =
                Array.isArray(order.order_items)
                  ? (order.order_items[0] as { name_snapshot: string } | undefined)
                      ?.name_snapshot ?? "—"
                  : "—";
              const chip = statusChip(order.status as OrderStatus);
              return (
                <li key={order.id}>
                  <Link
                    href={`/account/orders/${order.id}`}
                    className="grid grid-cols-1 gap-1.5 border-b py-5 transition-colors hover:text-gold md:grid-cols-[160px_1fr_130px_130px] md:items-baseline md:gap-4"
                  >
                    <div>
                      <span className="ledger text-sm">
                        {orderNumberDisplay(order.order_year, order.order_number)}
                      </span>
                      <span className="ledger block text-xs text-muted-foreground">
                        {shortDate(order.created_at)}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground md:text-foreground">
                      {firstPiece}
                    </span>
                    <span>
                      <span
                        className={`eyebrow inline-block border px-2 py-0.5 text-xs ${chip}`}
                      >
                        {(order.status as string).replace(/_/g, " ")}
                      </span>
                    </span>
                    <span className="ledger text-sm md:text-right">
                      {formatPaise(order.total_paise)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          {orders.length === PAGE_SIZE && (
            <div className="mt-6 text-center">
              <Link
                href={`/account/orders?page=${page + 1}`}
                className="eyebrow text-xs text-muted-foreground underline-offset-2 hover:text-gold"
              >
                Load more
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
