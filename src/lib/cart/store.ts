/**
 * Cart store (PRD 03) — the deep module behind the Cart Server Actions. One
 * interface (`addLine`, `setLineQuantity`, `removeLine`, `viewCart`,
 * `mergeCarts`); the rules live inside:
 *
 *  - **Stock clamp** — a requested quantity is clamped to the Product's current
 *    `stock_quantity` (soft UX clamp; the hard reservation is Checkout's job,
 *    ADR-0001). Clamping to zero is "out of stock".
 *  - **Guest identity** — every write lazily signs an unauthenticated visitor in
 *    anonymously (ADR-0014) via `ensureUserId`, so one `auth.uid() = user_id`
 *    RLS model covers Guests and Customers alike.
 *  - **Ensure-or-create Cart** — a caller's open Cart is resolved (or lazily
 *    created) under their own RLS.
 *  - **Live pricing** — the Cart stores no prices (ADR-0002); `viewCart`
 *    recomputes from the current Metal Rate, marking stale/missing-rate lines
 *    "price unavailable" (ADR-0010).
 *
 * The caller's RLS-scoped client is injected — the store never creates one — so
 * the rules are exercisable against any adapter (live server client in the
 * actions, a stub in tests). The only service-role read is the admin-only
 * `settings` singleton (GST bps), needed to price a Cart.
 */

import { getGstSettings } from "../orders/service";
import { messageOf } from "../utils";
import { ensureUserId, type ServerSupabase } from "./guest";
import { getCurrentRate } from "../rates";
import type { PricingProduct, PricingSettings } from "../pricing";
import {
  computeCartView,
  type CartView,
  type CartViewLineInput,
  type RateResolver,
} from "./view";

/**
 * Discriminated store result. The Server Action adds its own `invalid` arm for
 * Zod failures; everything past validation is decided here.
 */
export type CartStoreResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: "not_found" }
  | { ok: false; code: "error"; message: string };

/** A Cart line write's outcome: the row id and the (clamped) quantity. */
export interface CartLineResult {
  cart_item_id: string;
  quantity: number;
}


/**
 * Resolve (or lazily create) the caller's open Cart and return its id. Signs an
 * unauthenticated visitor in anonymously first (ADR-0014), so a Guest gets a
 * real `auth.uid()` on their first write. The insert/select run under the
 * caller's own RLS (`auth.uid() = user_id`).
 */
async function ensureCart(
  supabase: ServerSupabase,
): Promise<{ cartId: string; userId: string }> {
  const userId = await ensureUserId(supabase);

  const { data: existing, error: selErr } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (selErr) {
    throw selErr;
  }
  if (existing) {
    return { cartId: existing.id, userId };
  }

  const { data: created, error: insErr } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();
  if (insErr) {
    throw insErr;
  }
  return { cartId: created.id, userId };
}

/**
 * Add a Product (or Variant) to the Cart, or raise an existing line to
 * `quantity`. The requested quantity is clamped to the Variant's (or Product's)
 * current `stock_quantity`. Line identity is (cart, product, variant) so a
 * 22k variant and a 24k variant of the same product are separate lines.
 */
export async function addLine(
  supabase: ServerSupabase,
  input: { product_id: string; quantity: number; variant_id?: string | null },
): Promise<CartStoreResult<CartLineResult>> {
  let stockQuantity: number;

  if (input.variant_id) {
    // Variant path: clamp against the Variant's stock.
    const { data: variant, error: varErr } = await supabase
      .from("product_variant")
      .select("id, stock_quantity")
      .eq("id", input.variant_id)
      .maybeSingle();
    if (varErr) {
      return { ok: false, code: "error", message: varErr.message };
    }
    if (!variant) {
      return { ok: false, code: "not_found" };
    }
    stockQuantity = variant.stock_quantity;
  } else {
    // No-variant path: clamp against the Product's stock (unchanged behaviour).
    const { data: product, error: prodErr } = await supabase
      .from("products")
      .select("id, stock_quantity")
      .eq("id", input.product_id)
      .maybeSingle();
    if (prodErr) {
      return { ok: false, code: "error", message: prodErr.message };
    }
    if (!product) {
      return { ok: false, code: "not_found" };
    }
    stockQuantity = product.stock_quantity;
  }

  const quantity = Math.min(input.quantity, stockQuantity);
  if (quantity <= 0) {
    return { ok: false, code: "error", message: "Product is out of stock." };
  }

  let cartId: string;
  try {
    ({ cartId } = await ensureCart(supabase));
  } catch (err) {
    return { ok: false, code: "error", message: messageOf(err) };
  }

  // Upsert the line: unique per (cart, product, variant) — NULLS NOT DISTINCT
  // ensures (cart, product, NULL) is unique so no-variant products still behave.
  const { data, error } = await supabase
    .from("cart_items")
    .upsert(
      {
        cart_id: cartId,
        product_id: input.product_id,
        variant_id: input.variant_id ?? null,
        quantity,
      },
      { onConflict: "cart_id,product_id,variant_id" },
    )
    .select("id, quantity")
    .single();
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: { cart_item_id: data.id, quantity: data.quantity } };
}

/**
 * Set a Cart line's quantity to an absolute value, clamped to the Product's
 * current stock. Only the line's owner can touch it (RLS via the parent cart).
 */
