"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setReviewApproved } from "@/app/actions/reviews";
import { starString } from "@/lib/reviews";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Review = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  is_approved: boolean;
  products: { name: string; sku: string } | null;
};

/** One review row in the admin moderation list — approve / unapprove. */
export function ReviewModerationRow({ review }: { review: Review }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = () =>
    startTransition(async () => {
      const res = await setReviewApproved(review.id, !review.is_approved);
      if (res.ok) {
        router.refresh();
      }
    });

  return (
    <li className="border p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2">
            <span className="text-gold">{starString(review.rating)}</span>
            <span
              className={cn(
                "eyebrow rounded-xs border px-2 py-0.5",
                review.is_approved
                  ? "border-foreground/40"
                  : "border-hallmark text-hallmark",
              )}
            >
              {review.is_approved ? "Approved" : "Pending"}
            </span>
          </p>
          {review.products && (
            <p className="ledger mt-1 text-xs text-muted-foreground">
              {review.products.sku} · {review.products.name}
            </p>
          )}
          {review.title && <p className="mt-2 font-medium">{review.title}</p>}
          {review.body && (
            <p className="mt-1 text-sm text-muted-foreground">{review.body}</p>
          )}
        </div>
        <Button
          type="button"
          variant={review.is_approved ? "outline" : "primary"}
          disabled={pending}
          onClick={toggle}
        >
          {review.is_approved ? "Unapprove" : "Approve"}
        </Button>
      </div>
    </li>
  );
}
