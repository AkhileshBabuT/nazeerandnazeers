"use client";

import type { Database } from "@/lib/supabase/database.types";

type VariantRow = Database["public"]["Tables"]["product_variant"]["Row"];

export interface SelectedDimensions {
  sizeLabel: string | null;
  purityKarat: number | null;
  metalTone: string | null;
}

/**
 * Multi-dimension variant selector (PRD 07-05): shows a Size axis and/or a
 * Purity axis based on which dimensions are present in the variants array.
 * OOS combinations (stock_quantity === 0) are rendered disabled.
 * Calls `onChange` with the updated SelectedDimensions on each click.
 */
export function VariantSelector({
  variants,
  selected,
  onChange,
}: {
  variants: VariantRow[];
  selected: SelectedDimensions;
  onChange: (dims: SelectedDimensions) => void;
}) {
  if (variants.length === 0) return null;

  // Extract distinct dimension values.
  const sizes = [
    ...new Set(
      variants
        .filter((v) => v.size_label != null)
        .map((v) => v.size_label as string),
    ),
  ];
  const purities = [
    ...new Set(
      variants
        .filter((v) => v.purity_karat != null)
        .map((v) => v.purity_karat as number),
    ),
  ].sort((a, b) => a - b);
  const tones = [
    ...new Set(
      variants
        .filter((v) => v.metal_tone != null)
        .map((v) => v.metal_tone as string),
    ),
  ];

  const hasSizes = sizes.length > 0;
  const hasPurities = purities.length > 0;
  const hasTones = tones.length > 0;

  /**
   * Is a given size option available given the currently selected purity/tone?
   * Disabled only when ALL variants matching this size×selected-purity×selected-tone are OOS.
   */
  function isSizeAvailable(size: string): boolean {
    const candidates = variants.filter(
      (v) =>
        v.size_label === size &&
        (!hasPurities || selected.purityKarat === null || v.purity_karat === selected.purityKarat) &&
        (!hasTones || selected.metalTone === null || v.metal_tone === selected.metalTone),
    );
    return candidates.some((v) => v.stock_quantity > 0);
  }

  function isPurityAvailable(purity: number): boolean {
    const candidates = variants.filter(
      (v) =>
        v.purity_karat === purity &&
        (!hasSizes || selected.sizeLabel === null || v.size_label === selected.sizeLabel) &&
        (!hasTones || selected.metalTone === null || v.metal_tone === selected.metalTone),
    );
    return candidates.some((v) => v.stock_quantity > 0);
  }

  function isToneAvailable(tone: string): boolean {
    const candidates = variants.filter(
      (v) =>
        v.metal_tone === tone &&
        (!hasSizes || selected.sizeLabel === null || v.size_label === selected.sizeLabel) &&
        (!hasPurities || selected.purityKarat === null || v.purity_karat === selected.purityKarat),
    );
    return candidates.some((v) => v.stock_quantity > 0);
  }

  return (
    <div className="mt-4 space-y-4">
      {hasSizes && (
        <div>
          <p className="eyebrow text-muted-foreground">Size</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {sizes.map((size) => {
              const isSelected = selected.sizeLabel === size;
              const available = isSizeAvailable(size);
              return (
                <button
                  key={size}
                  type="button"
                  onClick={() => onChange({ ...selected, sizeLabel: size })}
                  disabled={!available}
                  className={[
                    "border px-3 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "border-gold bg-gold/10 text-gold"
                      : available
                        ? "border-border hover:border-gold hover:text-gold"
                        : "cursor-not-allowed border-border opacity-40 line-through",
                  ].join(" ")}
                  aria-pressed={isSelected}
                  aria-disabled={!available}
                >
                  {size}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasPurities && (
        <div>
          <p className="eyebrow text-muted-foreground">
            {purities.length === 1 ? "Purity" : "Select purity"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {purities.map((purity) => {
              const isSelected = selected.purityKarat === purity;
              const available = isPurityAvailable(purity);
              return (
                <button
                  key={purity}
                  type="button"
                  onClick={() => onChange({ ...selected, purityKarat: purity })}
                  disabled={!available}
                  className={[
                    "border px-3 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "border-gold bg-gold/10 text-gold"
                      : available
                        ? "border-border hover:border-gold hover:text-gold"
                        : "cursor-not-allowed border-border opacity-40 line-through",
                  ].join(" ")}
                  aria-pressed={isSelected}
                  aria-disabled={!available}
                >
                  {purity}k
                </button>
              );
            })}
          </div>
        </div>
      )}

      {hasTones && (
        <div>
          <p className="eyebrow text-muted-foreground">Metal tone</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {tones.map((tone) => {
              const isSelected = selected.metalTone === tone;
              const available = isToneAvailable(tone);
              return (
                <button
                  key={tone}
                  type="button"
                  onClick={() => onChange({ ...selected, metalTone: tone })}
                  disabled={!available}
                  className={[
                    "border px-3 py-1.5 text-sm transition-colors",
                    isSelected
                      ? "border-gold bg-gold/10 text-gold"
                      : available
                        ? "border-border hover:border-gold hover:text-gold"
                        : "cursor-not-allowed border-border opacity-40 line-through",
                  ].join(" ")}
                  aria-pressed={isSelected}
                  aria-disabled={!available}
                >
                  {tone.charAt(0).toUpperCase() + tone.slice(1)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* No-dimension fallback: single pill */}
      {!hasSizes && !hasPurities && !hasTones && variants.length === 1 && (
        <div>
          <p className="eyebrow text-muted-foreground">Variant</p>
          <span className="mt-2 inline-block border border-foreground px-3 py-1.5 text-sm">
            {variants[0]!.sku}
          </span>
        </div>
      )}
    </div>
  );
}
