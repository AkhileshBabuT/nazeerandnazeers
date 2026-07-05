import { describe, it, expect } from "vitest";
import { withinReconfirmTolerance, reconfirmTolerancePaise } from "./reconfirm";

/**
 * Re-confirm tolerance guard (ADR-0002). At checkout the action recomputes the
 * true live total and compares it to the total the client last saw. Within
 * `max(0.5% of seen total, ₹100)` → proceed silently at the true price; outside
 * → reject so the customer re-confirms.
 *
 * All money is integer Paise (ADR-0006). ₹100 = 10_000 Paise. 0.5% = 50 bps.
 * The boundary is INCLUSIVE: a delta exactly equal to the tolerance proceeds.
 * This file pins the boundary at/inside/outside on both sides (rate up or down).
 */

const RUPEE = 100; // Paise per Rupee.
const FLOOR = 100 * RUPEE; // ₹100 floor = 10_000 Paise.

describe("reconfirmTolerancePaise — max(0.5% of seen, ₹100)", () => {
  it("uses the ₹100 floor when 0.5% of seen is smaller", () => {
    // seen = ₹1,000 = 100_000 Paise; 0.5% = 500 Paise < 10_000 floor.
    expect(reconfirmTolerancePaise(100_000)).toBe(FLOOR);
  });

  it("uses 0.5% of seen when it exceeds the ₹100 floor", () => {
    // seen = ₹60,000 = 6_000_000 Paise; 0.5% = 30_000 Paise > 10_000 floor.
    expect(reconfirmTolerancePaise(6_000_000)).toBe(30_000);
  });

  it("is exactly the floor at the crossover (seen = ₹2,000)", () => {
    // 0.5% of 200_000 = 1_000... that's below floor; crossover is at ₹2,000,000?
    // 0.5% of seen == 10_000 when seen == 2_000_000 (₹20,000).
    expect(reconfirmTolerancePaise(2_000_000)).toBe(FLOOR);
  });
});

describe("withinReconfirmTolerance — boundary on a SMALL order (floor dominates)", () => {
  const seen = 100_000; // ₹1,000; tolerance = ₹100 = 10_000 Paise.

  it("proceeds when the true total is unchanged", () => {
    expect(withinReconfirmTolerance(seen, seen)).toBe(true);
  });

  it("proceeds just inside the floor (delta = ₹99.99)", () => {
    expect(withinReconfirmTolerance(seen, seen + (FLOOR - 1))).toBe(true);
  });

  it("proceeds exactly AT the floor (delta = ₹100, inclusive)", () => {
    expect(withinReconfirmTolerance(seen, seen + FLOOR)).toBe(true);
  });

  it("rejects just OUTSIDE the floor (delta = ₹100.01)", () => {
    expect(withinReconfirmTolerance(seen, seen + FLOOR + 1)).toBe(false);
  });

  it("is symmetric — a rate DROP outside tolerance also rejects", () => {
    expect(withinReconfirmTolerance(seen, seen - FLOOR - 1)).toBe(false);
    expect(withinReconfirmTolerance(seen, seen - FLOOR)).toBe(true);
  });
});

describe("withinReconfirmTolerance — boundary on a LARGE order (0.5% dominates)", () => {
  const seen = 6_000_000; // ₹60,000; tolerance = 0.5% = 30_000 Paise.

  it("proceeds exactly at the 0.5% boundary (inclusive)", () => {
    expect(withinReconfirmTolerance(seen, seen + 30_000)).toBe(true);
  });

  it("rejects one Paisa beyond the 0.5% boundary", () => {
    expect(withinReconfirmTolerance(seen, seen + 30_001)).toBe(false);
  });

  it("a big silent jump (₹2,000 on a ₹60,000 order) is rejected", () => {
    expect(withinReconfirmTolerance(seen, seen + 200_000)).toBe(false);
  });
});
