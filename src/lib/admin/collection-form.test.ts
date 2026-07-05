import { describe, it, expect } from "vitest";
import {
  slugify,
  parseCollectionForm,
  type CollectionFormValues,
} from "./collection-form";

const blank: CollectionFormValues = {
  slug: "",
  display_name: "",
  description: "",
  hero_image: "",
  sort_order: "",
  meta_title: "",
  meta_description: "",
};

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Bridal Edit")).toBe("bridal-edit");
  });
  it("collapses runs of non-alphanumerics and trims edges", () => {
    expect(slugify("  Under ₹25,000!! ")).toBe("under-25-000");
  });
  it("is empty for input with no alphanumerics", () => {
    expect(slugify("—— ₹ ——")).toBe("");
  });
});

describe("parseCollectionForm", () => {
  it("derives the slug from the name when slug is blank", () => {
    const r = parseCollectionForm({ ...blank, display_name: "Best Sellers" }, true);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.slug).toBe("best-sellers");
      expect(r.input.display_name).toBe("Best Sellers");
      expect(r.input.sort_order).toBe(0);
      expect(r.input.is_active).toBe(true);
      expect(r.input.description).toBeNull();
    }
  });

  it("normalises a typed slug and carries is_active through", () => {
    const r = parseCollectionForm(
      { ...blank, display_name: "Bridal", slug: "Bridal Set", sort_order: "5" },
      false,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.slug).toBe("bridal-set");
      expect(r.input.sort_order).toBe(5);
      expect(r.input.is_active).toBe(false);
    }
  });

  it("requires a name", () => {
    const r = parseCollectionForm({ ...blank }, true);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.display_name).toBeDefined();
      expect(r.fieldErrors.slug).toBeDefined(); // empty name → empty slug
    }
  });

  it("rejects a non-numeric sort order", () => {
    const r = parseCollectionForm(
      { ...blank, display_name: "X", sort_order: "abc" },
      true,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.sort_order).toBeDefined();
    }
  });

  it("blanks optional text fields to null", () => {
    const r = parseCollectionForm(
      {
        ...blank,
        display_name: "Y",
        description: "  ",
        meta_title: "Title",
      },
      true,
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.input.description).toBeNull();
      expect(r.input.meta_title).toBe("Title");
    }
  });
});
