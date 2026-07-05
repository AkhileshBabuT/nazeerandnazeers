"use client";

import { useActionState, useState } from "react";
import { setProductMedia } from "@/app/actions/product-media";
import type { ActionResult } from "@/app/actions/admin-guard";
import { parseProductMedia, type MediaRow } from "@/lib/admin/product-media";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ProductMediaRow = {
  id: string;
  url: string;
  alt_text: string | null;
  is_primary: boolean;
  sort_order: number;
};
type SaveState = { result: ActionResult<{ count: number }> } | null;

/**
 * Product media gallery editor (PRD 07-02). Rows of image URL + alt text, one
 * primary (radio — matches the DB's one-primary-per-product index), reorderable.
 * Replace-style save via `setProductMedia`. Mounted on the product editor for
 * existing pieces only (a media row needs a product id).
 */
export function ProductMediaEditor({
  productId,
  media,
}: {
  productId: string;
  media: ProductMediaRow[];
}) {
  const [rows, setRows] = useState<MediaRow[]>(() =>
    media.map((m) => ({
      url: m.url,
      alt_text: m.alt_text ?? "",
      is_primary: m.is_primary,
    })),
  );

  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async () => ({ result: await setProductMedia(productId, parseProductMedia(rows)) }),
    null,
  );
  const result = state?.result ?? null;
  const saved = result?.ok === true;
  const bannerError =
    result?.ok === false
      ? result.code === "unauthorized"
        ? "Not authorized — sign in as an admin."
        : result.code === "invalid"
          ? "Check the image rows."
          : result.message
      : null;

  const update = (i: number, patch: Partial<MediaRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setPrimary = (i: number) =>
    setRows((prev) => prev.map((r, j) => ({ ...r, is_primary: j === i })));
  const addRow = () =>
    setRows((prev) => [
      ...prev,
      { url: "", alt_text: "", is_primary: prev.length === 0 },
    ]);
  const removeRow = (i: number) =>
    setRows((prev) => prev.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) =>
    setRows((prev) => {
      const next = [...prev];
      const t = i + dir;
      if (t < 0 || t >= next.length) {
        return prev;
      }
      [next[i], next[t]] = [next[t]!, next[i]!];
      return next;
    });

  return (
    <form action={formAction} className="space-y-4">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          No images yet — add the first to start the gallery.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className="flex items-start gap-3 border p-3">
              <div className="flex-1 space-y-2">
                <input
                  type="url"
                  placeholder="Image URL"
                  value={r.url}
                  onChange={(e) => update(i, { url: e.target.value })}
                  className="w-full border-b bg-transparent py-1.5 outline-none transition-colors focus:border-gold"
                />
                <input
                  type="text"
                  placeholder="Alt text (accessibility)"
                  value={r.alt_text}
                  onChange={(e) => update(i, { alt_text: e.target.value })}
                  className="w-full border-b bg-transparent py-1.5 text-sm outline-none transition-colors focus:border-gold"
                />
                <label className="flex w-fit cursor-pointer items-center gap-2">
                  <input
                    type="radio"
                    name="primary-media"
                    checked={r.is_primary}
                    onChange={() => setPrimary(i)}
                    className="accent-gold"
                  />
                  <span className="eyebrow text-muted-foreground">Primary</span>
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <SmallButton
                  label="Move up"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  ↑
                </SmallButton>
                <SmallButton
                  label="Move down"
                  disabled={i === rows.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </SmallButton>
                <SmallButton label="Remove image" onClick={() => removeRow(i)}>
                  ✕
                </SmallButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={addRow}>
          Add image
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save gallery"}
        </Button>
        {saved && (
          <span className="eyebrow text-muted-foreground">Saved ✓</span>
        )}
      </div>

      {bannerError !== null && (
        <p className="border border-destructive px-4 py-3 text-destructive">
          {bannerError}
        </p>
      )}
    </form>
  );
}

function SmallButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-xs border text-foreground transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-30",
      )}
    >
      {children}
    </button>
  );
}
