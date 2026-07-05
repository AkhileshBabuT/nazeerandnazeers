import { describe, expect, it } from "vitest";
import {
  POLL_CAP_MS,
  POLL_INTERVAL_MS,
  confirmationView,
  fulfillmentPath,
} from "./confirmation";
import { canTransition, type OrderStatus } from "@/lib/orders/state-machine";

describe("confirmationView", () => {
  it("is processing while pending under the cap", () => {
    expect(
      confirmationView({ status: "pending", autoRefunded: false, elapsedMs: 0 }),
    ).toEqual({ kind: "processing" });
    expect(
      confirmationView({
        status: "pending",
        autoRefunded: false,
        elapsedMs: POLL_CAP_MS - 1,
      }),
    ).toEqual({ kind: "processing" });
  });

  it("times out when pending at or past the cap (poll must stop)", () => {
    expect(
      confirmationView({
        status: "pending",
        autoRefunded: false,
        elapsedMs: POLL_CAP_MS,
      }),
    ).toEqual({ kind: "timeout" });
    expect(
      confirmationView({
        status: "pending",
        autoRefunded: false,
        elapsedMs: POLL_CAP_MS + 1,
      }),
    ).toEqual({ kind: "timeout" });
  });

  it("respects an injected capMs", () => {
    expect(
      confirmationView({
        status: "pending",
        autoRefunded: false,
        elapsedMs: 5_000,
        capMs: 4_000,
      }),
    ).toEqual({ kind: "timeout" });
    expect(
      confirmationView({
        status: "pending",
        autoRefunded: false,
        elapsedMs: 5_000,
        capMs: 6_000,
      }),
    ).toEqual({ kind: "processing" });
  });

  it("the default cap is 60s = 2s × 30 polls (PRD §1.6)", () => {
    expect(POLL_CAP_MS).toBe(60_000);
    expect(POLL_CAP_MS / POLL_INTERVAL_MS).toBe(30);
  });

  it("is paid the moment the webhook lands", () => {
    expect(
      confirmationView({ status: "paid", autoRefunded: false, elapsedMs: 4_000 }),
    ).toEqual({ kind: "paid" });
  });

  /**
   * Acceptance criterion: the REVIVED order (cancelled → paid, ADR-0004 — a
   * late payment re-reserved stock) reads as a PLAIN success. By the time the
   * poller sees it, its status is `paid` with no refund — indistinguishable
   * from a normal success, and rendered as one.
   */
  it("revived (cancelled → paid) renders as plain success", () => {
    expect(canTransition("cancelled", "paid")).toBe(true);
    expect(
      confirmationView({ status: "paid", autoRefunded: false, elapsedMs: 8_000 }),
    ).toEqual({ kind: "paid" });
  });

  it("every money-moved status renders as success", () => {
    const moneyMoved: OrderStatus[] = [
      "paid",
      "processing",
      "shipped",
      "delivered",
      "refunded",
      "partially_refunded",
    ];
    for (const status of moneyMoved) {
      expect(
        confirmationView({ status, autoRefunded: false, elapsedMs: 0 }),
      ).toEqual({ kind: "paid" });
    }
  });

  /**
   * Acceptance criterion: auto_refunded — status `cancelled` AND a Refund row
   * (the late-payment safety valve, ADR-0004) — renders the calm full-refund
   * notice, regardless of how long polling has run.
   */
  it("cancelled with a refund row is auto_refunded", () => {
    expect(
      confirmationView({
        status: "cancelled",
        autoRefunded: true,
        elapsedMs: 0,
      }),
    ).toEqual({ kind: "auto_refunded" });
    expect(
      confirmationView({
        status: "cancelled",
        autoRefunded: true,
        elapsedMs: POLL_CAP_MS + 1,
      }),
    ).toEqual({ kind: "auto_refunded" });
  });

  it("cancelled without a refund is a plain cancel, even past the cap", () => {
    expect(
      confirmationView({
        status: "cancelled",
        autoRefunded: false,
        elapsedMs: 0,
      }),
    ).toEqual({ kind: "cancelled" });
    expect(
      confirmationView({
        status: "cancelled",
        autoRefunded: false,
        elapsedMs: POLL_CAP_MS + 1,
      }),
    ).toEqual({ kind: "cancelled" });
  });

  it("ignores a stray autoRefunded flag on money-moved statuses", () => {
    // getOrderStatus only computes the flag for cancelled orders; the view
    // must not invent a refund state for a paid one.
    expect(
      confirmationView({ status: "paid", autoRefunded: true, elapsedMs: 0 }),
    ).toEqual({ kind: "paid" });
  });
});

describe("fulfillmentPath", () => {
  it("derives PAID → PROCESSING → SHIPPED → DELIVERED from the state machine", () => {
    expect(fulfillmentPath("paid")).toEqual([
      "paid",
      "processing",
      "shipped",
      "delivered",
    ]);
    // "paid" is the default starting station.
    expect(fulfillmentPath()).toEqual(fulfillmentPath("paid"));
  });

  it("every consecutive hop on the path is a legal transition", () => {
    const path = fulfillmentPath("paid");
    for (let i = 0; i + 1 < path.length; i++) {
      const from = path[i];
      const to = path[i + 1];
      expect(from).toBeDefined();
      expect(to).toBeDefined();
      if (from !== undefined && to !== undefined) {
        expect(canTransition(from, to)).toBe(true);
      }
    }
  });
});
