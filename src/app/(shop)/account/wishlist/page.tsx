import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { ProductRow } from "@/lib/catalog";
import { ProductCard } from "@/components/storefront/product-card";

export const metadata = { title: "Saved pieces · Account" };

/**
 * Account wishlist `/account/wishlist` (PRD 08). Logged-in only. The user's
 * saved, still-active pieces (RLS owner-scoped; inactive products drop out of
 * the embed).
 */
export default async function WishlistPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || user.is_anonymous) {
    redirect("/login?next=/account/wishlist");
  }

  const { data: rows } = await supabase
    .from("wishlists")
    .select("product_id, products(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const products = (rows ?? [])
    .map((r) => r.products)
    .filter((p): p is ProductRow => p !== null && p.is_active);

  return (
    <div className="px-4 pt-10 md:px-12 md:pt-14">
      <div className="flex items-baseline justify-between border-b pb-3.5">
        <h1 className="font-display text-2xl tracking-[-0.02em]">Saved pieces</h1>
        <span className="ledger text-xs uppercase text-muted-foreground">
          {String(products.length).padStart(2, "0")} saved
        </span>
      </div>

      {products.length === 0 ? (
        <div className="flex flex-col items-center py-24">
          <span className="font-display text-2xl text-foreground/20">♡</span>
          <p className="mt-6 font-display text-lg italic">
            No saved pieces yet
          </p>
          <Link
            href="/shop"
            className="eyebrow mt-8 border border-primary px-6 py-3 transition-colors hover:border-gold hover:text-gold"
          >
            Browse the collection
          </Link>
        </div>
      ) : (
        <div className="mb-8 mt-6 grid grid-cols-1 gap-5 md:grid-cols-3 md:gap-6">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}
