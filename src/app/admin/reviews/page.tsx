import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { ReviewModerationRow } from "@/components/admin/review-moderation-row";

export const metadata = { title: "Reviews · Admin" };

/**
 * Admin review moderation `/admin/reviews` (PRD 08). Admin RLS sees all reviews;
 * pending first. Approve/unapprove flips `is_approved` and revalidates the
 * public reviews cache.
 */
export default function AdminReviewsPage() {
  return (
    <div className="space-y-6">
      <h1 className="eyebrow text-muted-foreground">Reviews</h1>
      <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
        <ReviewsList />
      </Suspense>
    </div>
  );
}

async function ReviewsList() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reviews")
    .select("id, rating, title, body, is_approved, products(name, sku)")
    .order("is_approved", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    throw error;
  }
  const reviews = data;

  if (reviews.length === 0) {
    return <p className="text-muted-foreground">No reviews yet.</p>;
  }
  return (
    <ul className="space-y-3">
      {reviews.map((r) => (
        <ReviewModerationRow key={r.id} review={r} />
      ))}
    </ul>
  );
}
