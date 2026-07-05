import { describe, expect, it } from "vitest";
import { formatGrams, formatPaise, formatRate } from "./format";

describe("formatPaise", () => {
  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0.00");
  });

  it("formats single paisa", () => {
    expect(formatPaise(1)).toBe("₹0.01");
  });

  it("formats sub-rupee amounts", () => {
    expect(formatPaise(99)).toBe("₹0.99");
  });

  it("formats whole rupees", () => {
    expect(formatPaise(100)).toBe("₹1.00");
  });

  it("does not group below 4 rupee digits", () => {
    expect(formatPaise(99999)).toBe("₹999.99");
  });

  it("groups thousands (first group of 3)", () => {
    expect(formatPaise(100000)).toBe("₹1,000.00");
  });

  it("formats a typical order total", () => {
    expect(formatPaise(8421350)).toBe("₹84,213.50");
  });

  it("uses Indian 2-2-3 grouping at lakh scale", () => {
    expect(formatPaise(12345678)).toBe("₹1,23,456.78");
  });

  it("uses Indian grouping at crore scale", () => {
    expect(formatPaise(1000000000)).toBe("₹1,00,00,000.00");
  });

  it("handles arbitrarily large amounts", () => {
    expect(formatPaise(123456789012)).toBe("₹1,23,45,67,890.12");
  });

  it("keeps paise exact (never floats)", () => {
    // 0.1 + 0.2 style hazards cannot appear: input is integer paise.
    expect(formatPaise(2999)).toBe("₹29.99");
    expect(formatPaise(3001)).toBe("₹30.01");
  });

  it("formats negative amounts with a leading sign", () => {
    expect(formatPaise(-12345)).toBe("-₹123.45");
  });
});

describe("formatRate", () => {
  it("appends the per-gram unit", () => {
    expect(formatRate(724500)).toBe("₹7,245.00/g");
    expect(formatRate(9240)).toBe("₹92.40/g");
  });
});

describe("formatGrams", () => {
  it("always shows 3 decimals", () => {
    expect(formatGrams("12.48")).toBe("12.480 g");
    expect(formatGrams(7.35)).toBe("7.350 g");
    expect(formatGrams("24.15")).toBe("24.150 g");
  });
});
