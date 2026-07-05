import { describe, it, expect } from "vitest";
import { parseProductMedia, type MediaRow } from "./product-media";

const row = (over: Partial<MediaRow> = {}): MediaRow => ({
  url: "https://x/a.jpg",
  alt_text: "",
  is_primary: false,
  ...over,
});

describe("parseProductMedia", () => {
  it("assigns sort_order by position and trims fields", () => {
    const out = parseProductMedia([
      row({ url: " https://x/1.jpg ", alt_text: " front " }),
      row({ url: "https://x/2.jpg" }),
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      url: "https://x/1.jpg",
      alt_text: "front",
      sort_order: 0,
    });
    expect(out[1]!.sort_order).toBe(1);
  });

  it("drops blank-url rows", () => {
    const out = parseProductMedia([
      row({ url: "  " }),
      row({ url: "https://x/keep.jpg" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.url).toBe("https://x/keep.jpg");
    expect(out[0]!.sort_order).toBe(0); // re-indexed after the drop
  });

  it("makes the first row primary when none is flagged", () => {
    const out = parseProductMedia([row(), row()]);
    expect(out[0]!.is_primary).toBe(true);
    expect(out[1]!.is_primary).toBe(false);
  });

  it("keeps the first flagged primary and collapses the rest", () => {
    const out = parseProductMedia([
      row({ is_primary: false }),
      row({ is_primary: true }),
      row({ is_primary: true }),
    ]);
    expect(out.filter((m) => m.is_primary)).toHaveLength(1);
    expect(out[1]!.is_primary).toBe(true);
    expect(out[2]!.is_primary).toBe(false);
  });

  it("blanks empty alt text to null", () => {
    const out = parseProductMedia([row({ alt_text: "   " })]);
    expect(out[0]!.alt_text).toBeNull();
  });

  it("returns empty for no rows", () => {
    expect(parseProductMedia([])).toEqual([]);
  });
});
