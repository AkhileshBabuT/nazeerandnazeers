/**
 * Order snapshot builder (ADR-0003/0005) — pure, no I/O.
 *
 * This is where the price becomes real and frozen. Given the Cart's lines (each
 * carrying the Product's pricing inputs + the per-piece HUID), the live Metal
 * Rates, and the GST settings, it produces the exact rows to write:
 *   - one `order_items` row per line, with `unit_price_paise` (pre-tax: metal
 *     value + making charge), `making_charges_paise`, weight/purity/sku/name and
 *     the per-piece `hallmark_huid_snapshot` (CONTEXT "Hallmark / HUID");
 *   - the `orders` header totals (`subtotal_paise`, `making_charges_paise`,
 *     `gst_paise`, `total_paise`) summed over the lines, plus the rate snapshots
 *     and the GST bps it computed with (ADR-0005).
 *
 * After this runs there is ZERO read-time dependency on `metal_rates` or
 * `lib/pricing.ts`: a past Order is fully reconstructable from these columns
 * alone (ADR-0003). The four header money fields re-sum to `total_paise` because
 * the pricing rounds per unit then we multiply by quantity (ADR-0011), so the
 * stored parts and total never drift.
 *
 * The maths is delegated to `calculatePrice` (the single pricing source of
 * truth), so the snapshot can never disagree with what the Cart displayed.
 */

import {
  calculatePrice,
  type Material,
  type MakingChargeType,
  type PricingProduct,
  type PricingRate,
  type PricingSettings,
} from "../pricing";

/** One Cart line ready to snapshot: Product inputs + per-piece HUID + quantity. */
export interface SnapshotLineInput {
  product_id: string;
  /** Present when the line is for a specific Variant (ADR-0015). */
  variant_id?: string | null;
  sku: string;
  name: string;
  material: Material;
  /** Decimal grams as a string, mirroring the numeric column (no float path). */
  weight_grams: string;
  purity_karat: number | null;
  /** The per-piece HUID frozen onto the order item (CONTEXT). */
  hallmark_huid: string | null;
  making_charge_type: MakingChargeType;
  making_charge_value: number;
  quantity: number;
  /** Variant cosmetic/label snapshots (ADR-0015). */
  size_label?: string | null;
  metal_tone?: string | null;
}

/** A frozen `order_items` row (snapshot columns only; ids assigned by the DB). */
export interface OrderItemSnapshot {
  product_id: string;
  /** Present when the line is for a specific Variant (ADR-0015). */
  variant_id?: string | null;
  sku_snapshot: string;
  name_snapshot: string;
  material: Material;
  weight_grams: string;
  purity_karat: number | null;
  hallmark_huid_snapshot: string | null;
  /** Pre-tax per-unit price = metal value + making charge (ADR-0003). */
  unit_price_paise: number;
  making_charges_paise: number;
  quantity: number;
  /** Variant cosmetic/label snapshots (ADR-0015). */
  size_label_snapshot?: string | null;
  metal_tone_snapshot?: string | null;
}

/** The frozen `orders` header (snapshot columns; numbering/ids by the DB). */
export interface OrderHeaderSnapshot {
  gold_rate_snapshot_paise: number | null;
  silver_rate_snapshot_paise: number | null;
  gst_metal_bps: number;
  gst_making_bps: number;
  subtotal_paise: number;
  making_charges_paise: number;
  gst_paise: number;
  total_paise: number;
}

/** The complete snapshot: the header + its line items. */
export interface OrderSnapshot {
  order: OrderHeaderSnapshot;
  items: OrderItemSnapshot[];
}

/**
 * Build the immutable Order snapshot from priced Cart lines. `rates` maps a
 * material to its live `PricingRate`; a line whose material is absent throws —
 * checkout must never snapshot a fabricated rate (ADR-0010, fail loudly).
 */
export function buildOrderSnapshot(
  lines: readonly SnapshotLineInput[],
  rates: ReadonlyMap<Material, PricingRate>,
  settings: PricingSettings,
): OrderSnapshot {
  const items: OrderItemSnapshot[] = [];

  let subtotal = 0;
  let makingCharges = 0;
  let gst = 0;
  let total = 0;
  let goldRate: number | null = null;
  let silverRate: number | null = null;

  for (const line of lines) {
    const rate = rates.get(line.material);
    if (!rate) {
      throw new Error(
        `buildOrderSnapshot: no rate for material "${line.material}".`,
      );
    }

    // Record the rate snapshot for the materials actually present (ADR-0003).
    if (line.material === "gold") {
      goldRate = rate.rate_per_gram_paise;
    } else {
      silverRate = rate.rate_per_gram_paise;
    }

    const product: PricingProduct = {
      material: line.material,
      weight_grams: line.weight_grams,
      purity_karat: line.purity_karat,
      making_charge_type: line.making_charge_type,
      making_charge_value: line.making_charge_value,
    };
    // Per-unit components, rounded per unit (ADR-0011) — the single source of
    // truth, so the snapshot agrees with the Cart view exactly.
    const unit = calculatePrice(product, rate, settings);

    const q = line.quantity;

    items.push({
      product_id: line.product_id,
      variant_id: line.variant_id ?? null,
      sku_snapshot: line.sku,
      name_snapshot: line.name,
      material: line.material,
      weight_grams: line.weight_grams,
      purity_karat: line.purity_karat,
      hallmark_huid_snapshot: line.hallmark_huid,
      // Pre-tax per-unit price = metal value + making charge (ADR-0003).
      unit_price_paise: unit.metal_value + unit.making_charges,
      making_charges_paise: unit.making_charges,
      quantity: q,
      size_label_snapshot: line.size_label ?? null,
      metal_tone_snapshot: line.metal_tone ?? null,
    });

    // Accumulate the header money fields from the disjoint per-unit components
    // (round per unit, then multiply by quantity — ADR-0011).
    makingCharges += unit.making_charges * q;
    gst += unit.gst * q;
    total += unit.total * q;
  }

  // `subtotal_paise` is the pre-tax sum (metal value + making charge across all
  // lines) = total - gst. Recompute it from the disjoint pieces so the four
  // header fields are exactly self-consistent (subtotal + gst = total).
  subtotal = total - gst;

  return {
    order: {
      gold_rate_snapshot_paise: goldRate,
      silver_rate_snapshot_paise: silverRate,
      gst_metal_bps: settings.gst_metal_bps,
      gst_making_bps: settings.gst_making_bps,
      subtotal_paise: subtotal,
      making_charges_paise: makingCharges,
      gst_paise: gst,
      total_paise: total,
    },
    items,
  };
}
