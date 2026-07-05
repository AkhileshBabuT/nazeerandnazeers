/**
 * Pure parsing for the Product gemstone editor (PRD 07-07). Fully-empty rows are
 * dropped; a partially-filled row requires a stone type; carat is validated as a
 * decimal (it is the STONE carat, never the metal's purity karat).
 */

import type { GemstoneItemInput } from "@/lib/validators";

export interface GemstoneRow {
  gem_type: string;
  carat_weight: string;
  cut: string;
  color: string;
  clarity: string;
  lab: string;
  certificate_number: string;
  laser_inscription: string;
}

export type ParseGemstonesResult =
  | { ok: true; items: GemstoneItemInput[] }
  | { ok: false; fieldErrors: Record<string, string[]> };

const FIELDS: (keyof GemstoneRow)[] = [
  "gem_type",
  "carat_weight",
  "cut",
  "color",
  "clarity",
  "lab",
  "certificate_number",
  "laser_inscription",
];

export function parseProductGemstones(
  rows: GemstoneRow[],
): ParseGemstonesResult {
  const fieldErrors: Record<string, string[]> = {};
  const items: GemstoneItemInput[] = [];
  const blankNull = (s: string): string | null =>
    s.trim() === "" ? null : s.trim();

  rows.forEach((r, i) => {
    // Drop a fully-empty row entirely (admin left a spare row blank).
    if (FIELDS.every((f) => r[f].trim() === "")) {
      return;
    }
    if (r.gem_type.trim() === "") {
      fieldErrors[`${i}.gem_type`] = ["Stone type is required"];
    }
    let carat: number | null = null;
    const cw = r.carat_weight.trim();
    if (cw !== "") {
      if (!/^\d+(\.\d{1,3})?$/.test(cw) || Number(cw) < 0) {
        fieldErrors[`${i}.carat_weight`] = [
          "Carat must be a number with up to 3 decimals",
        ];
      } else {
        carat = Number(cw);
      }
    }
    items.push({
      gem_type: r.gem_type.trim(),
      carat_weight: carat,
      cut: blankNull(r.cut),
      color: blankNull(r.color),
      clarity: blankNull(r.clarity),
      lab: blankNull(r.lab),
      certificate_number: blankNull(r.certificate_number),
      laser_inscription: blankNull(r.laser_inscription),
    });
  });

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }
  return { ok: true, items };
}