export async function setLineQuantity(
  supabase: ServerSupabase,
  input: { cart_item_id: string; quantity: number },
): Promise<CartStoreResult<CartLineResult>> {
  // Ensure a session exists (a write requires an identity); never sign in just
  // to fail an ownership check, but updates only make sense with a session.
  await ensureUserId(supabase);

  // Load the line + its Product's (or Variant's) stock. RLS scopes this to the caller's cart.
  const { data: line, error: lineErr } = await supabase
    .from("cart_items")
    .select("id, product_id, variant_id, products(stock_quantity), product_variant(stock_quantity)")
    .eq("id", input.cart_item_id)
    .maybeSingle();
  if (lineErr) {
    return { ok: false, code: "error", message: lineErr.message };
  }
  if (!line) {
    return { ok: false, code: "not_found" };
  }

  // Use variant stock when a variant is attached; fall back to product stock.
  const stock =
    line.variant_id != null
      ? (line.product_variant?.stock_quantity ?? 0)
      : (line.products?.stock_quantity ?? 0);
  const quantity = Math.min(input.quantity, stock);
  if (quantity <= 0) {
    return { ok: false, code: "error", message: "Product is out of stock." };
  }

  const { data, error } = await supabase
    .from("cart_items")
    .update({ quantity, updated_at: new Date().toISOString() })
    .eq("id", line.id)
    .select("id, quantity")
    .single();
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: { cart_item_id: data.id, quantity: data.quantity } };
}

/** Remove a Cart line. RLS ensures only the owner can delete it. */
export async function removeLine(
  supabase: ServerSupabase,
  input: { cart_item_id: string },
): Promise<CartStoreResult<{ cart_item_id: string }>> {
  await ensureUserId(supabase);

  const { data, error } = await supabase
    .from("cart_items")
    .delete()
    .eq("id", input.cart_item_id)
    .select("id");
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "not_found" };
  }
  return { ok: true, data: { cart_item_id: input.cart_item_id } };
}

/**
 * Read the caller's Cart with **live** line totals (ADR-0002). Does NOT sign a
 * visitor in — an unauthenticated visitor (or one with no Cart) simply gets an
 * empty Cart. Each line is priced from the current Metal Rate; a stale/missing
 * rate marks that line "price unavailable" rather than showing a wrong number
 * (ADR-0010). The rate resolver is injectable for tests; production uses
 * `getCurrentRate`.
 */
export async function viewCart(
  supabase: ServerSupabase,
  resolveRate: RateResolver = getCurrentRate,
): Promise<CartStoreResult<CartView>> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return { ok: true, data: emptyCartView() };
  }

  // Pull the open Cart and its lines + each line's Product + optional Variant
  // pricing inputs. RLS scopes this to the caller (`auth.uid() = user_id`).
  const { data: cart, error: cartErr } = await supabase
    .from("carts")
    .select(
      "id, cart_items(id, product_id, variant_id, quantity, products(id, sku, name, material, weight_grams, purity_karat, making_charge_type, making_charge_value), product_variant(id, sku, weight_grams, purity_karat, making_charge_type, making_charge_value))",
    )
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (cartErr) {
    return { ok: false, code: "error", message: cartErr.message };
  }
  if (!cart || cart.cart_items.length === 0) {
    return { ok: true, data: emptyCartView() };
  }

  let settings: PricingSettings;
  try {
    settings = await getGstSettings();
  } catch (err) {
    return { ok: false, code: "error", message: messageOf(err) };
  }

  const lines: CartViewLineInput[] = [];
  for (const item of cart.cart_items) {
    const p = item.products;
    if (!p) {
      continue; // Product gone (FK cascade would normally prevent this).
    }
    // When a variant is present, its pricing inputs override the product base.
    const v = item.variant_id != null ? item.product_variant : null;
    const product: PricingProduct = v
      ? {
          material: p.material,
          weight_grams: v.weight_grams,
          purity_karat: v.purity_karat,
          making_charge_type: v.making_charge_type,
          making_charge_value: v.making_charge_value,
        }
      : {
          material: p.material,
          weight_grams: p.weight_grams,
          purity_karat: p.purity_karat,
          making_charge_type: p.making_charge_type,
          making_charge_value: p.making_charge_value,
        };
    lines.push({
      cart_item_id: item.id,
      product_id: item.product_id,
      variant_id: item.variant_id ?? null,
      sku: v ? v.sku : p.sku,
      name: p.name,
      product,
      quantity: item.quantity,
    });
  }

  const view = await computeCartView(lines, resolveRate, settings);
  return { ok: true, data: view };
}

/**
 * Cart Merge (ADR-0014). Invoke at the sign-up/login boundary once the visitor
 * is authenticated into their permanent account, passing the prior anonymous
 * Guest `user_id`. Collapses the guest Cart into the account Cart by
 * **max(guest, account)** quantity per Product (never summed — a unique piece
 * exists once), clamped to current stock. Runs in a SECURITY DEFINER RPC so it
 * can see both carts across the per-user RLS boundary; the RPC is gated to the
 * authenticated caller.
 */
export async function mergeCarts(
  supabase: ServerSupabase,
  guestUserId: string,
): Promise<CartStoreResult<{ cart_id: string | null }>> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    // No permanent account to merge into.
    return { ok: false, code: "error", message: "Not authenticated." };
  }

  const { data, error } = await supabase.rpc("merge_guest_cart", {
    guest_user_id: guestUserId,
  });
  if (error) {
    return { ok: false, code: "error", message: error.message };
  }
  return { ok: true, data: { cart_id: data } };
}

/** An empty live Cart view (no lines, zero totals). */
function emptyCartView(): CartView {
  return {
    lines: [],
    metal_value: 0,
    making_charges: 0,
    gst: 0,
    total: 0,
    has_unpriceable_lines: false,
  };
}

