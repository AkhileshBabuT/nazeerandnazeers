import { getProductReviews } from "@/lib/shop/data";
import { reviewSummary, starString } from "@/lib/reviews";
import { ReviewForm } from "./review-form";

/**
 * PDP reviews section (PRD 08). Server component: cached approved reviews +
 * summary, alongside the client write-a-review island. Surfaced full-width
 * below the product grid.
 */
export async function ProductReviews({ productId }: { productId: string }) {
  const reviews = await getProductReviews(productId);
  const summary = reviewSummary(reviews.map((r) => r.rating));

  return (
    <section className="border-t px-4 py-12 md:px-12">
      <div className="flex items-baseline justify-between border-b pb-3.5">
        <h2 className="font-display text-xl tracking-[-0.02em]">Reviews</h2>
        <span className="text-sm text-muted-foreground">
          {summary.count === 0 ? (
            "No reviews yet"
          ) : (
            <>
              <span className="text-gold">{starString(summary.average)}</span>{" "}
              <span className="ledger">{summary.average.toFixed(1)}</span> ·{" "}
              {summary.count} review{summary.count > 1 ? "s" : ""}
            </>
          )}
        </span>
      </div>

      <div className="mt-8 grid gap-10 md:grid-cols-[1fr_24rem]">
        <ul className="space-y-6">
          {reviews.length === 0 ? (
            <li className="text-muted-foreground">
              Be the first to review this piece.
            </li>
          ) : (
            reviews.map((r) => (
              <li key={r.id} className="border-b pb-6">
                <p className="flex items-center gap-2">
                  <span className="text-gold">{starString(r.rating)}</span>
                  {r.is_verified_purchase && (
                    <span className="eyebrow text-rate-up">
                      ✓ Verified purchase
                    </span>
                  )}
                </p>
                {r.title && <p className="mt-1 font-medium">{r.title}</p>}
                {r.body && (
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {r.body}
                  </p>
                )}
              </li>
            ))
          )}
        </ul>
        <ReviewForm productId={productId} />
      </div>
    </section>
  );
}
