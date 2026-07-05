import { formatPaise } from "@/lib/format";
import { formatBps } from "@/lib/gst-display";

/**
 * The signature price-breakdown receipt (design contract §3.4) — shared by
 * product detail, cart, checkout, order detail, and the admin price preview.
 * Hairline-ruled rows, small-caps labels left, paise-exact DM Mono right;
 * 2px ink rule, then TOTAL with a thin gold underline. GST row labels read
 * bps from data, never hardcoded.
 */
export interface PriceReceiptProps {
  metalValuePaise: number;
  makingChargesPaise: number;
  gstMetalPaise: number;
  gstMakingPaise: number;
  totalPaise: number;
  gstMetalBps: number;
  gstMakingBps: number;
  /** Optional muted formula line under "Metal value", e.g. `7.350 g × ₹7,245.00/g × 22/24`. */
  metalFormula?: string;
  totalLabel?: string;
  /** When set, renders a sienna discount row and deducts from the displayed total. */
  couponDiscountPaise?: number;
  appliedCouponCode?: string;
}

function Row({
  label,
  sub,
  amount,
}: {
  label: string;
  sub?: string;
  amount: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-3">
      <div className="min-w-0">
        <span className="eyebrow text-muted-foreground">{label}</span>
        {sub !== undefined && (
          <span className="ledger mt-1 block text-xs text-muted-foreground/80">
            {sub}
          </span>
        )}
      </div>
      <span className="ledger shrink-0">{amount}</span>
    </div>
  );
}

export function PriceReceipt({
  metalValuePaise,
  makingChargesPaise,
  gstMetalPaise,
  gstMakingPaise,
  totalPaise,
  gstMetalBps,
  gstMakingBps,
  metalFormula,
  totalLabel = "Total",
  couponDiscountPaise,
  appliedCouponCode,
}: PriceReceiptProps) {
  const hasDiscount = couponDiscountPaise !== undefined && couponDiscountPaise > 0;
  const displayTotal = hasDiscount ? totalPaise - couponDiscountPaise : totalPaise;
  return (
    <div>
      <Row
        label="Metal value"
        sub={metalFormula}
        amount={formatPaise(metalValuePaise)}
      />
      <Row label="Making charges" amount={formatPaise(makingChargesPaise)} />
      <Row
        label={`GST on metal @ ${formatBps(gstMetalBps)}`}
        amount={formatPaise(gstMetalPaise)}
      />
      <Row
        label={`GST on making @ ${formatBps(gstMakingBps)}`}
        amount={formatPaise(gstMakingPaise)}
      />
      {hasDiscount && (
        <>
          <div className="flex items-baseline justify-between gap-4 border-b py-3">
            <span className="eyebrow text-hallmark">
              {appliedCouponCode ? `Discount (${appliedCouponCode})` : "Discount"}
            </span>
            <span className="ledger shrink-0 text-hallmark">
              −{formatPaise(couponDiscountPaise)}
            </span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground/70">
            GST computed on discounted subtotal at order confirmation
          </p>
        </>
      )}
      <div className="flex items-baseline justify-between gap-4 border-t-2 border-foreground py-3">
        <span className="eyebrow">{totalLabel}</span>
        <span className="ledger border-b border-gold pb-0.5 text-lg font-medium">
          {formatPaise(displayTotal)}
        </span>
      </div>
    </div>
  );
}

/** Dimension-matched skeleton — receipts must stream without layout shift. */
export function PriceReceiptSkeleton() {
  return (
    <div aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="flex items-baseline justify-between border-b py-3"
        >
          <span className="h-[11px] w-32 animate-pulse bg-secondary" />
          <span className="h-[15px] w-24 animate-pulse bg-secondary" />
        </div>
      ))}
      <div className="flex items-baseline justify-between border-t-2 border-foreground py-3">
        <span className="h-[11px] w-16 animate-pulse bg-secondary" />
        <span className="h-[22px] w-32 animate-pulse bg-secondary" />
      </div>
    </div>
  );
}
