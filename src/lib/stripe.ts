import Stripe from "stripe";

/**
 * Server-side Stripe SDK client.
 *
 * Instantiation only — NO webhook handling and NO PaymentIntent / Checkout
 * logic here. Those arrive in Phase 1.
 *
 * India / INR notes:
 * - Currency (`inr`) and amounts are set per-request on PaymentIntents /
 *   Checkout Sessions in Phase 1, not at client construction — Stripe has no
 *   client-level default currency.
 * - For India, the Stripe account itself must be India-registered, and
 *   exports/international card rules apply at the API call site. This client
 *   is currency-agnostic by design.
 *
 * The `apiVersion` is pinned to the version this SDK release was generated
 * against (`Stripe.PACKAGE_VERSION` ships locked to it), so responses match
 * the types. Bump it deliberately, never implicitly.
 */

let client: Stripe | null = null;

/**
 * Lazily construct the client so importing this module never throws —
 * `next build` evaluates route modules (Cache Components page-data collection)
 * in environments where STRIPE_SECRET_KEY is deliberately unset. The missing
 * key still fails loudly on first actual use.
 */
function getStripe(): Stripe {
  if (client !== null) {
    return client;
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY. See .env.example.");
  }
  client = new Stripe(secretKey, {
    // Pinned to the SDK-generated version (2026-05-27.dahlia for stripe@22).
    apiVersion: "2026-05-27.dahlia",
    maxNetworkRetries: 2,
    appInfo: {
      name: "nazeerandnazeers",
    },
  });
  return client;
}

export const stripe: Stripe = new Proxy({} as Stripe, {
  get(_target, prop, receiver) {
    return Reflect.get(getStripe(), prop, receiver);
  },
});
