/**
 * A2 product editor — pure form parsing + live price preview (PRD §5 A2).
 *
 * The preview imports the SAME pure `calculatePrice` + `gstDisplaySplit` the
 * storefront uses (ADR-0007: never stored, computed live). Clock-injected so
 * the stale-rate branch is unit-testable; the island passes `nowMs()`.
 */

import {
  calculatePrice,
  type MakingChargeType,
  type Material,
  type Price,
} from "@/lib/pricing";
import { gstDisplaySplit } from "@/lib/gst-display";
import type { PricingSettings } from "@/lib/pricing";
import type { ProductInput } from "@/lib/validators";
import { rateFreshness } from "@/lib/admin/dashboard";
import { percentToBps, rupeesToPaise } from "@/lib/admin/money-input";

/** Raw form state — strings exactly as typed; conversion happens here. */
export interface ProductFormValues {
  sku: string;
  name: string;
  description: string;
  material: Material;
  category_id: string;
  audience_id: string;
  weight_grams: string;
  purity_karat: string;
  making_charge_type: MakingChargeType;
  /** Rupees when flat; percent when percent. */
  making_charge_value: string;
  hallmark_huid: string;
  stock_quantity: string;
}

export type RateRow = {
  rate_per_gram_paise: number;
  effective_at: string;
} | null;

/** Discriminated preview states — the card renders each explicitly. */
export type PricePreview =
  | {
      status: "priced";
      price: Price;
      split: { gst_metal: number; gst_making: number };
      ratePaise: number;
      effectiveAt: string;
    }
  | { status: "rate_unavailable"; reason: "missing" | "stale" }
  | { status: "incomplete" };

/** Validated weight string for `calculatePrice`, or null. */
function parseWeight(raw: string): string | null {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,3})?$/.test(s) || Number(s) <= 0) {
    return null;
  }
  return s;
}

/** Whole karat 1–24, or null. */
function parsePurity(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) {
    return null;
  }
  const k = Number(s);
  return k >= 1 && k <= 24 ? k : null;
}

/** Making-charge value → integer paise (flat) / bps (percent), or null. */
function parseMakingValue(
  type: MakingChargeType,
  raw: string,
): number | null {
  return type === "flat" ? rupeesToPaise(raw) : percentToBps(raw);
}

/**
 * Live price preview from the form's current values against the current rate.
 * Mirrors `productInputSchema`'s gold-only rules: silver prices without
 * purity; gold without a valid karat stays `incomplete`. A missing/stale rate
 * (same ceiling comparison as `getCurrentRate`) is the em-dash variant —
 * never a wrong number (ADR-0010).
 */
export function previewPrice(
  values: ProductFormValues,
  rateRow: RateRow,
  maxRateAgeSeconds: number,
  settings: PricingSettings,
  nowMs: number,
): PricePreview {
  const freshness = rateFreshness(rateRow, maxRateAgeSeconds, nowMs);
  if (freshness.status !== "fresh") {
    return {
      status: "rate_unavailable",
      reason: freshness.status === "stale" ? "stale" : "missing",
    };
  }

  const weight = parseWeight(values.weight_grams);
  if (weight === null) {
    return { status: "incomplete" };
  }
  let purity: number | null = null;
  if (values.material === "gold") {
    purity = parsePurity(values.purity_karat);
    if (purity === null) {
      return { status: "incomplete" };
    }
  }
  const makingValue = parseMakingValue(
    values.making_charge_type,
    values.making_charge_value,
  );
  if (makingValue === null) {
    return { status: "incomplete" };
  }

  const price = calculatePrice(
    {
      material: values.material,
      weight_grams: weight,
      purity_karat: purity,
      making_charge_type: values.making_charge_type,
      making_charge_value: makingValue,
    },
    { material: values.material, rate_per_gram_paise: freshness.ratePaise },
    settings,
  );
  return {
    status: "priced",
    price,
    split: gstDisplaySplit(price, settings),
    ratePaise: freshness.ratePaise,
    effectiveAt: freshness.effectiveAt,
  };
}

export type ParseProductFormResult =
  | { ok: true; input: ProductInput }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * Form strings → `ProductInput` for `upsertProduct`. Only numeric conversion
 * is checked here (sub-paise rejected, never rounded); everything else —
 * sku/name presence, gold-requires-purity/HUID — stays with the server's zod
 * schema so its messages are canonical. Silver nulls purity/HUID.
 */
export function parseProductForm(
  values: ProductFormValues,
  isActive: boolean,
): ParseProductFormResult {
  const fieldErrors: Record<string, string[]> = {};

  const weight = parseWeight(values.weight_grams);
  if (weight === null) {
    fieldErrors.weight_grams = [
      "Weight must be a decimal with up to 3 decimals, greater than 0",
    ];
  }

  let purity: number | null = null;
  if (values.material === "gold" && values.purity_karat.trim() !== "") {
    purity = parsePurity(values.purity_karat);
    if (purity === null) {
      fieldErrors.purity_karat = ["Purity must be a whole karat from 1 to 24"];
    }
  }

  const makingValue = parseMakingValue(
    values.making_charge_type,
    values.making_charge_value,
  );
  if (makingValue === null) {
    fieldErrors.making_charge_value = [
      values.making_charge_type === "flat"
        ? "Enter rupees with at most 2 decimals — exact paise, never rounded"
        : "Enter a percentage with at most 2 decimals",
    ];
  }

  const stockRaw = values.stock_quantity.trim();
  const stock = /^\d+$/.test(stockRaw) ? Number(stockRaw) : null;
  if (stock === null) {
    fieldErrors.stock_quantity = ["Stock must be a whole number"];
  }

  const categoryId = values.category_id.trim();
  if (categoryId === "") {
    fieldErrors.category_id = ["Choose a category"];
  }
  const audienceId = values.audience_id.trim();
  if (audienceId === "") {
    fieldErrors.audience_id = ["Choose who it's for"];
  }

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors };
  }

  const gold = values.material === "gold";
  return {
    ok: true,
    input: {
      sku: values.sku.trim(),
      name: values.name.trim(),
      description:
        values.description.trim() === "" ? null : values.description.trim(),
      material: values.material,
      category_id: categoryId,
      audience_id: audienceId,
      weight_grams: weight as string,
      purity_karat: gold ? purity : null,
      making_charge_type: values.making_charge_type,
      making_charge_value: makingValue as number,
      hallmark_huid: gold
        ? values.hallmark_huid.trim() === ""
          ? null
          : values.hallmark_huid.trim()
        : null,
      stock_quantity: stock as number,
      is_active: isActive,
    },
  };
}
