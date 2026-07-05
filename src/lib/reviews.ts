/**
 * Pure review aggregation helpers (PRD 08). No IO — fed the approved ratings by
 * the read model; unit-tested in reviews.test.ts.
 */

/** Count + average (rounded to 1 dp) over a set of ratings. */
export function reviewSummary(ratings: number[]): {
  count: number;
  average: number;
} {
  const count = ratings.length;
  if (count === 0) {
    return { count: 0, average: 0 };
  }
  const sum = ratings.reduce((a, b) => a + b, 0);
  return { count, average: Math.round((sum / count) * 10) / 10 };
}

/** Five-glyph star string for a rating (rounded to the nearest whole star). */
export function starString(rating: number): string {
  const filled = Math.max(0, Math.min(5, Math.round(rating)));
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}
