import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

/**
 * Header "Saved · N" badge — per-user, so a dynamic hole streamed inside its own
 * Suspense (mirrors CartCount). Renders nothing for signed-out users or an empty
 * wishlist, so it never adds a dangling link.
 */
export async function WishlistCount() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return null;
  }
  const { count } = await supabase
    .from("wishlists")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userData.user.id);
  const n = count ?? 0;
  if (n === 0) {
    return null;
  }
  return (
    <Link
      href="/account/wishlist"
      className="eyebrow transition-colors hover:text-gold"
    >
      Saved · {n}
    </Link>
  );
}
