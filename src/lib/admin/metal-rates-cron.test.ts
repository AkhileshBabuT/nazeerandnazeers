import { describe, expect, it } from "vitest";
import { paisFromMetalpriceRates } from "./metal-rates-cron";

describe("paisFromMetalpriceRates", () => {
  it("computes gold_paise from USDXAU and INR", () => {
    // (2000 * 83 / 31.1035) * 100 = 533701.9948... → 533702
    const { gold_paise } = paisFromMetalpriceRates({
      USDXAU: 2000,
      USDXAG: 0,
      INR: 83,
    });
    expect(gold_paise).toBe(533702);
  });

  it("computes silver_paise from USDXAG and INR", () => {
    // (25 * 83 / 31.1035) * 100 = 6671.275... → 6671
    const { silver_paise } = paisFromMetalpriceRates({
      USDXAU: 0,
      USDXAG: 25,
      INR: 83,
    });
    expect(silver_paise).toBe(6671);
  });

  it("rounds (not truncates) fractional intermediate values", () => {
    // (1 * 83 / 31.1035) * 100 = 266.851... → 267 (truncation would give 266)
    const { gold_paise, silver_paise } = paisFromMetalpriceRates({
      USDXAU: 1,
      USDXAG: 1,
      INR: 83,
    });
    expect(gold_paise).toBe(267);
    expect(silver_paise).toBe(267);
  });
});
