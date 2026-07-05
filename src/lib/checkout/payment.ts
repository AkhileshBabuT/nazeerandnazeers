/**
 * C6 payment-form logic (PRD 04 §1.6) — the PaymentSection island's pure
 * brain. The island stays thin wiring (no @testing-library/react in this
 * repo): the submit-phase union, the quiet decline copy, and the Stripe
 * `return_url` all live here, unit-tested in node-env.
 */

import type { StripeError } from "@stripe/stripe-js";

/** Where Stripe sends the customer after confirmation — C7. */
export function confirmationReturnUrl(origin: string, orderId: string): string {
  return `${origin}/orders/${orderId}/confirmation`;
}

/**
 * What the pay form is doing — the island is a trivial switch over this.
 * `declined` keeps the form unlocked: retry is allowed while the window is
 * open (the countdown island unmounts everything at 0 regardless).
 */
export type PayPhase =
  | { kind: "ready" }
  | { kind: "submitting" }
  | { kind: "declined"; message: string };

const GENERIC_DECLINE =
  "The payment could not be completed — you have not been charged. Please try again.";

/**
 * Quiet inline copy for a `confirmPayment` failure. Stripe writes
 * `card_error` / `validation_error` messages for customers (they name the
 * actual decline reason); every other type gets the generic line — internal
 * messages are not for the customer.
 */
export function declineMessage(
  error: Pick<StripeError, "type" | "message"> | undefined,
): string {
  if (error === undefined) {
    return GENERIC_DECLINE;
  }
  if (
    (error.type === "card_error" || error.type === "validation_error") &&
    error.message !== undefined &&
    error.message !== ""
  ) {
    return error.message;
  }
  return GENERIC_DECLINE;
}
