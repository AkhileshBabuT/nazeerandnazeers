import { describe, expect, it } from "vitest";
import {
  bpsToPercentInput,
  paiseToRupeesInput,
  percentToBps,
  rupeesToPaise,
} from "./money-input";

describe("rupeesToPaise", () => {
  it("converts whole rupees", () => {
    expect(rupeesToPaise("7245")).toBe(724500);
  });

  it("converts 1- and 2-decimal rupees exactly", () => {
    expect(rupeesToPaise("7245.5")).toBe(724550);
    expect(rupeesToPaise("7245.50")).toBe(724550);
    expect(rupeesToPaise("0.01")).toBe(1);
  });

  it("rejects sub-paise input instead of rounding", () => {
    expect(rupeesToPaise("12.345")).toBeNull();
  });

  it("rejects non-numeric, negative, and empty input", () => {
    expect(rupeesToPaise("abc")).toBeNull();
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("")).toBeNull();
    expect(rupeesToPaise("12.")).toBeNull();
  });
});

describe("percentToBps", () => {
  it("converts percent to basis points", () => {
    expect(percentToBps("3")).toBe(300);
    expect(percentToBps("12.5")).toBe(1250);
  });

  it("rejects sub-bps input", () => {
    expect(percentToBps("12.345")).toBeNull();
  });
});

describe("input round-trips", () => {
  it("paise → rupees string → paise", () => {
    expect(paiseToRupeesInput(724550)).toBe("7245.50");
    expect(rupeesToPaise(paiseToRupeesInput(724550))).toBe(724550);
  });

  it("bps → percent string → bps", () => {
    expect(bpsToPercentInput(1250)).toBe("12.50");
    expect(percentToBps(bpsToPercentInput(1250))).toBe(1250);
  });
});
