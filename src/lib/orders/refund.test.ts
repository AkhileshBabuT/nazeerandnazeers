import { describe, it, expect } from "vitest";
import {
  itemUnitGstSharePaise,
  itemRefundAmountPaise,
  resultingStatusAfterItemRefund,
  planItemRefund,
  type RefundableItem,
  type OrderGstSnapshot,
} from "./refund";

/**
 * Refund core (PRD 05). The highest-value property: an item's refund amount is
 * recomputed from the ITEM's snapshotted price + the ORDER's snapshotted GST bps
 * (ADR-0003/0005), so it is immutable — flipping today's `settings` GST is
 * irrelevant because nothing here reads `settings`. These tests pin the tax
 * share, the per-item amount, the resulting Order status, and the multi-line
 * plan including the "two refunds against the same item drain it" case.
 *
 * All money is integer Paise (ADR-0006). The standard GST snapshot is 3% metal
 * (300 bps) + 5% making (500 bps), the documented defaults.
 */

const GST: OrderGstSnapshot = { gst_metal_bps: 300, gst_making_bps: 500 };

/** An item priced so the GST share is exact (no rounding ambiguity). */
function item(over: Partial<RefundableItem> = {}): RefundableItem {
  return {
    order_item_id: "oi-1",
    // pre-tax unit = metal 100_000 + making 20_000 = 120_000 Paise (₹1,200).
    unit_price_paise: 120_000,
    making_charges_paise: 20_000,
    quantity: 2,
    refunded_quantity: 0,
    ...over,
  };
}

describe("itemUnitGstSharePaise — recomputed from the Order's frozen bps", () => {
  it("sums disjoint metal + making GST (3% of 100_000 + 5% of 20_000)", () => {
    // metal value = unit - making = 100_000; 3% = 3_000. making 20_000; 5% = 1_000.
    expect(itemUnitGstSharePaise(item(), GST)).toBe(4_000);
  });

  it("rounds each base half-up independently, like the original snapshot", () => {
    // metal value = 33_333; 3% = 999.99 → 1_000. making = 1; 5% = 0.05 → 0.
    const it1 = { unit_price_paise: 33_334, making_charges_paise: 1 };
    expect(itemUnitGstSharePaise(it1, GST)).toBe(1_000);
  });

  it("is IMMUTABLE — uses the passed snapshot, not any live settings", () => {
    const frozen = itemUnitGstSharePaise(item(), GST);
    // A later GST hike in `settings` would pass DIFFERENT bps; the old Order's
    // snapshot is unchanged, so the same call with the OLD bps still returns 4_000.
    const liveHigherBps: OrderGstSnapshot = { gst_metal_bps: 1800, gst_making_bps: 1800 };
    expect(itemUnitGstSharePaise(item(), liveHigherBps)).not.toBe(frozen);
    // Re-running with the order's OWN frozen bps is stable.
    expect(itemUnitGstSharePaise(item(), GST)).toBe(frozen);
  });

  it("throws if making charge exceeds the pre-tax unit price (corrupt row)", () => {
    expect(() =>
      itemUnitGstSharePaise({ unit_price_paise: 100, making_charges_paise: 200 }, GST),
    ).toThrow(/exceeds/);
  });
});

describe("itemRefundAmountPaise — (pre-tax + GST share) × quantity", () => {
  it("refunds one unit tax-inclusive (120_000 + 4_000)", () => {
    expect(itemRefundAmountPaise(item(), 1, GST)).toBe(124_000);
  });

  it("scales by quantity", () => {
    expect(itemRefundAmountPaise(item({ quantity: 3 }), 3, GST)).toBe(372_000);
  });

  it("rejects refunding more units than remain", () => {
    expect(() =>
      itemRefundAmountPaise(item({ quantity: 2, refunded_quantity: 2 }), 1, GST),
    ).toThrow(/only 0 remain/);
  });

  it("rejects a non-positive quantity", () => {
    expect(() => itemRefundAmountPaise(item(), 0, GST)).toThrow(/positive integer/);
  });
});

describe("resultingStatusAfterItemRefund", () => {
  it("partially_refunded while any unit remains un-refunded", () => {
    expect(
      resultingStatusAfterItemRefund([
        { quantity: 2, refunded_quantity: 1 },
        { quantity: 1, refunded_quantity: 1 },
      ]),
    ).toBe("partially_refunded");
  });

  it("refunded once every unit of every line is refunded", () => {
    expect(
      resultingStatusAfterItemRefund([
        { quantity: 2, refunded_quantity: 2 },
        { quantity: 1, refunded_quantity: 1 },
      ]),
    ).toBe("refunded");
  });
});

describe("planItemRefund — multi-line plan + resulting status", () => {
  const items: RefundableItem[] = [
    item({ order_item_id: "oi-1", quantity: 2, refunded_quantity: 0 }),
    item({
      order_item_id: "oi-2",
      quantity: 1,
      refunded_quantity: 0,
      unit_price_paise: 50_000,
      making_charges_paise: 0,
    }),
  ];

  it("plans one line, lands partially_refunded (other item untouched)", () => {
    const plan = planItemRefund(items, [{ order_item_id: "oi-1", quantity: 1 }], GST);
    expect(plan.lines).toEqual([
      { order_item_id: "oi-1", quantity: 1, amount_paise: 124_000 },
    ]);
    expect(plan.total_amount_paise).toBe(124_000);
    expect(plan.resulting_status).toBe("partially_refunded");
  });

  it("refunding every unit of every line lands refunded", () => {
    const plan = planItemRefund(
      items,
      [
        { order_item_id: "oi-1", quantity: 2 },
        { order_item_id: "oi-2", quantity: 1 },
      ],
      GST,
    );
    // oi-2: metal 50_000 → 3% = 1_500; making 0. amount = 51_500.
    expect(plan.total_amount_paise).toBe(124_000 * 2 + 51_500);
    expect(plan.resulting_status).toBe("refunded");
  });

  it("two requests against the SAME item in one batch cannot over-drain it", () => {
    expect(() =>
      planItemRefund(
        items,
        [
          { order_item_id: "oi-1", quantity: 1 },
          { order_item_id: "oi-1", quantity: 2 }, // only 1 left after the first
        ],
        GST,
      ),
    ).toThrow(/only 1 remain/);
  });

  it("rejects an item id that is not on the Order", () => {
    expect(() =>
      planItemRefund(items, [{ order_item_id: "ghost", quantity: 1 }], GST),
    ).toThrow(/not on this Order/);
  });

  it("rejects an empty request", () => {
    expect(() => planItemRefund(items, [], GST)).toThrow(/at least one/);
  });
});
