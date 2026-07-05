/**
 * Re-confirm tolerance guard (ADR-0002) — pure money arithmetic, no I/O.
 *
 * The Cart holds no prices; the price becomes real only at `createOrderFromCart`.
 * Between the customer seeing a total and clicking "pay", the Metal Rate can tick
 * over a cache boundary. So the action recomputes the true live total and
 * compares it to the total the client last saw:
 *
 *   - delta within `max(0.5% of seen total, ₹100)` → proceed silently at the
 *     true current price (a tiny tick must not block a purchase);
 *   - delta beyond it → reject with a re-confirm error ("the gold rate updated,
 *     please review your new total") so the customer is never silently charged a
 *     large jump on a high-value purchase.
 *
 * Everything is integer Paise (ADR-0006): ₹100 = 10_000 Paise; 0.5% = 50 basis
 * points. The boundary is INCLUSIVE (a delta exactly equal to the tolerance
 * proceeds). The comparison is symmetric — a rate that DROPS beyond tolerance is
 * rejected too, so the customer always re-confirms a materially different bill.
 */

/** The ₹100 absolute floor, in Paise. */
const FLOOR_PAISE = 100 * 100; // 10_000

/** 0.5% expressed in basis points (50 / 10_000). */
const TOLERANCE_BPS = 50;
const BPS_DEN = 10_000;

/**
 * The tolerance band for a given seen total, in Paise:
 * `max(0.5% of seen, ₹100)`. Computed with integer arithmetic; the percentage
 * is floored (any fractional Paisa of the band is dropped), which never widens
 * the band and keeps the guard conservative.
 */
export function reconfirmTolerancePaise(seenTotalPaise: number): number {
  const pct = Math.floor((seenTotalPaise * TOLERANCE_BPS) / BPS_DEN);
  return Math.max(pct, FLOOR_PAISE);
}

/**
 * True iff the true live total is within tolerance of the seen total and
 * checkout may proceed silently. Inclusive at the boundary; symmetric in the
 * direction of the move.
 */
export function withinReconfirmTolerance(
  seenTotalPaise: number,
  trueTotalPaise: number,
): boolean {
  const delta = Math.abs(trueTotalPaise - seenTotalPaise);
  return delta <= reconfirmTolerancePaise(seenTotalPaise);
}
