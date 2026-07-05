/**
 * Checkout orchestration core (PRD 04) — the body of `createOrderFromCart`,
 * with every I/O seam injected so the orchestration is testable without a live
 * Next.js request, Supabase, or Stripe.
 *
 * The flow (ADR-0001/0002/0003):
 *   1. Load the caller's Cart with full Product pricing inputs + per-piece HUID.
 *      An empty Cart, or one with ANY unpriceable line (stale/missing rate,
 *      ADR-0010), is a HARD block — checkout never proceeds on a fabricated or
 *      partial price.
 *   2. Recompute the true live total from the current Metal Rates + pricing and
 *      compare to the client's seen total. Outside `max(0.5%, ₹100)` → reject
 *      with a re-confirm error (ADR-0002).
 *   3. Build the immutable snapshot (ADR-0003) and call the atomic
 *      `reserve_and_create_order` RPC — the guarded stock decrement is the
 *      oversell guard (ADR-0001); on insufficient stock the RPC rolls back and
 *      this returns an `out_of_stock` result. Creates the Order `pending` + a
 *      Reservation per line (15-min expiry) and audits the create.
 *   4. Issue a Stripe PaymentIntent in INR for `total_paise` and store its id on
 *      the Order.
 *
 * The thin Server Action wrapper (src/app/actions/checkout.ts) wires the real
 * Supabase clients, rates, Stripe, and clock into `runCheckout`.
 */

import {
  calculatePrice,
  type Material,
  type PricingRate,
  type PricingSettings,
} from "../pricing";
import { RateUnavailableError } from "../rates";
import { withinReconfirmTolerance, reconfirmTolerancePaise } from "./reconfirm";
import { buildOrderSnapshot, type SnapshotLineInput } from "./snapshot";
import { computeShipping, type ShippingMethodRates } from "../shipping/compute";
import { computeDiscount } from "../coupons/compute";
import type { CheckoutInput } from "../validators/checkout";

/** The 15-minute Reservation window (ADR-0001), in milliseconds. */
export const RESERVATION_WINDOW_MS = 15 * 60 * 1000;

/** A Cart line with the full Product inputs checkout needs to snapshot. */
export interface CheckoutCartLine {
  product_id: string;
  /** Present when the line is for a specific Variant (ADR-0015). */
  variant_id?: string | null;
  sku: string;
  name: string;
  material: Material;
  weight_grams: string;
  purity_karat: number | null;
  hallmark_huid: string | null;
  making_charge_type: "flat" | "percent";
  making_charge_value: number;
  quantity: number;
  /** Variant cosmetic/label fields — carried to the order snapshot. */
  size_label?: string | null;
  metal_tone?: string | null;
}

/** What the atomic RPC returns on success. */
export interface CreatedOrderRow {
  order_id: string;
  order_number: number;
  order_year: number;
}

/** A minimal Stripe PaymentIntent shape (only the fields checkout uses). */
export interface CheckoutPaymentIntent {
  id: string;
  client_secret: string | null;
}

/** Injected dependencies — every I/O seam, so the core is unit-testable. */
export interface CheckoutDeps {
  /** The authenticated caller's id, or null if unauthenticated. */
  userId: string | null;
  /** Load the caller's Cart lines (full Product inputs). Empty array = no Cart. */
  loadCartLines: () => Promise<CheckoutCartLine[]>;
  /** GST basis points from `settings` (ADR-0005). */
  loadSettings: () => Promise<PricingSettings>;
  /** Resolve the live rate per material, or throw `RateUnavailableError`. */
  resolveRate: (material: Material) => Promise<PricingRate>;
  /** Load a shipping method by id; returns null if not found/inactive (ADR-0016). */
  loadShippingMethod: (id: string) => Promise<(ShippingMethodRates & { id: string }) | null>;
  /** Load a validated coupon by code for this user + subtotal (ADR-0017). */
  resolveCoupon: (
    code: string,
    subtotalPaise: number,
  ) => Promise<ResolvedCoupon | null>;
  /** Invoke the atomic reserve+create RPC; resolves to the created row. */
  reserveAndCreate: (args: {
    userId: string;
    order: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
    expiresAt: string;
  }) => Promise<
    | { ok: true; row: CreatedOrderRow }
    | { ok: false; reason: "out_of_stock" }
  >;
  /** Create a Stripe PaymentIntent in INR for `amountPaise`. */
  createPaymentIntent: (args: {
    amountPaise: number;
    orderId: string;
    orderNumber: string;
  }) => Promise<CheckoutPaymentIntent>;
  /** Persist the PaymentIntent id onto the Order. */
  attachPaymentIntent: (orderId: string, paymentIntentId: string) => Promise<void>;
  /** Current time (epoch ms), injectable for a deterministic expiry. */
  now: () => number;
}

