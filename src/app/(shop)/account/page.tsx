import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/auth/sign-out-button";

export const metadata = { title: "Account" };

function memberSince(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function shortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(iso));
}

function AccountRow({
  eyebrow,
  title,
  subtitle,
  href,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group -ml-3 flex items-center border-b border-border py-6 pl-3 transition-all hover:border-l-2 hover:border-l-gold hover:bg-card"
    >
      <div>
        <div className="eyebrow text-xs text-muted-foreground">{eyebrow}</div>
        <div className="mt-1 font-display text-[22px] font-medium tracking-[-0.02em]">
          {title}
        </div>
        <div className="mt-1 text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <span className="ledger ml-auto text-[15px] text-muted-foreground">→</span>
    </Link>
  );
}

export default async function AccountPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.is_anonymous) {
    redirect("/login?next=/account");
  }

  const [customerRes, ordersRes, addressesRes] = await Promise.all([
    supabase
      .from("customers")
      .select("full_name, phone")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("addresses").select("id").eq("user_id", user.id),
  ]);

  const customer = customerRes.data;
  const orders = ordersRes.data ?? [];
  const addresses = addressesRes.data ?? [];

  const displayName =
    customer?.full_name || user.email?.split("@")[0] || "My Account";

  const orderSubtitle =
    orders.length === 0
      ? "No orders yet"
      : `${orders.length} order${orders.length === 1 ? "" : "s"} · last placed ${shortDate(orders[0]!.created_at)}`;

  const addressSubtitle =
    addresses.length === 0
      ? "No addresses saved"
      : `${addresses.length} saved`;

  return (
    <div className="mx-auto max-w-[720px] px-4 py-14 md:px-0">
      <h1 className="font-display text-[30px] font-medium tracking-[-0.02em]">
        {displayName}
      </h1>
      <p className="eyebrow mt-1 border-b border-foreground pb-2 text-xs text-muted-foreground">
        MEMBER SINCE {memberSince(user.created_at ?? "")}
      </p>
      <div className="mt-8">
        <AccountRow
          eyebrow="PROFILE"
          title="Name, email & password"
          subtitle={user.email ?? ""}
          href="/account/profile"
        />
        <AccountRow
          eyebrow="ORDERS"
          title="Your ledger"
          subtitle={orderSubtitle}
          href="/account/orders"
        />
        <AccountRow
          eyebrow="ADDRESSES"
          title="Delivery addresses"
          subtitle={addressSubtitle}
          href="/account/addresses"
        />
      </div>
      <div className="mt-8 border-t pt-6">
        <SignOutButton />
      </div>
    </div>
  );
}
