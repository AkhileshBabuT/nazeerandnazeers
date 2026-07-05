import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCart } from "@/app/actions/cart";
import { createClient } from "@/lib/supabase/server";
import { getGstSettings } from "@/lib/shop/data";
import type { CartViewLine } from "@/lib/cart/view";
import { cartGstDisplaySplit } from "@/lib/gst-display";
import { AddressForm } from "@/components/checkout/address-form";
import { loadActiveShippingMethods, loadCartTotalWeightGrams } from "@/lib/shipping/service";
import { computeShipping } from "@/lib/shipping/compute";
import type { ShippingOption } from "@/components/checkout/shipping-selector";

export const metadata = { title: "Checkout" };

/**
 * C5 Checkout `/checkout` — address + the to-be-frozen total (ADR-0002/0003:
 * the price locks at order create, not before). Per-user, so UNCACHED; the
 * `(checkout)/loading.tsx` boundary streams it. Same data path as C4: the
 * server-rendered total is the `seen_total_paise` the action re-confirms.
 * An unpriceable line blocks checkout exactly as C4 does — no form in the
 * tree, only the way back to the tray.
 */
export default async function CheckoutPage() {
  await connection();
  const result = await getCart();

  if (!result.ok) {
    return (
      <div className="px-4 py-24 text-center md:px-12">
        <p className="font-display text-lg italic">
          Checkout could not be loaded — please try again
        </p>
      </div>
    );
  }

  const cart = result.data;

  if (cart.lines.length === 0) {
    redirect("/cart");
  }

  if (cart.has_unpriceable_lines) {
    const materials = [
      ...new Set(
        cart.lines.filter((l) => l.price_unavailable).map((l) => l.material),
      ),
    ];
    return <CheckoutBlocked materials={materials} />;
  }

  const settings = await getGstSettings();
  const pricedLines = cart.lines.filter(
    (l): l is Extract<CartViewLine, { price_unavailable: false }> =>
      !l.price_unavailable,
  );
  const split = cartGstDisplaySplit(pricedLines, settings);

  // Load shipping methods + pre-compute per-method cost for the customer's cart.
  const [shippingMethods, totalWeightGrams] = await Promise.all([
    loadActiveShippingMethods(),
    loadCartTotalWeightGrams(),
  ]);
  const shippingOptions: ShippingOption[] = shippingMethods.map((m) => ({
    id: m.id,
    name: m.name,
    description: m.description,
    // totalBeforeShipping = cart.total (pre-discount; coupons applied client-side)
    shipping_paise: computeShipping(m, totalWeightGrams, cart.total),
  }));

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  // Anonymous sessions must sign in before placing an order.
  if (!user || user.is_anonymous) {
    redirect("/login?next=/checkout");
  }

  // Prefill from the signed-in customer's default address (owner-RLS).
  let defaultAddress = null;
  if (user && !user.is_anonymous) {
    const { data } = await supabase
      .from("addresses")
      .select("full_name, phone, line1, line2, city, state, postal_code")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    defaultAddress = data;
  }

  return (
    <div className="px-4 py-10 md:px-12 md:py-14">
      <div className="flex items-baseline justify-between border-b pb-3.5">
        <h1 className="font-display text-2xl tracking-[-0.02em]">Delivery</h1>
        <Link
          href="/cart"
          className="eyebrow text-muted-foreground transition-colors hover:text-gold"
        >
          Back to your tray
        </Link>
      </div>

      <AddressForm
        seenTotalPaise={cart.total}
        shippingOptions={shippingOptions}
        defaultAddress={defaultAddress}
        receiptData={{
          metalValuePaise: cart.metal_value,
          makingChargesPaise: cart.making_charges,
          gstMetalPaise: split.gst_metal,
          gstMakingPaise: split.gst_making,
          totalPaise: cart.total,
          gstMetalBps: settings.gst_metal_bps,
          gstMakingBps: settings.gst_making_bps,
        }}
      />
    </div>
  );
}

/**
 * Checkout blocked (same decision as C4: `has_unpriceable_lines`): a price
 * can't be locked against a missing/stale rate (ADR-0010). No form in the
 * tree — only the explanation and the way back.
 */
function CheckoutBlocked({
  materials,
}: {
  materials: ("gold" | "silver")[];
}) {
  const names = materials.length === 0 ? "metal" : materials.join(" and ");
  return (
    <div className="flex flex-col items-center px-4 py-24 text-center md:px-12">
      <p className="eyebrow text-hallmark">Rate updating</p>
      <p className="mt-4 max-w-md font-display text-lg italic">
        The {names} rate is updating — checkout reopens the moment it returns.
      </p>
      <p className="mt-3 max-w-md text-sm text-muted-foreground">
        Your pieces are priced live; we never lock a price against a stale
        rate.
      </p>
      <Link
        href="/cart"
        className="eyebrow mt-8 border border-primary px-6 py-3 transition-colors hover:border-gold hover:text-gold"
      >
        Back to your tray
      </Link>
    </div>
  );
}
