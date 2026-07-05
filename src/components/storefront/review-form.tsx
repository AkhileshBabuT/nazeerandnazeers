"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  upsertReview,
  deleteReview,
  getMyReview,
} from "@/app/actions/reviews";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Write-a-review island (PRD 08). Fetches the caller's own review on mount (so
 * it never forces the PDP dynamic), submits via the owner-scoped action. New /
 * edited reviews are pending moderation until an admin approves them.
 */
export function ReviewForm({ productId }: { productId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loaded, setLoaded] = useState(false);
  const [needAuth, setNeedAuth] = useState(false);
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [existing, setExisting] = useState<{ is_approved: boolean } | null>(
    null,
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getMyReview(productId).then((r) => {
      if (!alive) return;
      if (r) {
        setExisting({ is_approved: r.is_approved });
        setRating(r.rating);
        setTitle(r.title ?? "");
        setBody(r.body ?? "");
      }
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  const submit = () =>
    startTransition(async () => {
      setBanner(null);
      setFieldErrors({});
      setDone(false);
      if (rating < 1) {
        setFieldErrors({ rating: ["Choose a star rating"] });
        return;
      }
      const res = await upsertReview(productId, {
        rating,
        title: title.trim() || null,
        body: body.trim() || null,
      });
      if (res.ok) {
        setExisting({ is_approved: false });
        setDone(true);
        router.refresh();
      } else if (res.code === "unauthorized") {
        setNeedAuth(true);
      } else if (res.code === "invalid") {
        setFieldErrors(res.fieldErrors);
      } else {
        setBanner(res.message);
      }
    });

  const remove = () =>
    startTransition(async () => {
      const res = await deleteReview(productId);
      if (res.ok) {
        setExisting(null);
        setRating(0);
        setTitle("");
        setBody("");
        setDone(false);
        router.refresh();
      } else {
        setBanner("Could not delete review.");
      }
    });

  if (!loaded) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (needAuth) {
    return (
      <a
        href={`/login?next=${encodeURIComponent(pathname)}`}
        className="eyebrow border-b border-foreground pb-1 transition-colors hover:border-gold hover:text-gold"
      >
        Sign in to write a review
      </a>
    );
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="eyebrow text-muted-foreground">
        {existing ? "Your review" : "Write a review"}
      </p>
      {existing && (
        <p className="text-sm text-muted-foreground">
          {existing.is_approved
            ? "Published."
            : "Pending moderation — visible once approved."}
        </p>
      )}
      <StarInput value={rating} onChange={setRating} />
      {fieldErrors.rating && (
        <p className="text-xs text-destructive">{fieldErrors.rating[0]}</p>
      )}
      <input
        type="text"
        placeholder="Title (optional)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full border-b bg-transparent py-1.5 outline-none transition-colors focus:border-gold"
      />
      <textarea
        rows={3}
        placeholder="Share your thoughts (optional)"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        className="w-full resize-y border-b bg-transparent py-1.5 outline-none transition-colors focus:border-gold"
      />
      {banner && (
        <p className="border border-destructive px-3 py-2 text-destructive">
          {banner}
        </p>
      )}
      {done && (
        <p className="eyebrow text-muted-foreground">
          Thanks — your review is pending moderation.
        </p>
      )}
      <div className="flex gap-3">
        <Button type="button" disabled={pending} onClick={submit}>
          {pending
            ? "Saving…"
            : existing
              ? "Update review"
              : "Submit review"}
        </Button>
        {existing && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={remove}
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}

function StarInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => onChange(n)}
          className={cn(
            "cursor-pointer text-2xl leading-none transition-colors",
            n <= value ? "text-gold" : "text-foreground/25 hover:text-gold",
          )}
        >
          {n <= value ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}
