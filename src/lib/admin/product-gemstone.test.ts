import { describe, it, expect } from "vitest";
import { parseProductGemstones, type GemstoneRow } from "./product-gemstone";

const row = (over: Partial<GemstoneRow> = {}): GemstoneRow => ({
  gem_type: "",
  carat_weight: "",
  cut: "",
  color: "",
  clarity: "",
  lab: "",
  certificate_number: "",
  laser_inscription: "",
  ...over,
});

describe("parseProductGemstones", () => {
  it("drops fully-empty rows", () => {
    const r = parseProductGemstones([row(), row()]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.items).toHaveLength(0);
  });

  it("parses a complete stone and nulls blank optionals", () => {
    const r = parseProductGemstones([
      row({
        gem_type: " Diamond ",
        carat_weight: "0.75",
        cut: "Round",
        clarity: "VS1",
      }),
    ]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.items[0]).toMatchObject({
        gem_type: "Diamond",
        carat_weight: 0.75,
        cut: "Round",
        clarity: "VS1",
        color: null,
        lab: null,
      });
    }
  });

  it("requires a stone type on a partially-filled row", () => {
    const r = parseProductGemstones([row({ carat_weight: "1.0" })]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors["0.gem_type"]).toBeDefined();
  });

  it("rejects a non-numeric carat", () => {
    const r = parseProductGemstones([
      row({ gem_type: "Ruby", carat_weight: "big" }),
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors["0.carat_weight"]).toBeDefined();
  });

  it("indexes errors by row position, skipping dropped blanks before them", () => {
    const r = parseProductGemstones([
      row(), // dropped
      row({ carat_weight: "2.0" }), // index 1: missing gem_type
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors["1.gem_type"]).toBeDefined();
  });
});