/** A validated coupon ready for discount computation. */
export interface ResolvedCoupon {
  id: string;
  discount_type: "percent" | "flat";
  /** percent → basis points (e.g. 1000 = 10%); flat → Paise. */
  discount_value: number;
  min_order_paise: number;
}

/** Discriminated checkout result — the action surfaces these to the client. */
export type CheckoutResult =
  | {
      ok: true;
      order_id: string;
      order_number: string;
      total_paise: number;
      client_secret: string | null;
    }
  | { ok: false; code: "empty_cart" }
  | { ok: false; code: "unauthenticated" }
  | { ok: false; code: "price_unavailable"; material: Material }
  | {
      ok: false;
      code: "reconfirm";
      seen_total_paise: number;
      true_total_paise: number;
      tolerance_paise: number;
    }
  | { ok: false; code: "out_of_stock" }
  | { ok: false; code: "invalid_shipping_method" }
  | { ok: false; code: "invalid_coupon" }
  | { ok: false; code: "coupon_exhausted" };

/** The display string for an Order number (ADR-0013). */
export function orderNumberDisplay(year: number, seq: number): string {
  return `ORD-${year}-${seq}`;
}

/**
 * Run the full checkout against injected dependencies. Pure orchestration: all
 * I/O is in `deps`. Returns a discriminated result; throws only on truly
 * unexpected errors (which the action maps to a generic failure).
 */
