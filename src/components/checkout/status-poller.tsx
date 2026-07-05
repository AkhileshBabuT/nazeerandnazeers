"use client";

import { useEffect, useState } from "react";
import { getOrderStatus } from "@/app/actions/orders";
import {
  POLL_INTERVAL_MS,
  confirmationView,
} from "@/lib/checkout/confirmation";
import type { OrderStatus } from "@/lib/orders/state-machine";

/**
 * C7 status poller (PRD 04 C7): resolves the webhook race. Starts from the
 * SERVER-read status; while the view is `processing` it polls
 * `getOrderStatus` every 2s with a 60s cap, then stops. Every decision is
 * the pure, unit-tested `confirmationView` (src/lib/checkout/confirmation.ts);
 * this island is a trivial switch over it — the five state cards arrive
 * server-rendered as props, so only one is ever in the tree.
 *
 * Hydration-safe: the initial render uses `elapsedMs: 0` (no clock read), so
 * SSR and client agree; the clock only enters via poll ticks.
 */
export function StatusPoller({
  orderId,
  initialStatus,
  initialAutoRefunded,
  processing,
  paid,
  autoRefunded,
  cancelled,
  timeout,
}: {
  orderId: string;
  initialStatus: OrderStatus;
  initialAutoRefunded: boolean;
  processing: React.ReactNode;
  paid: React.ReactNode;
  autoRefunded: React.ReactNode;
  cancelled: React.ReactNode;
  timeout: React.ReactNode;
}) {
  const [snapshot, setSnapshot] = useState({
    status: initialStatus,
    autoRefunded: initialAutoRefunded,
    elapsedMs: 0,
  });

  const view = confirmationView(snapshot);
  const polling = view.kind === "processing";

  useEffect(() => {
    if (!polling) return;
    const startedMs = Date.now();
    let stopped = false;
    const id = setInterval(() => {
      getOrderStatus(orderId).then(
        (result) => {
          if (stopped) return;
          setSnapshot((prev) => ({
            status: result.ok ? result.status : prev.status,
            autoRefunded: result.ok ? result.auto_refunded : prev.autoRefunded,
            elapsedMs: Date.now() - startedMs,
          }));
        },
        () => {
          // A failed poll still advances the clock, so the 60s cap holds
          // even when the network is down.
          if (stopped) return;
          setSnapshot((prev) => ({
            ...prev,
            elapsedMs: Date.now() - startedMs,
          }));
        },
      );
    }, POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [polling, orderId]);

  switch (view.kind) {
    case "processing":
      return <>{processing}</>;
    case "paid":
      return <>{paid}</>;
    case "auto_refunded":
      return <>{autoRefunded}</>;
    case "cancelled":
      return <>{cancelled}</>;
    case "timeout":
      return <>{timeout}</>;
  }
}
