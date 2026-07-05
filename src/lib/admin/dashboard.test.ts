import { describe, expect, it } from "vitest";
import { ageLabel, rateFreshness, startOfTodayIstIso } from "./dashboard";

const HOUR_S = 3600;
const NOW = Date.parse("2026-06-11T10:00:00.000Z");

function rowAgedHours(hours: number) {
  return {
    rate_per_gram_paise: 724500,
    effective_at: new Date(NOW - hours * HOUR_S * 1000).toISOString(),
  };
}

describe("rateFreshness", () => {
  it("returns missing when no row exists", () => {
    expect(rateFreshness(null, 86400, NOW)).toEqual({ status: "missing" });
  });

  it("returns fresh within the ceiling (boundary inclusive, like getCurrentRate)", () => {
    const f = rateFreshness(rowAgedHours(24), 24 * HOUR_S, NOW);
    expect(f.status).toBe("fresh");
    if (f.status === "fresh") {
      expect(f.ratePaise).toBe(724500);
      expect(f.ageSeconds).toBe(24 * HOUR_S);
    }
  });

  it("returns stale once age exceeds the ceiling", () => {
    const f = rateFreshness(rowAgedHours(26), 24 * HOUR_S, NOW);
    expect(f.status).toBe("stale");
    if (f.status === "stale") {
      expect(f.ageSeconds).toBe(26 * HOUR_S);
    }
  });

  it("clamps a future effective_at to age 0 (fresh)", () => {
    const f = rateFreshness(rowAgedHours(-1), 24 * HOUR_S, NOW);
    expect(f.status).toBe("fresh");
    if (f.status === "fresh") {
      expect(f.ageSeconds).toBe(0);
    }
  });
});

describe("ageLabel", () => {
  it("renders whole hours past an hour", () => {
    expect(ageLabel(26 * HOUR_S)).toBe("26h");
    expect(ageLabel(HOUR_S)).toBe("1h");
  });

  it("renders minutes under an hour, never 0m", () => {
    expect(ageLabel(14 * 60)).toBe("14m");
    expect(ageLabel(10)).toBe("1m");
  });
});

describe("startOfTodayIstIso", () => {
  it("returns IST midnight as a UTC instant", () => {
    // 10:00 UTC = 15:30 IST → IST midnight = previous day 18:30 UTC.
    expect(startOfTodayIstIso(NOW)).toBe("2026-06-10T18:30:00.000Z");
  });

  it("rolls the IST day just after 18:30 UTC", () => {
    const justAfter = Date.parse("2026-06-11T18:31:00.000Z"); // 00:01 IST Jun 12
    expect(startOfTodayIstIso(justAfter)).toBe("2026-06-11T18:30:00.000Z");
  });
});
