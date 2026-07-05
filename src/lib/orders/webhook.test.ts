import { describe, it, expect, vi } from "vitest";
import {
  handleWebhookEvent,
  type WebhookDeps,
  type WebhookOrder,
  type VerifiedEvent,
} from "./webhook";

/**
 * Stripe webhook core — branch coverage for the `payment_intent` transitions,
 * including the late-payment safety valve (ADR-0004). Stripe and Supabase are
 * injected; this proves the state-machine-driven decisions, not the I/O. The
 * signature-verification + real Stripe construction is exercised by the route
 * (integration); here the event is already verified.
 */

const PI = "pi_test_42";

function deps(over: Partial<WebhookDeps> = {}): WebhookDeps {
  return {
    findOrderByPaymentIntent: async () => null,
    commitReservations: vi.fn(async () => {}),
    releaseReservations: vi.fn(async () => {}),
    reviveReservations: vi.fn(async () => true),
    transitionOrder: vi.fn(async () => {}),
    refundPaymentIntent: vi.fn(async () => {}),
    recordAudit: vi.fn(async () => {}),
    recordAutoRefund: vi.fn(async () => {}),
    ...over,
  };
}

function order(status: WebhookOrder["status"]): WebhookOrder {
  return { id: "order-1", status, total_paise: 5_770_000 };
}

const succeeded: VerifiedEvent = {
  type: "payment_intent.succeeded",
  paymentIntentId: PI,
};
const failed: VerifiedEvent = {
  type: "payment_intent.payment_failed",
  paymentIntentId: PI,
};

describe("handleWebhookEvent — unknown/unmatched", () => {
  it("ignores an unrelated event type", async () => {
    const res = await handleWebhookEvent(
      { type: "charge.refunded", paymentIntentId: PI },
      deps(),
    );
    expect(res).toEqual({ handled: false, reason: "unknown_event" });
  });

  it("reports order_not_found when no Order matches the PaymentIntent", async () => {
    const res = await handleWebhookEvent(
      succeeded,
      deps({ findOrderByPaymentIntent: async () => null }),
    );
    expect(res).toEqual({ handled: false, reason: "order_not_found" });
  });
});

describe("handleWebhookEvent — succeeded on pending → paid", () => {
  it("commits the reservation and records pending → paid", async () => {
    const commitReservations = vi.fn(async () => {});
    const transitionOrder = vi.fn(async () => {});
    const res = await handleWebhookEvent(
      succeeded,
      deps({
        findOrderByPaymentIntent: async () => order("pending"),
        commitReservations,
        transitionOrder,
      }),
    );
    expect(res).toEqual({ handled: true, action: "paid" });
    expect(commitReservations).toHaveBeenCalledWith("order-1");
    expect(transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({ from: "pending", to: "paid" }),
    );
  });
});

describe("handleWebhookEvent — failed on pending → cancelled", () => {
  it("releases the reservation and records pending → cancelled", async () => {
    const releaseReservations = vi.fn(async () => {});
    const transitionOrder = vi.fn(async () => {});
    const res = await handleWebhookEvent(
      failed,
      deps({
        findOrderByPaymentIntent: async () => order("pending"),
        releaseReservations,
        transitionOrder,
      }),
    );
    expect(res).toEqual({ handled: true, action: "cancelled" });
    expect(releaseReservations).toHaveBeenCalledWith("order-1");
    expect(transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({ from: "pending", to: "cancelled" }),
    );
  });
});

describe("handleWebhookEvent — late-payment safety valve (ADR-0004)", () => {
  it("revives cancelled → paid when stock can be re-reserved", async () => {
    const transitionOrder = vi.fn(async () => {});
    const refundPaymentIntent = vi.fn(async () => {});
    const res = await handleWebhookEvent(
      succeeded,
      deps({
        findOrderByPaymentIntent: async () => order("cancelled"),
        reviveReservations: async () => true,
        transitionOrder,
        refundPaymentIntent,
      }),
    );
    expect(res).toEqual({ handled: true, action: "revived" });
    expect(transitionOrder).toHaveBeenCalledWith(
      expect.objectContaining({ from: "cancelled", to: "paid" }),
    );
    expect(refundPaymentIntent).not.toHaveBeenCalled();
  });

  it("auto-refunds and STAYS cancelled when the stock is gone", async () => {
    const transitionOrder = vi.fn(async () => {});
    const refundPaymentIntent = vi.fn(async () => {});
    const recordAudit = vi.fn(async () => {});
    const recordAutoRefund = vi.fn(async () => {});
    const res = await handleWebhookEvent(
      succeeded,
      deps({
        findOrderByPaymentIntent: async () => order("cancelled"),
        reviveReservations: async () => false,
        transitionOrder,
        refundPaymentIntent,
        recordAudit,
        recordAutoRefund,
      }),
    );
    expect(res).toEqual({ handled: true, action: "auto_refunded" });
    // No status transition — the Order is NOT revived.
    expect(transitionOrder).not.toHaveBeenCalled();
    expect(refundPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentIntentId: PI,
        amountPaise: 5_770_000,
        orderId: "order-1",
      }),
    );
    expect(recordAutoRefund).toHaveBeenCalledWith({
      orderId: "order-1",
      amountPaise: 5_770_000,
    });
    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "auto_refund_late_payment" }),
    );
  });
});

describe("handleWebhookEvent — idempotency / no-ops", () => {
  it("a duplicate succeeded on an already-paid Order is a no-op", async () => {
    const commitReservations = vi.fn(async () => {});
    const res = await handleWebhookEvent(
      succeeded,
      deps({
        findOrderByPaymentIntent: async () => order("paid"),
        commitReservations,
      }),
    );
    expect(res).toEqual({ handled: true, action: "noop", status: "paid" });
    expect(commitReservations).not.toHaveBeenCalled();
  });

  it("a failed event on a paid Order is a no-op (never paid → cancelled)", async () => {
    const releaseReservations = vi.fn(async () => {});
    const res = await handleWebhookEvent(
      failed,
      deps({
        findOrderByPaymentIntent: async () => order("paid"),
        releaseReservations,
      }),
    );
    expect(res).toEqual({ handled: true, action: "noop", status: "paid" });
    expect(releaseReservations).not.toHaveBeenCalled();
  });
});
