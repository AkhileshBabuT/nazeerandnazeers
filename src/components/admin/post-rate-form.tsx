"use client";

import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { postMetalRate, type ActionResult } from "@/app/actions/catalog";
import type { Material } from "@/lib/pricing";
import { isBackdated, parseRateInput } from "@/lib/admin/rates";
import { formatTimeIST } from "@/lib/format";
import { UnderlineField } from "@/components/auth/underline-field";
import { Button } from "@/components/ui/button";

type PostState =
  | { kind: "rejected"; message: string }
  | {
      kind: "result";
      result: ActionResult<{ id: string; effective_at: string }>;
      /** The card's latest effective_at when this post fired — the backdated
       * comparison must use what was newest BEFORE our row landed. */
      latestAtPost: string | null;
    }
  | null;

/**
 * A3 inline POST NEW RATE form (PRD 06 §5 A3): rupees-per-gram underline
 * input converted to integer paise CLIENT-SIDE with the exactness guard
 * (sub-paise rejected, never rounded), optional source, charcoal POST button
 * over the append-only `postMetalRate` action. Success refreshes the page so
 * the card + history pick up the new row.
 */
export function PostRateForm({
  material,
  latestEffectiveAt,
}: {
  material: Material;
  latestEffectiveAt: string | null;
}) {
  const router = useRouter();
  const [rupees, setRupees] = useState("");
  const [source, setSource] = useState("");

  const [state, formAction, pending] = useActionState<PostState, FormData>(
    async () => {
      const parsed = parseRateInput(rupees);
      if (!parsed.ok) {
        return { kind: "rejected", message: parsed.error };
      }
      const trimmedSource = source.trim();
      const result = await postMetalRate({
        material,
        rate_per_gram_paise: parsed.ratePerGramPaise,
        ...(trimmedSource !== "" ? { source: trimmedSource } : {}),
      });
      if (result.ok) {
        // Clear the form and pull the new row into the card + history.
        setRupees("");
        setSource("");
        router.refresh();
      }
      return { kind: "result", result, latestAtPost: latestEffectiveAt };
    },
    null,
  );

  const posted =
    state?.kind === "result" && state.result.ok ? state.result.data : null;

  // Rate-input problems sit under the field; anything else is a banner line.
  const rateError =
    state?.kind === "rejected"
      ? state.message
      : state?.kind === "result" &&
          !state.result.ok &&
          state.result.code === "invalid"
        ? (state.result.fieldErrors.rate_per_gram_paise?.[0] ??
          "Invalid rate input.")
        : undefined;
  const bannerError =
    state?.kind === "result" &&
    !state.result.ok &&
    state.result.code !== "invalid"
      ? state.result.code === "unauthorized"
        ? "Not authorized — sign in as an admin."
        : state.result.message
      : null;
  const historical =
    posted !== null &&
    state?.kind === "result" &&
    state.latestAtPost !== null &&
    isBackdated(posted.effective_at, state.latestAtPost)
      ? state.latestAtPost
      : null;

  return (
    <form action={formAction} className="space-y-4">
      <UnderlineField
        label="Rate (₹ per gram)"
        inputMode="decimal"
        placeholder={material === "gold" ? "7245.00" : "92.40"}
        value={rupees}
        onChange={(e) => setRupees(e.target.value)}
        error={rateError}
      />
      <UnderlineField
        label="Source · Optional"
        placeholder="MCX open"
        value={source}
        onChange={(e) => setSource(e.target.value)}
      />
      {bannerError !== null && (
        <p className="text-xs text-destructive">{bannerError}</p>
      )}
      {posted !== null &&
        (historical !== null ? (
          <p className="text-xs text-hallmark">
            This rate is historical — the newer {formatTimeIST(historical)} row
            stays live.
          </p>
        ) : (
          <p className="text-xs text-rate-up">
            Storefront prices now follow this rate · live in ≤5 minutes.
          </p>
        ))}
      <Button type="submit" disabled={pending}>
        {pending ? "Posting…" : "Post"}
      </Button>
    </form>
  );
}
