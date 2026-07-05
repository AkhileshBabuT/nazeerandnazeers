import { describe, expect, it } from "vitest";
import { calculatePrice } from "./pricing";
import {
  cartGstDisplaySplit,
  formatBps,
  gstDisplaySplit,
} from "./gst-display";

const settings = { gst_metal_bps: 300, gst_making_bps: 500 };

describe("gstDisplaySplit", () => {
  it("splits exactly back into Price.gst (gold, percent making)", () => {
    const price = calculatePrice(
      {
        material: "gold",
        weight_grams: "7.35",
        purity_karat: 22,
        making_charge_type: "percent",
        making_charge_value: 1200,
      },
      { material: "gold", rate_per_gram_paise: 724500 },
      settings,
    );
    const split = gstDisplaySplit(price, settings);
    expect(split.gst_metal + split.gst_making).toBe(price.gst);
    expect(split.gst_metal).toBe(
      Math.round((price.metal_value * 300) / 10000),
    );
  });

  it("splits exactly for silver flat making at odd paise", () => {
    const price = calculatePrice(
      {
        material: "silver",
        weight_grams: "38.5",
        purity_karat: null,
        making_charge_type: "flat",
        making_charge_value: 33333,
      },
      { material: "silver", rate_per_gram_paise: 9240 },
      settings,
    );
    const split = gstDisplaySplit(price, settings);
    expect(split.gst_metal + split.gst_making).toBe(price.gst);
  });
});

describe("cartGstDisplaySplit", () => {
  const gold = calculatePrice(
    {
      material: "gold",
      weight_grams: "7.35",
      purity_karat: 22,
      making_charge_type: "percent",
      making_charge_value: 1200,
    },
    { material: "gold", rate_per_gram_paise: 724500 },
    settings,
  );
  const silver = calculatePrice(
    {
      material: "silver",
      weight_grams: "38.5",
      purity_karat: null,
      making_charge_type: "flat",
      making_charge_value: 33333,
    },
    { material: "silver", rate_per_gram_paise: 9240 },
    settings,
  );

  it("sums per-line splits × quantity over priced lines", () => {
    const lines = [
      { unit_price: gold, quantity: 2 },
      { unit_price: silver, quantity: 3 },
    ];
    const split = cartGstDisplaySplit(lines, settings);
    const expectedMetal =
      gstDisplaySplit(gold, settings).gst_metal * 2 +
      gstDisplaySplit(silver, settings).gst_metal * 3;
    const expectedMaking =
      gstDisplaySplit(gold, settings).gst_making * 2 +
      gstDisplaySplit(silver, settings).gst_making * 3;
    expect(split.gst_metal).toBe(expectedMetal);
    expect(split.gst_making).toBe(expectedMaking);
  });

  it("matches the cart-level GST total (sum of line_gst)", () => {
    const lines = [
      { unit_price: gold, quantity: 2 },
      { unit_price: silver, quantity: 3 },
    ];
    const split = cartGstDisplaySplit(lines, settings);
    const cartGst = gold.gst * 2 + silver.gst * 3;
    expect(split.gst_metal + split.gst_making).toBe(cartGst);
  });

  it("is empty over no priced lines", () => {
    expect(cartGstDisplaySplit([], settings)).toEqual({
      gst_metal: 0,
      gst_making: 0,
    });
  });
});

describe("formatBps", () => {
  it("renders whole percents bare", () => {
    expect(formatBps(300)).toBe("3%");
    expect(formatBps(500)).toBe("5%");
  });

  it("renders fractional percents trimmed", () => {
    expect(formatBps(1250)).toBe("12.5%");
    expect(formatBps(333)).toBe("3.33%");
  });
});
