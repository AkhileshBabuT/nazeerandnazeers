/**
 * Cart Merge — the pure resolution rule (PRD 03, CONTEXT "Cart Merge").
 *
 * When a Guest formally signs up / logs in, Supabase links the anonymous
 * identity into the permanent account. Two cases:
 *
 *  - **Pure carry-over.** The account had no pre-existing Cart (or the Product
 *    does not collide): every guest line is taken as-is. Because a Cart holds no
 *    prices, "taken as-is" means: keep the quantity, clamped to current stock.
 *
 *  - **Collision.** The same Product is in both the guest Cart and the
 *    pre-existing account Cart. The merged line is `max(guest, account)` —
 *    **never summed**. A unique piece exists only once; summing would double a
 *    selection the shopper only ever intended once (CONTEXT "Cart Merge").
 *
 * Every resulting line is finally clamped to the Product's current
 * `stock_quantity` (a soft UX clamp; the hard reservation is Checkout's job —
 * ADR-0001). A line whose stock has dropped to 0 is dropped entirely.
 *
 * This module is pure (no I/O): it takes the two sides plus a stock lookup and
 * returns the merged desired quantities per Product. The Server Action / RPC
 * applies the result against the database. Keeping it pure makes the
 * max-not-sum invariant — the subtle, easy-to-get-wrong rule — directly
 * unit-testable.
 */

/** One Cart line as the merge rule consumes it: a Product and its quantity. */
export interface MergeLine {
  product_id: string;
  quantity: number;
}

/** A resolved line: the desired quantity for a Product after the merge. */
export interface MergedLine {
  product_id: string;
  quantity: number;
}

/**
 * Resolve a guest Cart against a pre-existing account Cart.
 *
 * @param guestLines  the anonymous Guest's Cart lines (carried over on link).
 * @param accountLines the pre-existing account Cart lines (may be empty).
 * @param stockFor    current `stock_quantity` for a Product id (clamp ceiling).
 *                    A Product absent from the catalog returns 0 → dropped.
 * @returns one line per Product present on either side, quantity =
 *          `min(max(guest, account), stock)`, with zero-stock lines omitted.
 */
export function mergeCartLines(
  guestLines: readonly MergeLine[],
  accountLines: readonly MergeLine[],
  stockFor: (productId: string) => number,
): MergedLine[] {
  // max-not-sum: fold both sides into the running max per Product.
  const desired = new Map<string, number>();

  const takeMax = (line: MergeLine): void => {
    const prev = desired.get(line.product_id) ?? 0;
    if (line.quantity > prev) {
      desired.set(line.product_id, line.quantity);
    }
  };

  // Account side first then guest side — order is irrelevant to `max`, but
  // iterating both makes the union explicit (non-overlapping lines from either
  // side survive).
  for (const line of accountLines) takeMax(line);
  for (const line of guestLines) takeMax(line);

  const merged: MergedLine[] = [];
  for (const [product_id, wanted] of desired) {
    const stock = stockFor(product_id);
    const quantity = Math.min(wanted, Math.max(0, stock));
    if (quantity > 0) {
      merged.push({ product_id, quantity });
    }
  }
  return merged;
}
