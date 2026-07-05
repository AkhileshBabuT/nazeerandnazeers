import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { orderNumberDisplay } from "@/lib/orders/checkout";
import {
  isMoneyMoved,
  type OrderStatus,
} from "@/lib/orders/state-machine";
import { snapshotReceipt } from "@/lib/checkout/order-receipt";
import { formatPaise } from "@/lib/format";

export const metadata = { title: "Order" };

function longDatetime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
    hour12: false,
  }).format(new Date(iso));
}

function placedDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function shortRefundDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function statusLabel(status: OrderStatus): string {
  const map: Record<OrderStatus, string> = {
    pending: "PENDING",
    paid: "PAID",
    processing: "PROCESSING",
    shipped: "SHIPPED",
    delivered: "DELIVERED",
    cancelled: "CANCELLED",
    refunded: "REFUNDED",
    partially_refunded: "PARTIALLY REFUNDED",
  };
  return map[status] ?? status.toUpperCase();
}

function statusBadgeClass(status: OrderStatus): string {
  if (status === "refunded" || status === "partially_refunded") return "border-[#DBC3AE] text-hallmark";
  if (status === "delivered") return "border-rate-up text-rate-up";
  if (status === "cancelled") return "border-border text-muted-foreground line-through";
  if (status === "paid" || status === "processing" || status === "shipped") return "border-gold text-gold";
  return "border-border text-muted-foreground";
}

function refundKindChip(kind: string, reason: string | null): { label: string; cls: string } {
  const isAuto = reason === "auto_refund_late_payment";
  if (isAuto || kind === "auto") return { label: "AUTO", cls: "border-[#DBC3AE] text-muted-foreground" };
  if (kind === "goodwill") return { label: "GOODWILL", cls: "border-border text-muted-foreground" };
  return { label: "ITEM", cls: "border-[#DBC3AE] text-hallmark" };
}

const STATIONS: OrderStatus[] = ["pending", "paid", "processing", "shipped", "delivered"];

