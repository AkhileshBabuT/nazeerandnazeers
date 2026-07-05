"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  refundOrderItems,
  goodwillRefund,
} from "@/app/actions/admin";
import { itemRefundAmountPaise } from "@/lib/orders/refund";
import type { OrderGstSnapshot } from "@/lib/orders/refund";
import { formatPaise } from "@/lib/format";
import { Button } from "@/components/ui/button";

interface RefundItem {
  id: string;
  name_snapshot: string;
  unit_price_paise: number;
  making_charges_paise: number;
  quantity: number;
  refunded_quantity: number;
}

/**
 * A5 Refund panel — item-level + goodwill refunds. Client-side amount
 * preview uses the same pure `itemRefundAmountPaise`; server recomputes
 * authoritatively (ADR-0003/0005). Confirm dialog restates amounts.
 */
export function RefundComposer({
  orderId,
  items,
  gst,
  remainingChargePaise,
}: {
  orderId: string;
  items: RefundItem[];
  gst: OrderGstSnapshot;
  remainingChargePaise: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Item refund state
  const [itemQtys, setItemQtys] = useState<Record<string, number>>({});
  const [itemReason, setItemReason] = useState("");
  const [confirmingItem, setConfirmingItem] = useState(false);

  // Goodwill state
  const [goodwillRupees, setGoodwillRupees] = useState("");
  const [goodwillReason, setGoodwillReason] = useState("");
  const [confirmingGoodwill, setConfirmingGoodwill] = useState(false);

  /** Lines selected for item refund. */
  const selectedLines = items
    .filter((item) => (itemQtys[item.id] ?? 0) > 0)
    .map((item) => ({
      order_item_id: item.id,
      quantity: itemQtys[item.id] ?? 0,
    }));

  /** Client-side preview of item refund total. */
  let itemPreviewPaise = 0;
  try {
    for (const line of selectedLines) {
      const item = items.find((i) => i.id === line.order_item_id)!;
      itemPreviewPaise += itemRefundAmountPaise(
        {
          order_item_id: item.id,
          unit_price_paise: item.unit_price_paise,
          making_charges_paise: item.making_charges_paise,
          quantity: item.quantity,
          refunded_quantity: item.refunded_quantity,
        },
        line.quantity,
        gst,
      );
    }
  } catch {
    itemPreviewPaise = 0;
  }

  const goodwillPaise = Math.round(parseFloat(goodwillRupees || "0") * 100);
  const goodwillValid =
    goodwillPaise > 0 && goodwillPaise <= remainingChargePaise && goodwillReason.trim();

  function submitItemRefund() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await refundOrderItems({
        order_id: orderId,
        items: selectedLines,
        reason: itemReason || undefined,
      });
      if (result.ok) {
        setSuccess(`Refunded ${formatPaise(result.data.refund_amount_paise)}.`);
        setItemQtys({});
        setItemReason("");
        setConfirmingItem(false);
        router.refresh();
      } else if (result.code === "error") {
        setError(result.message);
        setConfirmingItem(false);
      } else {
        setError(result.code.replace(/_/g, " "));
        setConfirmingItem(false);
      }
    });
  }

  function submitGoodwill() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const result = await goodwillRefund({
        order_id: orderId,
        amount_paise: goodwillPaise,
        reason: goodwillReason,
      });
      if (result.ok) {
        setSuccess(`Refunded ${formatPaise(result.data.refund_amount_paise)}.`);
        setGoodwillRupees("");
        setGoodwillReason("");
        setConfirmingGoodwill(false);
        router.refresh();
      } else if (result.code === "error") {
        setError(result.message);
        setConfirmingGoodwill(false);
      } else {
        setError(result.code.replace(/_/g, " "));
        setConfirmingGoodwill(false);
      }
    });
  }

  const refundableItems = items.filter(
    (i) => i.quantity - i.refunded_quantity > 0,
  );

  return (
    <div className="space-y-8">
      {success && <p className="eyebrow text-xs text-gold">{success}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Item refund composer */}
      {refundableItems.length > 0 && (
        <div>
          <p className="eyebrow text-xs text-muted-foreground mb-3">Item refund</p>
          <div className="space-y-3">
            {refundableItems.map((item) => {
              const remaining = item.quantity - item.refunded_quantity;
              const qty = itemQtys[item.id] ?? 0;
              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-4 border-b py-2"
                >
                  <div>
                    <p className="text-sm">{item.name_snapshot}</p>
                    <p className="ledger text-xs text-muted-foreground">
                      {formatPaise(
                        itemRefundAmountPaise(
                          {
                            order_item_id: item.id,
                            unit_price_paise: item.unit_price_paise,
                            making_charges_paise: item.making_charges_paise,
                            quantity: item.quantity,
                            refunded_quantity: item.refunded_quantity,
                          },
                          1,
                          gst,
                        ),
                      )}{" "}
                      / unit · {remaining} available
                    </p>
                  </div>
                  {/* Qty stepper */}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setItemQtys((prev) => ({
                          ...prev,
                          [item.id]: Math.max(0, (prev[item.id] ?? 0) - 1),
                        }))
                      }
                      disabled={qty === 0}
                      className="eyebrow h-6 w-6 rounded-xs border text-sm disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="ledger w-6 text-center text-sm">{qty}</span>
                    <button
                      type="button"
                      onClick={() =>
                        setItemQtys((prev) => ({
                          ...prev,
                          [item.id]: Math.min(remaining, (prev[item.id] ?? 0) + 1),
                        }))
                      }
                      disabled={qty >= remaining}
                      className="eyebrow h-6 w-6 rounded-xs border text-sm disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-col gap-2">
            <input
              type="text"
              placeholder="Reason (optional)"
              value={itemReason}
              onChange={(e) => setItemReason(e.target.value)}
              className="border-b bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
            />
            {selectedLines.length > 0 && !confirmingItem && (
              <div className="flex items-center gap-3">
                <span className="ledger text-sm">
                  Preview: {formatPaise(itemPreviewPaise)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmingItem(true)}
                  disabled={pending}
                >
                  Refund {selectedLines.length} item
                  {selectedLines.length > 1 ? "s" : ""} →
                </Button>
              </div>
            )}
            {confirmingItem && (
              <div className="rounded-xs border border-border bg-secondary px-4 py-3 text-sm">
                <p className="text-xs text-muted-foreground">
                  Refunds cannot be undone. Confirm refund of{" "}
                  <span className="ledger text-foreground">
                    {formatPaise(itemPreviewPaise)}
                  </span>{" "}
                  (server will recompute exact amount)?
                </p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" onClick={submitItemRefund} disabled={pending}>
                    {pending ? "Processing…" : "Confirm refund"}
                  </Button>
                  <button
                    type="button"
                    onClick={() => setConfirmingItem(false)}
                    className="eyebrow text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Goodwill / adjustment refund */}
      <div>
        <p className="eyebrow text-xs text-muted-foreground mb-3">Goodwill adjustment</p>
        <p className="text-xs text-muted-foreground mb-2">
          Remaining charge: <span className="ledger text-foreground">{formatPaise(remainingChargePaise)}</span>
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <span className="text-sm">₹</span>
            <input
              type="number"
              min="1"
              step="0.01"
              placeholder="Amount in rupees"
              value={goodwillRupees}
              onChange={(e) => setGoodwillRupees(e.target.value)}
              className="border-b bg-transparent py-1.5 text-sm ledger outline-none w-40 placeholder:text-muted-foreground"
            />
          </div>
          <input
            type="text"
            placeholder="Reason (required)"
            value={goodwillReason}
            onChange={(e) => setGoodwillReason(e.target.value)}
            className="border-b bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          {goodwillPaise > 0 && !confirmingGoodwill && (
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmingGoodwill(true)}
                disabled={!goodwillValid || pending}
              >
                Issue goodwill {formatPaise(goodwillPaise)} →
              </Button>
              {goodwillPaise > remainingChargePaise && (
                <p className="text-xs text-destructive">Exceeds remaining charge.</p>
              )}
            </div>
          )}
          {confirmingGoodwill && (
            <div className="rounded-xs border border-border bg-secondary px-4 py-3 text-sm">
              <p className="text-xs text-muted-foreground">
                Issue goodwill refund of{" "}
                <span className="ledger text-foreground">{formatPaise(goodwillPaise)}</span>?{" "}
                Refunds cannot be undone.
              </p>
              <div className="mt-3 flex gap-2">
                <Button type="button" onClick={submitGoodwill} disabled={pending}>
                  {pending ? "Processing…" : "Confirm refund"}
                </Button>
                <button
                  type="button"
                  onClick={() => setConfirmingGoodwill(false)}
                  className="eyebrow text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
