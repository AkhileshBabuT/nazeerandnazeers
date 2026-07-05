import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { getOrderDetail } from "@/app/actions/admin";
import { AUTO_REFUND_REASON } from "@/lib/orders/service";
import { isMoneyMoved, type OrderStatus } from "@/lib/orders/state-machine";
import { snapshotReceipt } from "@/lib/checkout/order-receipt";
import { orderNumberDisplay } from "@/lib/orders/checkout";
import { formatPaise } from "@/lib/format";
import { PriceReceipt } from "@/components/storefront/price-receipt";
import { HallmarkBadge } from "@/components/storefront/hallmark-badge";
import { OrderFulfillmentRail } from "@/components/admin/order-fulfillment";
import { RefundComposer } from "@/components/admin/refund-composer";

export const metadata = { title: "Order" };

function shortDatetime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function statusColor(status: OrderStatus): string {
  if (status === "paid" || status === "processing" || status === "shipped") return "text-gold";
  if (status === "delivered") return "text-foreground";
  if (status === "refunded" || status === "partially_refunded") return "text-hallmark";
  return "text-muted-foreground";
}

/**
 * A4b + A5 /admin/orders/[id] — full snapshot detail + fulfillment state rail
 * + refund panel (paid orders only). Reads via `getOrderDetail` (admin RLS).
 */
export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const result = await getOrderDetail(id);
  if (!result.ok) {
    if (result.code === "not_found") notFound();
    return <p className="text-destructive text-sm">{result.code}</p>;
  }
  const order = result.data;
  const status = order.status as OrderStatus;
  const moneyMoved = isMoneyMoved(status);

  const receipt = snapshotReceipt(order.items, {
    gst_metal_bps: order.gst_metal_bps,
    gst_making_bps: order.gst_making_bps,
  });

  /* Remaining charge = total paid minus all refunds issued so far. */
  const refundedTotal = order.refunds.reduce((sum, r) => sum + r.amount_paise, 0);
  const remainingChargePaise = order.total_paise - refundedTotal;

  const isFullyRefunded =
    status === "refunded" || remainingChargePaise <= 0;
  const isRefundable = moneyMoved && !isFullyRefunded;

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      {/* Header */}
      <div>
        <div className="flex items-baseline gap-3">
          <Link
            href="/admin/orders"
            className="eyebrow text-xs text-muted-foreground hover:text-gold"
          >
            ← Orders
          </Link>
        </div>
        <div className="mt-4 flex items-baseline justify-between">
          <h1 className="ledger text-lg">
            {orderNumberDisplay(order.order_year, order.order_number)}
          </h1>
          <span className={`eyebrow text-xs ${statusColor(status)}`}>
            {status.replace(/_/g, " ")}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {shortDatetime(order.created_at)} IST
        </p>
      </div>

      {/* State rail — fulfillment stepper */}
      <OrderFulfillmentRail orderId={order.id} status={status} />

      {/* No cancel on paid orders (ADR-0009) */}
      {moneyMoved && (
        <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
          Paid orders cannot be cancelled — only refunded. Use the refund panel below.
        </p>
      )}

      {/* Line items */}
      <div>
        <p className="eyebrow text-xs text-muted-foreground mb-3">Items</p>
        <ul className="divide-y border-t">
          {order.items.map((item) => (
            <li key={item.id} className="py-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="font-display text-md tracking-[-0.02em]">
                  {item.name_snapshot}
                </span>
                <span className="ledger shrink-0 text-sm">
                  {formatPaise(item.unit_price_paise)}
                  {item.quantity > 1 && ` × ${item.quantity}`}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3">
                <span className="ledger text-xs text-muted-foreground">
                  {item.sku_snapshot}
                </span>
                {item.refunded_quantity > 0 && (
                  <span className="eyebrow text-xs text-hallmark">
                    {item.refunded_quantity}/{item.quantity} refunded
                  </span>
                )}
              </div>
              {item.hallmark_huid_snapshot && (
                <div className="mt-2">
                  <HallmarkBadge huid={item.hallmark_huid_snapshot} />
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Snapshot receipt */}
      <div>
        <p className="eyebrow text-xs text-muted-foreground mb-3">Bill snapshot</p>
        <PriceReceipt
          metalValuePaise={receipt.metalValuePaise}
          makingChargesPaise={receipt.makingChargesPaise}
          gstMetalPaise={receipt.gstMetalPaise}
          gstMakingPaise={receipt.gstMakingPaise}
          totalPaise={order.total_paise}
          gstMetalBps={order.gst_metal_bps}
          gstMakingBps={order.gst_making_bps}
        />
        {refundedTotal > 0 && (
          <div className="mt-3 flex justify-between border-t pt-3 text-sm">
            <span className="eyebrow text-xs text-muted-foreground">Total refunded</span>
            <span className="ledger text-hallmark">{formatPaise(refundedTotal)}</span>
          </div>
        )}
      </div>

      {/* Refund ledger */}
      {order.refunds.length > 0 && (
        <div>
          <p className="eyebrow text-xs text-muted-foreground mb-3">Refund ledger</p>
          <ul className="divide-y border-t">
            {order.refunds.map((r) => {
              const isAuto = r.reason === AUTO_REFUND_REASON;
              return (
                <li key={r.id} className="flex items-baseline justify-between gap-4 py-3">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="eyebrow text-xs">
                        {r.kind === "item" ? "Item" : "Goodwill"}
                        {r.quantity !== null && r.quantity > 1 && ` × ${r.quantity}`}
                      </span>
                      {isAuto && (
                        <span className="eyebrow rounded-xs bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                          AUTO
                        </span>
                      )}
                    </div>
                    {r.reason && !isAuto && (
                      <span className="text-xs text-muted-foreground">{r.reason}</span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {shortDatetime(r.created_at)}
                    </span>
                  </div>
                  <span className="ledger shrink-0 text-sm text-hallmark">
                    {formatPaise(r.amount_paise)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Refund panel (A5) — paid orders only */}
      {isRefundable && (
        <div>
          <p className="eyebrow text-xs text-muted-foreground mb-3">Issue refund</p>
          <RefundComposer
            orderId={order.id}
            items={order.items}
            gst={{
              gst_metal_bps: order.gst_metal_bps,
              gst_making_bps: order.gst_making_bps,
            }}
            remainingChargePaise={remainingChargePaise}
          />
        </div>
      )}

      {isFullyRefunded && (
        <p className="eyebrow text-xs text-muted-foreground border-l-2 border-hallmark pl-3 text-hallmark">
          Fully refunded — no further refunds available.
        </p>
      )}
    </div>
  );
}
