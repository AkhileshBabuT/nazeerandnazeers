import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AddressBook } from "@/components/account/address-book";

export const metadata = { title: "Addresses · Account" };

/**
 * Account address book `/account/addresses` (PRD 08). Logged-in only — anon /
 * unauthenticated → login. Addresses are owner-scoped by RLS.
 */
export default async function AddressesPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user || user.is_anonymous) {
    redirect("/login?next=/account/addresses");
  }

  const { data: addresses } = await supabase
    .from("addresses")
    .select(
      "id, full_name, phone, line1, line2, city, state, postal_code, country, is_default",
    )
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-2xl px-4 py-14 md:px-0">
      <h1 className="font-display text-xl tracking-[-0.02em]">Addresses</h1>
      <AddressBook addresses={addresses ?? []} />
    </div>
  );
}
