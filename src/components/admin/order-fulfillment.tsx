"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { advanceOrderFulfillment } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import type { OrderStatus } from "@/lib/orders/state-machine";

type FulfillmentTarget = "processing" | "shipped" | "delivered";

const FULFILLMENT_NEXT: Partial<Record<OrderStatus, FulfillmentTarget>> = {
  paid: "processing",
  processing: "shipped",
  shipped: "delivered",
};

/**
 * A4 STATE RAIL — advances a paid Order one fulfillment step. Only the single
 * legal next fulfillment move is offered; illegal_transition shows a refresh note.
 */
export function OrderFulfillmentRail({
  orderId,
  status,
}: {
  orderId: string;
  status: OrderStatus;
}) {
  const nextStep = FULFILLMENT_NEXT[status];
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  if (!nextStep) return null; // delivered / refunded / cancelled — no advance

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await advanceOrderFulfillment({ order_id: orderId, to: nextStep! });
      if (result.ok) {
        setConfirming(false);
        router.refresh();
      } else if (result.code === "illegal_transition") {
        setError("Status changed by another session — refreshing.");
        setConfirming(false);
        router.refresh();
      } else {
        setError("code" in result && result.code === "error" ? result.message : result.code);
        setConfirming(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="eyebrow text-xs text-muted-foreground">
          Status: <span className="text-foreground">{status.replace(/_/g, " ")}</span>
        </span>
        {!confirming && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setConfirming(true)}
            disabled={pending}
          >
            Mark {nextStep.replace(/_/g, " ")} →
          </Button>
        )}
      </div>
      {confirming && (
        <div className="flex items-center gap-3 rounded-xs border border-border bg-secondary px-4 py-3 text-sm">
          <span>
            Move order from{" "}
            <span className="ledger">{status.replace(/_/g, " ")}</span> →{" "}
            <span className="ledger">{nextStep.replace(/_/g, " ")}</span>?
          </span>
          <Button type="button" onClick={submit} disabled={pending}>
            {pending ? "Advancing…" : "Confirm"}
          </Button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="eyebrow text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
