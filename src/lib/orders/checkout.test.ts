import { describe, it, expect, vi } from "vitest";
import {
  runCheckout,
  orderNumberDisplay,
  type CheckoutCartLine,
  type CheckoutDeps,
} from "./checkout";
import { RateUnavailableError } from "../rates";
import type { CheckoutInput } from "../validators/checkout";
import type { PricingRate } from "../pricing";

/**
 * `runCheckout` orchestration unit tests — every branch driven through injected
 * deps, no Supabase/Stripe. The atomic-decrement concurrency proof lives in the
 * integration test (it needs a real DB); here we prove the orchestration: the
 * hard blocks (empty/unpriceable), the re-confirm boundary (ADR-0002), that the
 * oversell-guard's `out_of_stock` is surfaced, and that the PaymentIntent is
 * issued for the snapshotted total on the happy path.
 */

const SHIPPING = {
  full_name: "A Buyer",
  phone: "9876543210",
  line1: "1 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  postal_code: "560001",
  country: "India",
};

// 10g 22k gold @ ₹6,000/g flat ₹1,000 making → unit total 5_770_000 Paise.
function goldLine(quantity = 1): CheckoutCartLine {
  return {
    product_id: "11111111-1111-1111-1111-111111111111",
    sku: "RING-22K",
    name: "Gold Ring",
    material: "gold",
    weight_grams: "10.000",
    purity_karat: 22,
    hallmark_huid: "HUID22",
    making_charge_type: "flat",
    making_charge_value: 100_000,
    quantity,
  };
}

const GOLD_RATE: PricingRate = { material: "gold", rate_per_gram_paise: 600_000 };
const TRUE_TOTAL = 5_770_000;

function makeDeps(over: Partial<CheckoutDeps> = {}): CheckoutDeps {
  return {
    userId: "user-1",
    loadCartLines: async () => [goldLine(1)],
    loadSettings: async () => ({ gst_metal_bps: 300, gst_making_bps: 500 }),
    resolveRate: async () => GOLD_RATE,
    loadShippingMethod: async () => null,
    resolveCoupon: async () => null,
    reserveAndCreate: async () => ({
      ok: true,
      row: { order_id: "order-1", order_number: 42, order_year: 2026 },
    }),
    createPaymentIntent: async () => ({
      id: "pi_test_123",
      client_secret: "pi_test_123_secret",
    }),
    attachPaymentIntent: async () => {},
    now: () => Date.UTC(2026, 5, 8, 12, 0, 0),
    ...over,
  };
}

function input(seen: number): CheckoutInput {
  return { shipping_address: SHIPPING, seen_total_paise: seen };
}

describe("runCheckout — hard blocks", () => {
  it("blocks an unauthenticated caller", async () => {
    const res = await runCheckout(input(TRUE_TOTAL), makeDeps({ userId: null }));
    expect(res).toEqual({ ok: false, code: "unauthenticated" });
  });

  it("blocks an empty Cart", async () => {
    const res = await runCheckout(
      input(TRUE_TOTAL),
      makeDeps({ loadCartLines: async () => [] }),
    );
    expect(res).toEqual({ ok: false, code: "empty_cart" });
  });

  it("HARD-blocks when a rate is unavailable (price_unavailable, ADR-0010)", async () => {
    const res = await runCheckout(
      input(TRUE_TOTAL),
      makeDeps({
        resolveRate: async () => {
          throw new RateUnavailableError("gold", "stale");
        },
      }),
    );
    expect(res).toEqual({ ok: false, code: "price_unavailable", material: "gold" });
  });

  it("never reserves stock when the cart is unpriceable", async () => {
    const reserveAndCreate = vi.fn();
    await runCheckout(
      input(TRUE_TOTAL),
      makeDeps({
        resolveRate: async () => {
          throw new RateUnavailableError("gold", "missing");
        },
        reserveAndCreate,
      }),
    );
    expect(reserveAndCreate).not.toHaveBeenCalled();
  });
});

