"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  createOrderFromCart,
  type CheckoutActionResult,
} from "@/app/actions/checkout";
import { verifyCoupon } from "@/app/actions/coupons";
import { createClient } from "@/lib/supabase/client";
import {
  checkoutInputFromForm,
  mapCheckoutState,
  type CheckoutUiState,
} from "@/lib/checkout/form";
import { formatPaise } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { UnderlineField } from "@/components/auth/underline-field";
import {
  ShippingSelector,
  type ShippingOption,
} from "@/components/checkout/shipping-selector";
import {
  PriceReceipt,
  type PriceReceiptProps,
} from "@/components/storefront/price-receipt";

type ReceiptData = Omit<PriceReceiptProps, "couponDiscountPaise" | "appliedCouponCode">;

/**
 * C5 checkout island: address form + shipping + coupon + summary over
 * `createOrderFromCart` via `useActionState`. All branch logic is the pure
 * `mapCheckoutState` (src/lib/checkout/form.ts) — this component is wiring
 * + markup only.
 *
 * `seenTotalPaise` is the server-rendered cart base total (ADR-0002).
 * The island manages shipping and coupon adjustments; the final
 * `seen_total_paise` submitted = base + shipping − coupon_discount.
 */
export function AddressForm({
  seenTotalPaise,
  shippingOptions,
  defaultAddress,
  receiptData,
}: {
  seenTotalPaise: number;
  shippingOptions: ShippingOption[];
  /** The signed-in customer's default address, prefilled into the form. */
  defaultAddress?: {
    full_name: string;
    phone: string;
    line1: string;
    line2: string | null;
    city: string;
    state: string;
    postal_code: string;
  } | null;
  receiptData: ReceiptData;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  // Set by the reconfirm dialog's ACCEPT button just before it submits.
  const overrideTotalRef = useRef<number | null>(null);
  const [guestPending, setGuestPending] = useState(false);
  const [guestError, setGuestError] = useState<string | null>(null);

  // Shipping selection state.
  const [selectedShippingId, setSelectedShippingId] = useState<string | null>(
    shippingOptions.length === 1 ? (shippingOptions[0]?.id ?? null) : null,
  );
  const [shippingPaise, setShippingPaise] = useState<number>(
    shippingOptions.length === 1 ? (shippingOptions[0]?.shipping_paise ?? 0) : 0,
  );

  // Coupon state.
  const [couponCode, setCouponCode] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [discountPaise, setDiscountPaise] = useState(0);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPending, startCouponTransition] = useTransition();

  // Effective total = base + shipping − discount.
  const effectiveTotal = seenTotalPaise + shippingPaise - discountPaise;

  function onShippingChange(id: string, paise: number) {
    setSelectedShippingId(id);
    setShippingPaise(paise);
  }

  function applyCoupon() {
    if (!couponCode.trim()) return;
    // seenTotalPaise is the pre-tax subtotal+gst (base cart total); the server
    // computes discount on subtotal_paise internally. We pass effectiveTotal
    // as a proxy for the subtotal check (conservative; server re-validates).
    startCouponTransition(async () => {
      const r = await verifyCoupon(couponCode.trim(), seenTotalPaise);
      if (r.ok) {
        setAppliedCouponCode(couponCode.trim().toUpperCase());
        setDiscountPaise(r.discount_paise);
        setCouponError(null);
      } else {
        const msgs: Record<string, string> = {
          not_found: "Coupon not found.",
          inactive: "This coupon is no longer active.",
          expired: "This coupon has expired.",
          min_order: "Your order doesn't meet the minimum amount for this coupon.",
          per_user_limit: "You've already used this coupon the maximum number of times.",
        };
        setCouponError(msgs[r.error] ?? "Invalid coupon.");
        setAppliedCouponCode(null);
        setDiscountPaise(0);
      }
    });
  }

  function removeCoupon() {
    setCouponCode("");
    setAppliedCouponCode(null);
    setDiscountPaise(0);
    setCouponError(null);
  }

  const [state, formAction, pending] = useActionState<
    CheckoutActionResult | null,
    FormData
  >(async (_prev, formData) => {
    const seen = overrideTotalRef.current ?? effectiveTotal;
    overrideTotalRef.current = null;
    return createOrderFromCart(
      checkoutInputFromForm((name) => formData.get(name), seen),
    );
  }, null);

  const ui = mapCheckoutState(state);

  useEffect(() => {
    const next = mapCheckoutState(state);
    if (next.kind === "redirect") {
      router.push(next.to);
    }
  }, [state, router]);

  /**
   * "Continue as guest" — the same seam a guest's first `addToCart` uses
   * (ADR-0014 anonymous sign-in), invoked from the browser client like the
   * auth forms, then the same address is re-submitted.
   */
  async function continueAsGuest() {
    setGuestPending(true);
    setGuestError(null);
    const { error } = await createClient().auth.signInAnonymously();
    if (error) {
      setGuestError(error.message);
      setGuestPending(false);
      return;
    }
    setGuestPending(false);
    formRef.current?.requestSubmit();
  }

  const fieldErrors = ui.kind === "form" ? ui.fieldErrors : {};

  return (
    <form
      ref={formRef}
      action={formAction}
      className="mt-8 grid gap-10 md:grid-cols-12 md:gap-12"
    >
      {/* Hidden fields for shipping + coupon */}
      <input type="hidden" name="shipping_method_id" value={selectedShippingId ?? ""} />
      <input type="hidden" name="coupon_code" value={appliedCouponCode ?? ""} />

      {/* Left 7 columns: address + shipping + coupon. */}
      <section className="md:col-span-7 space-y-8">
        <div>
          <h2 className="font-display text-xl tracking-[-0.02em]">Delivery address</h2>
          <div className="mt-8 flex flex-col gap-6">
            <UnderlineField
              label="Full name"
              name="full_name"
              autoComplete="name"
              defaultValue={defaultAddress?.full_name}
              error={fieldErrors.full_name}
            />
            <UnderlineField
              label="Address line 1"
              name="line1"
              autoComplete="address-line1"
              defaultValue={defaultAddress?.line1}
              error={fieldErrors.line1}
            />
            <UnderlineField
              label="Address line 2 (optional)"
              name="line2"
              autoComplete="address-line2"
              defaultValue={defaultAddress?.line2 ?? undefined}
              error={fieldErrors.line2}
            />
            <div className="grid grid-cols-2 gap-6">
              <UnderlineField
                label="City"
                name="city"
                autoComplete="address-level2"
                defaultValue={defaultAddress?.city}
                error={fieldErrors.city}
              />
              <UnderlineField
                label="State"
                name="state"
                autoComplete="address-level1"
                defaultValue={defaultAddress?.state}
                error={fieldErrors.state}
              />
            </div>
            <div className="grid grid-cols-2 gap-6">
              <UnderlineField
                label="PIN code"
                name="postal_code"
                inputMode="numeric"
                autoComplete="postal-code"
                defaultValue={defaultAddress?.postal_code}
                error={fieldErrors.postal_code}
              />
              <UnderlineField
                label="Phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                defaultValue={defaultAddress?.phone}
                error={fieldErrors.phone}
              />
            </div>
            <p className="text-xs text-muted-foreground">Delivery within India.</p>
          </div>
        </div>

        {/* Shipping method selector */}
        {shippingOptions.length > 0 && (
          <ShippingSelector
            options={shippingOptions}
            selectedId={selectedShippingId}
            onChange={onShippingChange}
          />
        )}

        {/* Coupon input */}
        <div className="space-y-2">
          <p className="eyebrow text-xs text-muted-foreground">Coupon</p>
          {appliedCouponCode ? (
            <div className="flex items-center gap-3 rounded-sm border border-gold/40 bg-gold/5 px-4 py-2">
              <span className="ledger text-sm text-gold">{appliedCouponCode}</span>
              <span className="text-xs text-muted-foreground">−{formatPaise(discountPaise)}</span>
              <button
                type="button"
                onClick={removeCoupon}
                className="eyebrow ml-auto text-xs text-muted-foreground hover:text-foreground"
              >
                Remove
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="COUPON CODE"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                className="ledger flex-1 border-b bg-transparent py-1.5 text-sm uppercase outline-none placeholder:text-muted-foreground/40"
              />
              <button
                type="button"
                onClick={applyCoupon}
                disabled={couponPending || !couponCode.trim()}
                className="eyebrow text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                {couponPending ? "…" : "Apply"}
              </button>
            </div>
          )}
          {couponError && (
            <p className="text-xs text-destructive">{couponError}</p>
          )}
        </div>
      </section>

      {/* Right 5 columns: summary card. */}
      <aside className="md:sticky md:top-8 md:col-span-5 md:self-start">
        <div className="rounded-xs border bg-card p-6">
          <p className="eyebrow text-muted-foreground">Your price — will be locked now</p>
          <div className="mt-5">
            <PriceReceipt
              {...receiptData}
              couponDiscountPaise={discountPaise > 0 ? discountPaise : undefined}
              appliedCouponCode={appliedCouponCode ?? undefined}
            />
          </div>

          {/* Shipping adjustment */}
          {shippingPaise > 0 && (
            <div className="mt-4 space-y-1 border-t pt-4">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Delivery</span>
                <span className="ledger">{formatPaise(shippingPaise)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-sm font-medium">
                <span className="eyebrow">Total</span>
                <span className="ledger">{formatPaise(effectiveTotal)}</span>
              </div>
            </div>
          )}

          <ActionArea
            ui={ui}
            pending={pending}
            guestPending={guestPending}
            guestError={guestError}
            onContinueAsGuest={continueAsGuest}
          />
        </div>
      </aside>

      {ui.kind === "reconfirm" && (
        <ReconfirmDialog
          ui={ui}
          pending={pending}
          onAccept={() => {
            overrideTotalRef.current = ui.trueTotalPaise;
          }}
        />
      )}
    </form>
  );
}

/** The slot under the receipt: submit button or the active branch's panel. */
function ActionArea({
  ui,
  pending,
  guestPending,
  guestError,
  onContinueAsGuest,
}: {
  ui: CheckoutUiState;
  pending: boolean;
  guestPending: boolean;
  guestError: string | null;
  onContinueAsGuest: () => void;
}) {
  if (ui.kind === "unauthenticated") {
    return (
      <div className="mt-6 border px-4 py-4">
        <p className="text-sm">
          Your session ended. Sign in to place your order, or continue as a
          guest.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <Link
            href="/login?next=/checkout"
            className={buttonVariants({ variant: "outline", width: "full" })}
          >
            Sign in
          </Link>
          <Button
            type="button"
            width="full"
            onClick={onContinueAsGuest}
            disabled={guestPending}
          >
            {guestPending ? "One moment…" : "Continue as guest"}
          </Button>
          {guestError !== null && (
            <p className="text-xs text-destructive">{guestError}</p>
          )}
        </div>
      </div>
    );
  }

  if (ui.kind === "price_unavailable") {
    return (
      <>
        <div className="mt-6 border border-hallmark/40 px-4 py-3">
          <p className="text-xs text-hallmark">
            The {ui.material} rate is updating — we can&apos;t lock your price
            right now. Checkout reopens the moment the rate returns.
          </p>
        </div>
        <Link
          href="/cart"
          className={buttonVariants({
            variant: "outline",
            width: "full",
            className: "mt-6",
          })}
        >
          Back to your tray
        </Link>
      </>
    );
  }

  if (ui.kind === "out_of_stock") {
    return (
      <>
        <div className="mt-6 border px-4 py-3">
          <p className="text-sm">
            We&apos;re sorry — a piece in your tray was just claimed by another
            customer. Your tray now reflects what&apos;s available.
          </p>
        </div>
        <Link
          href="/cart"
          className={buttonVariants({
            variant: "outline",
            width: "full",
            className: "mt-6",
          })}
        >
          Back to your tray
        </Link>
      </>
    );
  }

  // form (incl. quiet error banner), reconfirm (modal overlays), redirect.
  const banner = ui.kind === "form" ? ui.banner : null;
  return (
    <>
      {banner !== null && (
        <p className="mt-6 border border-destructive px-4 py-3 text-sm text-destructive">
          {banner}
        </p>
      )}
      <Button
        type="submit"
        width="full"
        className="mt-6"
        disabled={pending || ui.kind === "redirect"}
      >
        {pending
          ? "Placing order…"
          : ui.kind === "redirect"
            ? "One moment…"
            : "Place Order & Pay"}
      </Button>
    </>
  );
}

/**
 * The reconfirm moment (ADR-0002), ledger style: PRICE YOU SAW / PRICE NOW in
 * mono with the delta colored by what the customer would pay — an increase in
 * vermillion, a decrease in green (the ticker's two delta inks). ACCEPT is a
 * submit button that re-submits the same address with
 * `seen_total_paise = true_total_paise`; it is never clicked for the customer.
 */
function ReconfirmDialog({
  ui,
  pending,
  onAccept,
}: {
  ui: Extract<CheckoutUiState, { kind: "reconfirm" }>;
  pending: boolean;
  onAccept: () => void;
}) {
  const deltaClass =
    ui.delta.direction === "up"
      ? "text-destructive"
      : ui.delta.direction === "down"
        ? "text-rate-up"
        : "text-muted-foreground";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="The price has changed"
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 px-4"
    >
      <div className="w-full max-w-[440px] rounded-sm border bg-card p-8">
        <h2 className="font-display text-lg tracking-[-0.02em]">
          The gold rate moved while you were deciding
        </h2>
        <div className="mt-6 border-t">
          <div className="flex items-baseline justify-between gap-4 border-b py-3">
            <span className="eyebrow text-muted-foreground">
              Price you saw
            </span>
            <span className="ledger">{formatPaise(ui.seenTotalPaise)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b py-3">
            <span className="eyebrow">Price now</span>
            <span className="ledger">{formatPaise(ui.trueTotalPaise)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-4 border-b py-3">
            <span className="eyebrow text-muted-foreground">Change</span>
            <span className={cn("ledger", deltaClass)}>{ui.delta.label}</span>
          </div>
        </div>
        <div className="mt-6 flex flex-col gap-3">
          <Button
            type="submit"
            width="full"
            onClick={onAccept}
            disabled={pending}
          >
            {pending ? "Placing order…" : "Accept new price"}
          </Button>
          <Link
            href="/cart"
            className={buttonVariants({ variant: "outline", width: "full" })}
          >
            Back to cart
          </Link>
        </div>
      </div>
    </div>
  );
}
