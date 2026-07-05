import Link from "next/link";
import { listOrders } from "@/app/actions/admin";
import { orderNumberDisplay } from "@/lib/orders/checkout";
import { formatPaise } from "@/lib/format";
import type { OrderStatus } from "@/lib/orders/state-machine";
import { cn } from "@/lib/utils";

export const metadata = { title: "Orders" };

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
  "partially_refunded",
];

function statusColor(status: OrderStatus): string {
  if (status === "paid" || status === "processing" || status === "shipped") return "text-gold";
  if (status === "delivered") return "text-rate-up";
  if (status === "refunded" || status === "partially_refunded") return "text-hallmark";
  if (status === "cancelled") return "text-muted-foreground line-through";
  return "text-muted-foreground";
}

function shortUserId(userId: string): string {
  return "u_" + userId.replace(/-/g, "").slice(0, 6);
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

/**
 * A4 /admin/orders — order registry. Status filter chips via searchParams
 * (dynamic, no cache needed for this admin surface).
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: filterStatus } = await searchParams;

  const result = await listOrders(200);
  if (!result.ok) {
    return <p className="text-destructive text-sm">{result.code}</p>;
  }

  const allOrders = result.data;
  const filtered = filterStatus
    ? allOrders.filter((o) => o.status === filterStatus)
    : allOrders;

  return (
    <div className="space-y-8">
      <h1 className="eyebrow text-muted-foreground">Orders</h1>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/orders"
          className={cn(
            "eyebrow rounded-xs border px-3 py-1.5 text-xs transition-colors hover:border-foreground",
            !filterStatus
              ? "border-foreground text-foreground"
              : "border-border text-muted-foreground",
          )}
        >
          All ({allOrders.length})
        </Link>
        {ALL_STATUSES.map((s) => {
          const count = allOrders.filter((o) => o.status === s).length;
          if (count === 0) return null;
          return (
            <Link
              key={s}
              href={`/admin/orders?status=${s}`}
              className={cn(
                "eyebrow rounded-xs border px-3 py-1.5 text-xs transition-colors hover:border-foreground",
                filterStatus === s
                  ? "border-foreground text-foreground"
                  : "border-border text-muted-foreground",
              )}
            >
              {s.replace(/_/g, " ")} ({count})
            </Link>
          );
        })}
      </div>

      {/* Order rows */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No orders.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="eyebrow pb-2 text-left text-xs text-muted-foreground">Order</th>
              <th className="eyebrow pb-2 text-left text-xs text-muted-foreground">Customer</th>
              <th className="eyebrow pb-2 text-left text-xs text-muted-foreground">Date</th>
              <th className="eyebrow pb-2 text-left text-xs text-muted-foreground">Status</th>
              <th className="eyebrow pb-2 text-right text-xs text-muted-foreground">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((order) => (
              <tr
                key={order.id}
                className="odd:bg-muted/30 transition-colors hover:bg-muted/50"
              >
                <td className="py-3">
                  <Link
                    href={`/admin/orders/${order.id}`}
                    className="ledger text-xs hover:text-gold"
                  >
                    {orderNumberDisplay(order.order_year, order.order_number)}
                  </Link>
                </td>
                <td className="ledger py-3 text-xs text-muted-foreground">
                  {shortUserId(order.user_id)}
                </td>
                <td className="py-3 text-xs text-muted-foreground">
                  {shortDate(order.created_at)}
                </td>
                <td className="py-3">
                  <span className={`eyebrow text-xs ${statusColor(order.status as OrderStatus)}`}>
                    {order.status.replace(/_/g, " ")}
                  </span>
                </td>
                <td className="py-3 text-right">
                  <span className="ledger text-xs">{formatPaise(order.total_paise)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
