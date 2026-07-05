/**
 * Pure normalization for the Product media editor (PRD 07-02). The island holds
 * raw rows; this drops blanks, assigns sort_order by position, and enforces the
 * "at most one primary" rule the DB also guards (partial unique index) — first
 * flagged primary wins; if none is flagged, the first row becomes primary.
 */

export interface MediaRow {
  url: string;
  alt_text: string;
  is_primary: boolean;
}

export interface NormalizedMedia {
  url: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
}

/** Editor rows → DB-ready items. Total function (blank-url rows are dropped). */
export function parseProductMedia(rows: MediaRow[]): NormalizedMedia[] {
  const cleaned = rows.filter((r) => r.url.trim() !== "");
  let primarySeen = false;
  const items = cleaned.map((r, i) => {
    let isPrimary = r.is_primary;
    if (isPrimary && primarySeen) {
      isPrimary = false; // collapse extra primaries — DB allows only one
    }
    if (isPrimary) {
      primarySeen = true;
    }
    return {
      url: r.url.trim(),
      alt_text: r.alt_text.trim() === "" ? null : r.alt_text.trim(),
      is_primary: isPrimary,
      sort_order: i,
    };
  });
  // None flagged but images exist → first is primary (gallery needs a hero).
  if (!primarySeen && items.length > 0) {
    items[0]!.is_primary = true;
  }
  return items;
}
