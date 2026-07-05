import type { PricingProduct } from "../pricing";

/** The DB shape of a product_variant row (pricing-input fields only). */
export interface ProductVariant {
  id: string;
  product_id: string;
  sku: string;
  size_label: string | null;
  metal_tone: string | null;
  /** numeric from DB comes as string via some drivers, or number via Supabase JS */
  weight_grams: string | number;
  purity_karat: number | null;
  making_charge_type: "flat" | "percent";
  making_charge_value: number;
  stock_quantity: number;
  hallmark_huid: string | null;
  is_active: boolean;
}

/** The dimensions a customer selects when choosing a variant. */
export interface SelectedOptions {
  purity_karat?: number | null;
  size_label?: string | null;
  metal_tone?: string | null;
}

/**
 * Find the active variant matching the selected dimensions. Returns null when:
 * - no variants exist for the product (caller should use product base inputs)
 * - no variant matches the selection
 */
export function resolveVariant(
  variants: ProductVariant[],
  selected: SelectedOptions,
): ProductVariant | null {
  const active = variants.filter((v) => v.is_active);
  if (active.length === 0) return null;

  return (
    active.find((v) => {
      const pk = selected.purity_karat ?? null;
      const sl = selected.size_label ?? null;
      const mt = selected.metal_tone ?? null;
      return v.purity_karat === pk && v.size_label === sl && v.metal_tone === mt;
    }) ?? null
  );
}

/**
 * Extract the PricingProduct inputs from a resolved variant.
 * material is inherited from the parent product.
 */
export function variantPricingInputs(
  variant: ProductVariant,
  material: "gold" | "silver",
): PricingProduct {
  return {
    material,
    weight_grams: String(variant.weight_grams),
    purity_karat: variant.purity_karat,
    making_charge_type: variant.making_charge_type,
    making_charge_value: variant.making_charge_value,
  };
}
