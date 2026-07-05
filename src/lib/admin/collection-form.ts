/**
 * Pure form parsing for the Collection editor (PRD 07-01). Mirrors the
 * `product-preview` split: the island holds raw strings, this converts +
 * validates the numeric/slug bits; the server's zod schema stays canonical for
 * the rest. No pricing here — Collections carry no price (ADR-0007).
 */

import type { CollectionInput } from "@/lib/validators";

/** Display name → kebab-case slug (lowercase, non-alphanumerics → single "-"). */
export function slugify(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Raw form state — strings exactly as typed; conversion happens here. */
export interface CollectionFormValues {
  slug: string;
  display_name: string;
  description: string;
  hero_image: string;
  sort_order: string;
  meta_title: string;
  meta_description: string;
}

export type ParseCollectionFormResult =
  | { ok: true; input: CollectionInput }
  | { ok: false; fieldErrors: Record<string, string[]> };

/** Form strings → `CollectionInput`. Slug derives from the name when blank. */
export function parseCollectionForm(
  values: CollectionFormValues,
  isActive: boolean,
): ParseCollectionFormResult {
  const fieldErrors: Record<string, string[]> = {};

  const name = values.display_name.trim();
  if (name === "") {
    fieldErrors.display_name = ["Name is required"];
  }

  // Typed slug wins; otherwise derive from the name. Normalise either way.
  const slug = slugify(values.slug.trim() === "" ? name : values.slug);
  if (slug === "") {
    fieldErrors.slug = ["Slug is required"];
  }

  const sortRaw = values.sort_order.trim();
  const sort = sortRaw === "" ? 0 : /^\d+$/.test(sortRaw) ? Number(sortRaw) : null;
  if (sort === null) {
    fieldErrors.sort_order = ["Sort order must be a whole number"];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const blankNull = (s: string): string | null =>
    s.trim() === "" ? null : s.trim();

  return {
    ok: true,
    input: {
      slug,
      display_name: name,
      description: blankNull(values.description),
      hero_image: blankNull(values.hero_image),
      sort_order: sort as number,
      is_active: isActive,
      meta_title: blankNull(values.meta_title),
      meta_description: blankNull(values.meta_description),
    },
  };
}