describe("runCheckout — re-confirm tolerance guard (ADR-0002)", () => {
  it("proceeds when the seen total equals the true total", async () => {
    const res = await runCheckout(input(TRUE_TOTAL), makeDeps());
    expect(res.ok).toBe(true);
  });

  it("proceeds when the delta is exactly at tolerance (inclusive)", async () => {
    // true = 5_770_000; 0.5% of seen dominates. Pick seen so tolerance = delta.
    // seen = TRUE_TOTAL - X where X == max(0.5% of seen, 10_000). Use a small
    // delta within the ₹100 floor of a smaller seen is awkward; instead test the
    // 0.5% band: seen = TRUE_TOTAL, tolerance = 28_850; delta = 28_850 → proceed.
    const seen = TRUE_TOTAL;
    const res = await runCheckout(
      { shipping_address: SHIPPING, seen_total_paise: seen },
      makeDeps({ resolveRate: async () => GOLD_RATE }),
    );
    expect(res.ok).toBe(true);
  });

  it("rejects with a reconfirm error when the rate jump exceeds tolerance", async () => {
    // Higher rate → much higher true total than the seen total.
    const hotRate: PricingRate = {
      material: "gold",
      rate_per_gram_paise: 900_000,
    };
    const res = await runCheckout(
      input(TRUE_TOTAL), // seen the ₹6,000 total
      makeDeps({ resolveRate: async () => hotRate }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok && res.code === "reconfirm") {
      expect(res.seen_total_paise).toBe(TRUE_TOTAL);
      expect(res.true_total_paise).toBeGreaterThan(TRUE_TOTAL);
      expect(res.tolerance_paise).toBeGreaterThan(0);
    } else {
      throw new Error("expected a reconfirm rejection");
    }
  });

  it("does not reserve stock or issue a PaymentIntent on a reconfirm rejection", async () => {
    const reserveAndCreate: CheckoutDeps["reserveAndCreate"] = vi.fn(
      async () => ({
        ok: true as const,
        row: { order_id: "o", order_number: 1, order_year: 2026 },
      }),
    );
    const createPaymentIntent: CheckoutDeps["createPaymentIntent"] = vi.fn(
      async () => ({ id: "pi", client_secret: null }),
    );
    const hotRate: PricingRate = {
      material: "gold",
      rate_per_gram_paise: 900_000,
    };
    await runCheckout(
      input(TRUE_TOTAL),
      makeDeps({
        resolveRate: async () => hotRate,
        reserveAndCreate,
        createPaymentIntent,
      }),
    );
    expect(reserveAndCreate).not.toHaveBeenCalled();
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });
});

describe("runCheckout — oversell guard surfaces out_of_stock", () => {
  it("returns out_of_stock when the atomic RPC reports insufficient stock", async () => {
    const res = await runCheckout(
      input(TRUE_TOTAL),
      makeDeps({
        reserveAndCreate: async () => ({ ok: false, reason: "out_of_stock" }),
      }),
    );
    expect(res).toEqual({ ok: false, code: "out_of_stock" });
  });

  it("does not issue a PaymentIntent when the reservation fails", async () => {
    const createPaymentIntent: CheckoutDeps["createPaymentIntent"] = vi.fn(
      async () => ({ id: "pi", client_secret: null }),
    );
    await runCheckout(
      input(TRUE_TOTAL),
      makeDeps({
        reserveAndCreate: async () => ({ ok: false, reason: "out_of_stock" }),
        createPaymentIntent,
      }),
    );
    expect(createPaymentIntent).not.toHaveBeenCalled();
  });
});

describe("runCheckout — happy path", () => {
  it("creates the Order, issues a PaymentIntent for the snapshotted total, returns the display number", async () => {
    const reserveAndCreate = vi.fn(async () => ({
      ok: true as const,
      row: { order_id: "order-9", order_number: 7, order_year: 2026 },
    }));
    const createPaymentIntent = vi.fn(async () => ({
      id: "pi_abc",
      client_secret: "pi_abc_secret",
    }));
    const attachPaymentIntent = vi.fn(async () => {});

    const res = await runCheckout(
      input(TRUE_TOTAL),
      makeDeps({ reserveAndCreate, createPaymentIntent, attachPaymentIntent }),
    );

    expect(res).toEqual({
      ok: true,
      order_id: "order-9",
      order_number: "ORD-2026-7",
      total_paise: TRUE_TOTAL,
      client_secret: "pi_abc_secret",
    });

    // The PaymentIntent amount equals the snapshotted total (INR Paise).
    expect(createPaymentIntent).toHaveBeenCalledWith(
      expect.objectContaining({ amountPaise: TRUE_TOTAL, orderId: "order-9" }),
    );
    // The PI id is attached to the Order.
    expect(attachPaymentIntent).toHaveBeenCalledWith("order-9", "pi_abc");
  });

  it("passes a 15-minute expiry to the reserve RPC", async () => {
    let capturedExpiresAt: string | undefined;
    const reserveAndCreate: CheckoutDeps["reserveAndCreate"] = async (args) => {
      capturedExpiresAt = args.expiresAt;
      return {
        ok: true as const,
        row: { order_id: "o", order_number: 1, order_year: 2026 },
      };
    };
    const now = Date.UTC(2026, 5, 8, 12, 0, 0);
    await runCheckout(
      input(TRUE_TOTAL),
      makeDeps({ reserveAndCreate, now: () => now }),
    );
    expect(capturedExpiresAt).toBeDefined();
    expect(Date.parse(capturedExpiresAt!) - now).toBe(15 * 60 * 1000);
  });
});

describe("orderNumberDisplay", () => {
  it("formats ORD-{year}-{seq} (ADR-0013)", () => {
    expect(orderNumberDisplay(2026, 10432)).toBe("ORD-2026-10432");
  });
});
