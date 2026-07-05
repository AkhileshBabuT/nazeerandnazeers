/**
 * C5 checkout-form logic (PRD 04) — the AddressForm island's pure brain.
 *
 * The island stays thin wiring (no @testing-library/react in this repo —
 * vitest is node-env, `*.test.ts` only): payload building from the form's
 * fields, the reconfirm delta, and the mapping of every
 * `CheckoutActionResult` branch to a UI state all live here, unit-tested.
 */

import type { CheckoutActionResult } from "@/app/actions/checkout";
import type { CheckoutInput } from "@/lib/validators";
import { formatPaise } from "@/lib/format";

/** The address fields the form renders, named per `shippingAddressSchema`. */
export const ADDRESS_FIELDS = [
  "full_name",
  "phone",
  "line1",
  "line2",
  "city",
  "state",
  "postal_code",
] as const;

export type AddressField = (typeof ADDRESS_FIELDS)[number];

/** First zod message per address field, keyed without the schema prefix. */
export type AddressFieldErrors = Partial<Record<AddressField, string>>;

/**
 * Build the `createOrderFromCart` payload from the form's fields. `get` is
 * `FormData.get`-shaped so this stays DOM-free and testable. Values are
 * trimmed; an empty optional line2 is omitted from the snapshot. Country is
 * fixed — shipping is India-only (the schema's own default).
 */
export function checkoutInputFromForm(
  get: (name: string) => unknown,
  seenTotalPaise: number,
): CheckoutInput {
  const s = (name: AddressField) => String(get(name) ?? "").trim();
  const line2 = s("line2");
  const shippingMethodId = String(get("shipping_method_id") ?? "").trim();
  const couponCode = String(get("coupon_code") ?? "").trim();
  return {
    shipping_address: {
      full_name: s("full_name"),
      phone: s("phone"),
      line1: s("line1"),
      ...(line2 === "" ? {} : { line2 }),
      city: s("city"),
      state: s("state"),
      postal_code: s("postal_code"),
      country: "India",
    },
    seen_total_paise: seenTotalPaise,
    shipping_method_id: shippingMethodId || null,
    coupon_code: couponCode || null,
  };
}

/** How the price moved between what the customer saw and the live total. */
export interface ReconfirmDelta {
  /** `"up"` = the customer would now pay more. */
  direction: "up" | "down" | "same";
  /** Absolute movement, integer paise. */
  amountPaise: number;
  /** Signed display label, e.g. `+₹312.40` / `−₹98.10`. */
  label: string;
}

/** Delta for the reconfirm dialog's two-row comparison. */
export function reconfirmDelta(
  seenTotalPaise: number,
  trueTotalPaise: number,
): ReconfirmDelta {
  const diff = trueTotalPaise - seenTotalPaise;
  if (diff === 0) {
    return { direction: "same", amountPaise: 0, label: formatPaise(0) };
  }
  const amountPaise = Math.abs(diff);
  return diff > 0
    ? { direction: "up", amountPaise, label: `+${formatPaise(amountPaise)}` }
    : { direction: "down", amountPaise, label: `−${formatPaise(amountPaise)}` };
}

/**
 * What the island should render for a given action state. One kind per
 * distinct UI, so the component is a plain switch over this union.
 */
export type CheckoutUiState =
  | { kind: "form"; fieldErrors: AddressFieldErrors; banner: string | null }
  | { kind: "redirect"; to: string }
  | { kind: "unauthenticated" }
  | { kind: "price_unavailable"; material: "gold" | "silver" }
  | { kind: "out_of_stock" }
  | {
      kind: "reconfirm";
      seenTotalPaise: number;
      trueTotalPaise: number;
      delta: ReconfirmDelta;
    };

/**
 * Map every `CheckoutActionResult` branch to a UI state.
 *
 * - `null` (not yet submitted) and `error` render the form (the latter with a
 *   quiet banner); `invalid` renders it with inline field errors.
 * - `ok` redirects to the payment page; `empty_cart` back to the tray.
 */
export function mapCheckoutState(
  state: CheckoutActionResult | null,
): CheckoutUiState {
  if (state === null) {
    return { kind: "form", fieldErrors: {}, banner: null };
  }
  if (state.ok) {
    return { kind: "redirect", to: `/checkout/${state.order_id}/pay` };
  }
  switch (state.code) {
    case "invalid": {
      const fieldErrors: AddressFieldErrors = {};
      let other = false;
      for (const [key, messages] of Object.entries(state.fieldErrors)) {
        const field = key.startsWith("shipping_address.")
          ? key.slice("shipping_address.".length)
          : null;
        if (
          field !== null &&
          (ADDRESS_FIELDS as readonly string[]).includes(field) &&
          messages[0] !== undefined
        ) {
          fieldErrors[field as AddressField] = messages[0];
        } else {
          other = true;
        }
      }
      return {
        kind: "form",
        fieldErrors,
        banner: other
          ? "Something went wrong — please review your details and try again."
          : null,
      };
    }
    case "unauthenticated":
      return { kind: "unauthenticated" };
    case "empty_cart":
      return { kind: "redirect", to: "/cart" };
    case "price_unavailable":
      return { kind: "price_unavailable", material: state.material };
    case "reconfirm":
      return {
        kind: "reconfirm",
        seenTotalPaise: state.seen_total_paise,
        trueTotalPaise: state.true_total_paise,
        delta: reconfirmDelta(state.seen_total_paise, state.true_total_paise),
      };
    case "out_of_stock":
      return { kind: "out_of_stock" };
    case "invalid_shipping_method":
      return { kind: "form", fieldErrors: {}, banner: "The selected shipping method is no longer available. Please choose another." };
    case "invalid_coupon":
      return { kind: "form", fieldErrors: {}, banner: "The coupon code is invalid, expired, or doesn't meet the minimum order amount." };
    case "coupon_exhausted":
      return { kind: "form", fieldErrors: {}, banner: "This coupon has been fully redeemed and is no longer available." };
    case "error":
      return { kind: "form", fieldErrors: {}, banner: state.message };
  }
}