export default async function CustomerOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) redirect(`/login?next=/account/orders/${id}`);

  const [orderRes, itemsRes, refundsRes] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, order_number, order_year, status, created_at, total_paise, subtotal_paise, making_charges_paise, gst_paise, gst_metal_bps, gst_making_bps, shipping_address, gold_rate_snapshot_paise, silver_rate_snapshot_paise",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("order_items")
      .select(
        "id, name_snapshot, sku_snapshot, material, purity_karat, hallmark_huid_snapshot, unit_price_paise, making_charges_paise, quantity, refunded_quantity, weight_grams",
      )
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
    supabase
      .from("refunds")
      .select("id, kind, amount_paise, quantity, reason, created_at, order_item_id")
      .eq("order_id", id)
      .order("created_at", { ascending: true }),
  ]);

  if (orderRes.error) throw orderRes.error;
  if (!orderRes.data) notFound();

  const order = orderRes.data;
  const items = itemsRes.data ?? [];
  const refunds = refundsRes.data ?? [];
  const status = order.status as OrderStatus;
  const moneyMoved = isMoneyMoved(status);

  const receipt = snapshotReceipt(items, {
    gst_metal_bps: order.gst_metal_bps,
    gst_making_bps: order.gst_making_bps,
  });

  const stationIdx = STATIONS.indexOf(status);
  const isRefundTerminal = status === "refunded" || status === "partially_refunded";
  const isCancelled = status === "cancelled";
  const orderNum = orderNumberDisplay(order.order_year, order.order_number);

  const receiptRows = [
    { label: "METAL VALUE", amount: formatPaise(receipt.metalValuePaise) },
    { label: "MAKING CHARGES", amount: formatPaise(receipt.makingChargesPaise) },
    { label: `GST ON METAL @ ${order.gst_metal_bps / 100}%`, amount: formatPaise(receipt.gstMetalPaise) },
    { label: `GST ON MAKING @ ${order.gst_making_bps / 100}%`, amount: formatPaise(receipt.gstMakingPaise) },
  ];

  return (
    <div className="mx-auto max-w-[960px] px-12 py-12 pb-[72px]">
      <div className="eyebrow mb-[22px] text-[11px] tracking-[0.08em] text-muted-foreground">
        ACCOUNT · ORDERS · {orderNum}
      </div>

      <div className="rounded-[4px] border border-border bg-card p-10">
        {/* Header */}
        <div className="flex items-end justify-between border-b border-border pb-6">
          <div>
            <div className="eyebrow text-[11px] tracking-[0.08em] text-muted-foreground">
              PLACED {placedDate(order.created_at).toUpperCase()}
            </div>
            <h1 className="font-display mt-[6px] mb-0 text-[42px] font-medium tracking-[-0.02em] text-foreground">
              {orderNum}
            </h1>
          </div>
          <span className={`eyebrow rounded-[2px] border px-[11px] py-[5px] text-[10px] tracking-[0.1em] ${statusBadgeClass(status)}`}>
            {statusLabel(status)}
          </span>
        </div>

        {/* Timeline */}
        <div className="my-8">
          {isCancelled ? (
            <div className="relative flex items-start opacity-50">
              <div className="absolute left-0 right-0 top-[5px] h-px bg-border" />
              {STATIONS.map((station) => (
                <div key={station} className="relative flex flex-1 flex-col items-center">
                  <span className="h-[11px] w-[11px] rounded-full border border-border bg-card" />
                  <span className="eyebrow mt-[10px] text-center text-[9px] tracking-[0.08em] text-muted-foreground line-through">
                    {station.toUpperCase()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative flex items-start">
              <div className="absolute left-0 right-0 top-[5px] h-px bg-border" />
              {STATIONS.map((station, i) => {
                const done = isRefundTerminal ? true : (stationIdx >= 0 && i <= stationIdx);
                return (
                  <div key={station} className="relative flex flex-1 flex-col items-center">
                    <span
                      className={
                        done
                          ? "h-[11px] w-[11px] rounded-full bg-foreground border-foreground border"
                          : "h-[11px] w-[11px] rounded-full border border-border bg-card"
                      }
                    />
                    <span
                      className={`eyebrow mt-[10px] text-center text-[9px] tracking-[0.08em] ${done ? "text-foreground" : "text-muted-foreground"}`}
                    >
                      {station.toUpperCase()}
                    </span>
                  </div>
                );
              })}
              {isRefundTerminal && (
                <div className="relative flex flex-1 flex-col items-center">
                  <span className="h-[11px] w-[11px] rounded-full border border-hallmark bg-hallmark" />
                  <span className="eyebrow mt-[10px] text-center text-[9px] tracking-[0.08em] text-hallmark">
                    {status === "partially_refunded" ? "PARTLY REF." : "REFUNDED"}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Billed breakdown / cancelled message */}
        <div className="border-t border-border pt-6">
          {isCancelled ? (
            <p className="text-[13px] text-foreground">
              {moneyMoved
                ? "This order was cancelled. Any charges have been refunded."
                : "Payment did not complete — nothing was charged."}
            </p>
          ) : (
            <>
              <div className="eyebrow mb-3 text-[11px] tracking-[0.08em] text-muted-foreground">
                BILLED BREAKDOWN — FROZEN
              </div>
              {receiptRows.map((row) => (
                <div
                  key={row.label}
                  className="flex justify-between border-t border-[#EFEAE2] py-2 text-[11px]"
                >
                  <span className="text-foreground">{row.label}</span>
                  <span className="ledger tabular-nums text-foreground">{row.amount}</span>
                </div>
              ))}
              <div className="mt-2 h-[2px] bg-foreground" />
              <div className="flex items-baseline justify-between pt-3">
                <span className="eyebrow text-[13px] font-medium tracking-[0.08em] text-foreground">
                  TOTAL BILLED
                </span>
                <span className="ledger border-b-2 border-gold pb-[3px] text-[22px] font-medium tabular-nums text-foreground">
                  {formatPaise(order.total_paise)}
                </span>
              </div>
              {order.gold_rate_snapshot_paise !== null && (
                <p className="ledger mt-3 text-[11px] text-muted-foreground">
                  Billed at gold {formatPaise(order.gold_rate_snapshot_paise)}/g on{" "}
                  {longDatetime(order.created_at)}. Snapshotted prices never change.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Pieces */}
      {!isCancelled && (
        <div className="mt-8">
          <div className="eyebrow border-b border-foreground pb-3 text-[11px] tracking-[0.08em] text-muted-foreground">
            PIECES
          </div>
          {items.map((item) => (
            <div key={item.id} className="flex gap-[22px] border-b border-border py-[22px] items-start">
              <div className="h-[100px] w-[80px] flex-none bg-muted" />
              <div className="flex-1">
                <div className="font-display text-[22px] font-medium tracking-[-0.02em] text-foreground">
                  {item.name_snapshot}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-4">
                  <span className="ledger text-xs text-muted-foreground">{item.sku_snapshot}</span>
                  {item.hallmark_huid_snapshot && item.material === "gold" && (
                    <span className="ledger rounded-[2px] border border-[#DBC3AE] px-2 py-0.5 text-xs text-hallmark">
                      HUID {item.hallmark_huid_snapshot}
                    </span>
                  )}
                </div>
                {item.refunded_quantity > 0 && (
                  <div className="mt-3 inline-block rounded-[2px] border border-[#DBC3AE] bg-[#FBF6EF] px-[9px] py-1 eyebrow text-[10px] tracking-[0.1em] text-hallmark">
                    {item.refunded_quantity} OF {item.quantity} REFUNDED
                  </div>
                )}
              </div>
              <div className="min-w-[160px] text-right">
                <div className="ledger text-[15px] tabular-nums text-foreground">
                  {formatPaise(item.unit_price_paise * item.quantity)}
                </div>
                {item.quantity > 1 && (
                  <div className="ledger mt-1 text-xs text-muted-foreground">
                    {formatPaise(item.unit_price_paise)} × {item.quantity}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Refunds sub-ledger */}
      {refunds.length > 0 && (
        <div className="mt-9 rounded-[4px] border border-[#DBC3AE] p-6">
          <div className="eyebrow border-b border-[#EAD9C7] pb-3 text-[11px] tracking-[0.08em] text-hallmark">
            REFUNDS
          </div>
          <div className="grid grid-cols-[100px_110px_1fr_130px] gap-4 py-3 eyebrow text-[10px] tracking-[0.1em] text-muted-foreground">
            <span>DATE</span>
            <span>KIND</span>
            <span>REASON</span>
            <span className="text-right">AMOUNT</span>
          </div>
          {refunds.map((r) => {
            const chip = refundKindChip(r.kind, r.reason);
            return (
              <div
                key={r.id}
                className="grid grid-cols-[100px_110px_1fr_130px] items-center gap-4 border-t border-[#EFEAE2] py-3"
              >
                <span className="ledger text-[12px] text-foreground">
                  {shortRefundDate(r.created_at)}
                </span>
                <span>
                  <span className={`eyebrow inline-block rounded-[2px] border px-[7px] py-[3px] text-[9px] tracking-[0.1em] ${chip.cls}`}>
                    {chip.label}
                  </span>
                </span>
                <span className="text-[12px] text-muted-foreground">{r.reason ?? "—"}</span>
                <span className="ledger text-right text-[13px] tabular-nums text-hallmark">
                  −{formatPaise(r.amount_paise)}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Contact */}
      <div className="mt-7">
        <a
          href={`mailto:contact@nazeerandnazeers.example?subject=Order ${orderNum}`}
          className="text-xs text-muted-foreground underline underline-offset-[3px] transition-colors hover:text-gold"
        >
          Contact us about this order
        </a>
      </div>
    </div>
  );
}
