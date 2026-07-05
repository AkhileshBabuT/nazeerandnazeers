import { describe, it, expect } from "vitest";
import { mergeCartLines, type MergeLine } from "./merge";

/**
 * Cart Merge — the highest-value unit test (PRD 03). Pins the subtle
 * max-not-sum invariant and the stock clamp on a pure function, no DB.
 *
 * The rule (CONTEXT "Cart Merge"): on a Product collision between the guest
 * Cart and a pre-existing account Cart, the merged line is max(guest, account),
 * never summed; non-overlapping lines union; everything is clamped to stock.
 */

/** A stock table → a `stockFor` lookup; missing Products report 0 stock. */
function stock(table: Record<string, number>): (id: string) => number {
  return (id) => table[id] ?? 0;
}

const PLENTY = 9999;

describe("mergeCartLines — pure carry-over (empty account Cart)", () => {
  it("takes every guest line as-is when the account has no Cart", () => {
    const guest: MergeLine[] = [
      { product_id: "p1", quantity: 2 },
      { product_id: "p2", quantity: 1 },
    ];
    const merged = mergeCartLines(guest, [], stock({ p1: PLENTY, p2: PLENTY }));
    expect(merged).toEqual([
      { product_id: "p1", quantity: 2 },
      { product_id: "p2", quantity: 1 },
    ]);
  });

  it("clamps a carried-over line to the Product's current stock", () => {
    const guest: MergeLine[] = [{ product_id: "p1", quantity: 5 }];
    const merged = mergeCartLines(guest, [], stock({ p1: 3 }));
    expect(merged).toEqual([{ product_id: "p1", quantity: 3 }]);
  });

  it("drops a line whose stock has fallen to 0", () => {
    const guest: MergeLine[] = [{ product_id: "p1", quantity: 2 }];
    const merged = mergeCartLines(guest, [], stock({ p1: 0 }));
    expect(merged).toEqual([]);
  });
});

describe("mergeCartLines — collision collapses to max, never sum", () => {
  it("a colliding Product becomes max(guest, account), not the sum", () => {
    const guest: MergeLine[] = [{ product_id: "p1", quantity: 3 }];
    const account: MergeLine[] = [{ product_id: "p1", quantity: 1 }];
    const merged = mergeCartLines(guest, account, stock({ p1: PLENTY }));
    // max(3, 1) = 3 — emphatically NOT 4.
    expect(merged).toEqual([{ product_id: "p1", quantity: 3 }]);
  });

  it("takes the account quantity when it is the larger side", () => {
    const guest: MergeLine[] = [{ product_id: "p1", quantity: 1 }];
    const account: MergeLine[] = [{ product_id: "p1", quantity: 4 }];
    const merged = mergeCartLines(guest, account, stock({ p1: PLENTY }));
    expect(merged).toEqual([{ product_id: "p1", quantity: 4 }]);
  });

  it("unions non-overlapping lines from both sides", () => {
    const guest: MergeLine[] = [{ product_id: "p1", quantity: 2 }];
    const account: MergeLine[] = [{ product_id: "p2", quantity: 1 }];
    const merged = mergeCartLines(guest, account, stock({ p1: PLENTY, p2: PLENTY }));
    expect(merged).toEqual(
      expect.arrayContaining([
        { product_id: "p1", quantity: 2 },
        { product_id: "p2", quantity: 1 },
      ]),
    );
    expect(merged).toHaveLength(2);
  });

  it("clamps the merged max to stock (a merge can never oversell)", () => {
    const guest: MergeLine[] = [{ product_id: "p1", quantity: 5 }];
    const account: MergeLine[] = [{ product_id: "p1", quantity: 4 }];
    // max(5, 4) = 5, but only 2 in stock → 2.
    const merged = mergeCartLines(guest, account, stock({ p1: 2 }));
    expect(merged).toEqual([{ product_id: "p1", quantity: 2 }]);
  });

  it("handles the mixed case: one colliding line + unioned singles, all clamped", () => {
    const guest: MergeLine[] = [
      { product_id: "p1", quantity: 3 }, // collides
      { product_id: "p2", quantity: 9 }, // guest-only, over stock
    ];
    const account: MergeLine[] = [
      { product_id: "p1", quantity: 5 }, // collides (account larger)
      { product_id: "p3", quantity: 1 }, // account-only
    ];
    const merged = mergeCartLines(
      guest,
      account,
      stock({ p1: 4, p2: 6, p3: 2 }),
    );
    // p1: max(3,5)=5 clamped to 4; p2: 9 clamped to 6; p3: 1
    expect(merged).toEqual(
      expect.arrayContaining([
        { product_id: "p1", quantity: 4 },
        { product_id: "p2", quantity: 6 },
        { product_id: "p3", quantity: 1 },
      ]),
    );
    expect(merged).toHaveLength(3);
  });
});
