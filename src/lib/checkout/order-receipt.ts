/**
 * C6 snapshot receipt (PRD 04 C6) — PURE. Rebuild the PriceReceipt rows from
 * an Order's FROZEN snapshot columns (ADR-0003: a past Order is fully
 * reconstructable from its rows — no live rates, no `calculatePrice`).
 *
 * `order_items` stores per-unit `unit_price_paise` (metal value + making
 * charge) and `making_charges_paise`; the header stores one combined
 * `gst_paise`. The two GST display rows are recomputed per unit from the
 * header's frozen bps with the SAME half-up rounding `calculatePrice` used
 * (ADR-0011), then × quantity — so the rows always sum exactly to the stored
 * `gst_paise`, never a paisa off. Display-only; the stored header stays
 * authoritative.
 */

import { divRoundHalfUp } from "@/lib/pricing";

/** The snapshot columns of one `order_items` row this receipt needs. */
export interface SnapshotReceiptItem {
  unit_price_paise: number;
  making_charges_paise: number;
  quantity: number;
}

/** The frozen GST bps from the `orders` header (ADR-0005). */
export interface SnapshotReceiptBps {
  gst_metal_bps: number;
  gst_making_bps: number;
}

/** The four receipt rows above TOTAL, all integer paise. */
export interface SnapshotReceipt {
  metalValuePaise: number;
  makingChargesPaise: number;
  gstMetalPaise: number;
  gstMakingPaise: number;
}

const BPS_DEN = BigInt(10000);

/** Per-unit GST share: round-half-up(base × bps / 10000), same as pricing. */
function gstShare(basePaise: number, bps: number): number {
  return Number(divRoundHalfUp(BigInt(basePaise) * BigInt(bps), BPS_DEN));
}

/** Sum the receipt rows over the Order's frozen line items. */
export function snapshotReceipt(
  items: readonly SnapshotReceiptItem[],
  bps: SnapshotReceiptBps,
): SnapshotReceipt {
  let metal = 0;
  let making = 0;
  let gstMetal = 0;
  let gstMaking = 0;
  for (const item of items) {
    const unitMaking = item.making_charges_paise;
    const unitMetal = item.unit_price_paise - unitMaking;
    const q = item.quantity;
    metal += unitMetal * q;
    making += unitMaking * q;
    gstMetal += gstShare(unitMetal, bps.gst_metal_bps) * q;
    gstMaking += gstShare(unitMaking, bps.gst_making_bps) * q;
  }
  return {
    metalValuePaise: metal,
    makingChargesPaise: making,
    gstMetalPaise: gstMetal,
    gstMakingPaise: gstMaking,
  };
}
