import { describe, it, expect } from "vitest";
import {
  ORDER_STATES,
  canTransition,
  assertTransition,
  nextStates,
  isMoneyMoved,
  IllegalTransitionError,
  type OrderStatus,
} from "./state-machine";

/**
 * Order state machine — the spine both `createOrderFromCart` and the Stripe
 * webhook write through (ADR-0009). Prototyped and unit-tested FIRST, before any
 * I/O code, so the legal-transition graph is pinned independently of the DB.
 *
 * The exhaustive table below is the contract. The two load-bearing rules:
 *   - `paid → cancelled` is DISALLOWED (cancelled means money never moved).
 *   - `cancelled → paid` is ALLOWED (the late-payment safety-valve revive,
 *     ADR-0004).
 */

// The full legal-transition set from ADR-0009, written out flat so the test is
// the source of truth for what the module must encode.
const LEGAL: ReadonlyArray<readonly [OrderStatus, OrderStatus]> = [
  ["pending", "paid"],
  ["pending", "cancelled"],
  ["paid", "processing"],
  ["processing", "shipped"],
  ["shipped", "delivered"],
  ["paid", "refunded"],
  ["processing", "refunded"],
  ["shipped", "refunded"],
  ["delivered", "refunded"],
  ["paid", "partially_refunded"],
  ["processing", "partially_refunded"],
  ["shipped", "partially_refunded"],
  ["delivered", "partially_refunded"],
  ["partially_refunded", "partially_refunded"],
  ["partially_refunded", "refunded"],
  ["cancelled", "paid"],
];

const LEGAL_SET = new Set(LEGAL.map(([f, t]) => `${f}->${t}`));

describe("order state machine — exhaustive legality", () => {
  it("accepts exactly the ADR-0009 legal transitions and rejects all others", () => {
    for (const from of ORDER_STATES) {
      for (const to of ORDER_STATES) {
        const expected = LEGAL_SET.has(`${from}->${to}`);
        expect(
          canTransition(from, to),
          `${from} -> ${to} should be ${expected ? "legal" : "illegal"}`,
        ).toBe(expected);
      }
    }
  });

  it("never treats a self-loop as legal except partially_refunded -> partially_refunded", () => {
    for (const s of ORDER_STATES) {
      const expected = s === "partially_refunded";
      expect(canTransition(s, s)).toBe(expected);
    }
  });
});

describe("order state machine — the two load-bearing rules", () => {
  it("DISALLOWS paid -> cancelled (cancelled means money never moved)", () => {
    expect(canTransition("paid", "cancelled")).toBe(false);
  });

  it("ALLOWS cancelled -> paid (late-payment safety-valve revive, ADR-0004)", () => {
    expect(canTransition("cancelled", "paid")).toBe(true);
  });

  it("disallows cancelling any post-payment state", () => {
    for (const s of ["paid", "processing", "shipped", "delivered"] as const) {
      expect(canTransition(s, "cancelled")).toBe(false);
    }
  });
});

describe("order state machine — terminality of cancelled & delivered/refunded", () => {
  it("cancelled has no legal exits except the revive to paid", () => {
    const exits = nextStates("cancelled");
    expect(exits).toEqual(["paid"]);
  });

  it("delivered's only exits are the refund states", () => {
    const exits = new Set(nextStates("delivered"));
    expect(exits).toEqual(new Set(["refunded", "partially_refunded"]));
  });

  it("refunded is fully terminal (no exits)", () => {
    expect(nextStates("refunded")).toEqual([]);
  });
});

describe("assertTransition — throws a typed error on an illegal move", () => {
  it("passes a legal transition through silently", () => {
    expect(() => assertTransition("pending", "paid")).not.toThrow();
  });

  it("throws IllegalTransitionError on paid -> cancelled, naming both states", () => {
    let caught: unknown;
    try {
      assertTransition("paid", "cancelled");
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IllegalTransitionError);
    expect(caught).toMatchObject({ from: "paid", to: "cancelled" });
  });
});

describe("isMoneyMoved — 'did money move?' is a clean query", () => {
  it("is false only for pending and cancelled", () => {
    expect(isMoneyMoved("pending")).toBe(false);
    expect(isMoneyMoved("cancelled")).toBe(false);
  });

  it("is true for every post-payment state", () => {
    for (const s of [
      "paid",
      "processing",
      "shipped",
      "delivered",
      "refunded",
      "partially_refunded",
    ] as const) {
      expect(isMoneyMoved(s)).toBe(true);
    }
  });
});
