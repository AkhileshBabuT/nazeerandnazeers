import { createClient } from "@/lib/supabase/server";

/**
 * Header cart count — lightweight read (no pricing). Mirrors the store's
 * cart resolution: the caller's oldest open cart.
 */
export async function CartCount() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return <span>Cart</span>;
  }
  const { data } = await supabase
    .from("carts")
    .select("cart_items(quantity)")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const count =
    data?.cart_items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
  return (
    <span className="ledger">{count > 0 ? `Cart · ${count}` : "Cart"}</span>
  );
}
