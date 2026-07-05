import { describe, expect, it } from "vitest";
import { isBackdated, liveRateIds, parseRateInput } from "./rates";

describe("parseRateInput (rupee→paise exactness guard)", () => {
  it("accepts whole rupees as integer paise", () => {
    expect(parseRateInput("7245")).toEqual({
      ok: true,
      ratePerGramPaise: 724500,
    });
  });

  it("accepts 1- and 2-decimal rupees exactly, integer output", () => {
    const one = parseRateInput("7245.5");
    const two = parseRateInput("92.40");
    expect(one).toEqual({ ok: true, ratePerGramPaise: 724550 });
    expect(two).toEqual({ ok: true, ratePerGramPaise: 9240 });
    if (two.ok) {
      expect(Number.isInteger(two.ratePerGramPaise)).toBe(true);
    }
  });

  it("rejects sub-paise input rather than rounding", () => {
    const parsed = parseRateInput("7245.123");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error).toMatch(/sub-paise/i);
    }
  });

  it("rejects empty, non-numeric, negative, and trailing-dot input", () => {
    expect(parseRateInput("").ok).toBe(false);
    expect(parseRateInput("   ").ok).toBe(false);
    expect(parseRateInput("abc").ok).toBe(false);
    expect(parseRateInput("-5").ok).toBe(false);
    expect(parseRateInput("7245.").ok).toBe(false);
  });

  it("rejects zero (rates must be positive integers of paise)", () => {
    expect(parseRateInput("0").ok).toBe(false);
    expect(parseRateInput("0.00").ok).toBe(false);
  });
});

describe("isBackdated", () => {
  it("is true when the posted row lands behind a newer existing row", () => {
    expect(
      isBackdated("2026-06-11T08:00:00Z", "2026-06-11T08:32:00Z"),
    ).toBe(true);
  });

  it("is false when the posted row is the newest (or ties)", () => {
    expect(
      isBackdated("2026-06-11T09:00:00Z", "2026-06-11T08:32:00Z"),
    ).toBe(false);
    expect(
      isBackdated("2026-06-11T08:32:00Z", "2026-06-11T08:32:00Z"),
    ).toBe(false);
  });

  it("is false when there was no prior row", () => {
    expect(isBackdated("2026-06-11T08:00:00Z", null)).toBe(false);
  });
});

describe("liveRateIds", () => {
  it("crowns the first (newest) row per material in a desc list", () => {
    const live = liveRateIds([
      { id: "a", material: "gold" },
      { id: "b", material: "silver" },
      { id: "c", material: "gold" },
      { id: "d", material: "silver" },
    ]);
    expect(live).toEqual(new Set(["a", "b"]));
  });

  it("is empty for an empty history", () => {
    expect(liveRateIds([]).size).toBe(0);
  });
});
