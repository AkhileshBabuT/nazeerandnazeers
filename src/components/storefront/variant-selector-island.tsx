"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { VariantSelector, type SelectedDimensions } from "./variant-selector";
import type { Database } from "@/lib/supabase/database.types";

type VariantRow = Database["public"]["Tables"]["product_variant"]["Row"];

/**
 * Client island that wraps VariantSelector and drives variant selection via
 * a `variant` search param (PRD 07-04 / 07-05).
 *
 * Multi-dimension state (size + purity) is maintained locally. A resolved
 * variant id is pushed to `?variant=<id>` when all required dimensions are
 * selected. Partial selections (one axis clicked, the other not yet chosen)
 * update local state only — no URL change until resolution is complete.
 */
export function VariantSelectorIsland({
  variants,
  selectedId,
}: {
  variants: VariantRow[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Derive which dimensions the variants array actually uses.
  const hasSizes = useMemo(
    () => variants.some((v) => v.size_label != null),
    [variants],
  );
  const hasPurities = useMemo(
    () => variants.some((v) => v.purity_karat != null),
    [variants],
  );
  const hasTones = useMemo(
    () => variants.some((v) => v.metal_tone != null),
    [variants],
  );

  // Derive initial dimensions from the pre-selected variant (from URL).
  const initialSelected = useMemo<SelectedDimensions>(() => {
    const preset = variants.find((v) => v.id === selectedId);
    return {
      sizeLabel: preset?.size_label ?? null,
      purityKarat: preset?.purity_karat ?? null,
      metalTone: preset?.metal_tone ?? null,
    };
  }, [variants, selectedId]);

  const [selected, setSelected] = useState<SelectedDimensions>(initialSelected);

  /**
   * Attempt to resolve a variant from the given dimensions.
   * Returns null when not all required dimensions are chosen.
   */
  const resolveVariantId = useCallback(
    (dims: SelectedDimensions): string | null => {
      if (hasSizes && dims.sizeLabel === null) return null;
      if (hasPurities && dims.purityKarat === null) return null;
      if (hasTones && dims.metalTone === null) return null;
      const match = variants.find(
        (v) =>
          (!hasSizes || v.size_label === dims.sizeLabel) &&
          (!hasPurities || v.purity_karat === dims.purityKarat) &&
          (!hasTones || v.metal_tone === dims.metalTone),
      );
      return match?.id ?? null;
    },
    [variants, hasSizes, hasPurities, hasTones],
  );

  const handleChange = useCallback(
    (dims: SelectedDimensions) => {
      setSelected(dims);
      const variantId = resolveVariantId(dims);
      if (variantId != null) {
        const params = new URLSearchParams(searchParams.toString());
        params.set("variant", variantId);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      }
    },
    [resolveVariantId, router, pathname, searchParams],
  );

  return (
    <VariantSelector
      variants={variants}
      selected={selected}
      onChange={handleChange}
    />
  );
}
