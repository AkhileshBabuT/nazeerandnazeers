import { describe, it, expect } from "vitest";
import { reviewSummary, starString } from "./reviews";

describe("reviewSummary", () => {
  it("is zero for no ratings", () => {
    expect(reviewSummary([])).toEqual({ count: 0, average: 0 });
  });
  it("counts and averages, rounded to 1 dp", () => {
    expect(reviewSummary([5, 4, 4])).toEqual({ count: 3, average: 4.3 });
  });
  it("handles a single rating", () => {
    expect(reviewSummary([5])).toEqual({ count: 1, average: 5 });
  });
});

describe("starString", () => {
  it("renders filled + empty to five glyphs", () => {
    expect(starString(4)).toBe("★★★★☆");
    expect(starString(0)).toBe("☆☆☆☆☆");
    expect(starString(5)).toBe("★★★★★");
  });
  it("rounds and clamps", () => {
    expect(starString(4.3)).toBe("★★★★☆");
    expect(starString(4.6)).toBe("★★★★★");
    expect(starString(9)).toBe("★★★★★");
  });
});