export async function runCheckout(
  input: CheckoutInput,
  deps: CheckoutDeps,
): Promise<CheckoutResult> {
  if (!deps.userId) {
    return { ok: false, code: "unauthenticated" };
  }

  const lines = await deps.loadCartLines();
  if (lines.length === 0) {
    return { ok: false, code: "empty_cart" };
  }

  const settings = await deps.loadSettings();

  // Resolve every distinct material's live rate up front. A missing/stale rate
  // is a HARD block at checkout (ADR-0010) — surfaced as price_unavailable so no
  // Order is ever created against a fabricated or partial price.
  const materials = [...new Set(lines.map((l) => l.material))];
  const rates = new Map<Material, PricingRate>();
  for (const material of materials) {
    try {
      rates.set(material, await deps.resolveRate(material));
    } catch (err) {
      if (err instanceof RateUnavailableError) {
        return { ok: false, code: "price_unavailable", material: err.material };
      }
      throw err;
    }
  }

  // Build the immutable snapshot (ADR-0003) from the live rates/settings.
  // This gives us the undiscounted subtotal, gst, and per-item components.
  const snapshotLines: SnapshotLineInput[] = lines.map((l) => ({
    product_id: l.product_id,
    variant_id: l.variant_id ?? null,
    sku: l.sku,
    name: l.name,
    material: l.material,
    weight_grams: l.weight_grams,
    purity_karat: l.purity_karat,
    hallmark_huid: l.hallmark_huid,
    making_charge_type: l.making_charge_type,
    making_charge_value: l.making_charge_value,
    quantity: l.quantity,
    size_label: l.size_label ?? null,
    metal_tone: l.metal_tone ?? null,
  }));
  const snapshot = buildOrderSnapshot(snapshotLines, rates, settings);

  // --- Coupon discount (ADR-0017) ---
  let coupon: ResolvedCoupon | null = null;
  let discountPaise = 0;
  if (input.coupon_code) {
    coupon = await deps.resolveCoupon(
      input.coupon_code,
      snapshot.order.subtotal_paise,
    );
    if (!coupon) {
      return { ok: false, code: "invalid_coupon" };
    }
    discountPaise = computeDiscount(coupon, snapshot.order.subtotal_paise);
  }

  // Recompute GST on the discounted subtotal using proportional component split
  // (ADR-0017). When discountPaise = 0 this is identical to snapshot.order.gst_paise.
  const subtotalPaise = snapshot.order.subtotal_paise;
  let gstPaise = snapshot.order.gst_paise;
  if (discountPaise > 0 && subtotalPaise > 0) {
    const rawMetal = snapshot.items.reduce(
      (s, it) => s + (it.unit_price_paise - it.making_charges_paise) * it.quantity,
      0,
    );
    const discOnMetal = Math.round((discountPaise * rawMetal) / subtotalPaise);
    const discOnMaking = discountPaise - discOnMetal;
    const discMetal = rawMetal - discOnMetal;
    const discMaking = subtotalPaise - rawMetal - discOnMaking;
    gstPaise =
      Math.round((discMetal * settings.gst_metal_bps) / 10000) +
      Math.round((discMaking * settings.gst_making_bps) / 10000);
  }

  const discountedSubtotal = subtotalPaise - discountPaise;
  const totalBeforeShipping = discountedSubtotal + gstPaise;

  // --- Shipping (ADR-0016) ---
  let shippingMethod: (ShippingMethodRates & { id: string }) | null = null;
  let shippingPaise = 0;
  const totalWeightGrams = lines.reduce(
    (s, l) => s + parseFloat(l.weight_grams) * l.quantity,
    0,
  );
  if (input.shipping_method_id) {
    shippingMethod = await deps.loadShippingMethod(input.shipping_method_id);
    if (!shippingMethod) {
      return { ok: false, code: "invalid_shipping_method" };
    }
    shippingPaise = computeShipping(shippingMethod, totalWeightGrams, totalBeforeShipping);
  }

  const finalTotal = totalBeforeShipping + shippingPaise;

  // Re-confirm tolerance guard (ADR-0002). Runs after discount + shipping so
  // the customer's seen_total_paise reflects the actual charge they accepted.
  if (!withinReconfirmTolerance(input.seen_total_paise, finalTotal)) {
    return {
      ok: false,
      code: "reconfirm",
      seen_total_paise: input.seen_total_paise,
      true_total_paise: finalTotal,
      tolerance_paise: reconfirmTolerancePaise(input.seen_total_paise),
    };
  }

  const expiresAt = new Date(deps.now() + RESERVATION_WINDOW_MS).toISOString();

  // Atomic reserve + create (ADR-0001). The RPC's guarded decrement is the
  // oversell guard; out_of_stock means a concurrent checkout took the last unit.
  const created = await deps.reserveAndCreate({
    userId: deps.userId,
    order: {
      gold_rate_snapshot_paise: snapshot.order.gold_rate_snapshot_paise,
      silver_rate_snapshot_paise: snapshot.order.silver_rate_snapshot_paise,
      gst_metal_bps: snapshot.order.gst_metal_bps,
      gst_making_bps: snapshot.order.gst_making_bps,
      subtotal_paise: subtotalPaise,
      making_charges_paise: snapshot.order.making_charges_paise,
      gst_paise: gstPaise,
      total_paise: finalTotal,
      coupon_id: coupon?.id ?? null,
      discount_paise: discountPaise,
      shipping_method_id: shippingMethod?.id ?? null,
      shipping_paise: shippingPaise,
      shipping_address: input.shipping_address,
    },
    items: snapshot.items.map((it) => ({ ...it })),
    expiresAt,
  });

  if (!created.ok) {
    return { ok: false, code: "out_of_stock" };
  }

  const display = orderNumberDisplay(
    created.row.order_year,
    created.row.order_number,
  );

  // Issue the Stripe PaymentIntent in INR for the snapshotted total, then attach
  // its id to the Order (ADR: pay at create).
  const intent = await deps.createPaymentIntent({
    amountPaise: snapshot.order.total_paise,
    orderId: created.row.order_id,
    orderNumber: display,
  });
  await deps.attachPaymentIntent(created.row.order_id, intent.id);

  return {
    ok: true,
    order_id: created.row.order_id,
    order_number: display,
    total_paise: snapshot.order.total_paise,
    client_secret: intent.client_secret,
  };
}
