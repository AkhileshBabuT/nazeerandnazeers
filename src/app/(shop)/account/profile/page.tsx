import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ProfileForm } from "@/components/account/profile-form";

export const metadata = { title: "Profile" };

export default async function ProfilePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user || user.is_anonymous) {
    redirect("/login?next=/account/profile");
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("full_name, phone")
    .eq("user_id", user.id)
    .maybeSingle();

  const displayName =
    customer?.full_name || user.email?.split("@")[0] || "Profile";

  return (
    <div className="mx-auto max-w-[720px] px-4 py-14 md:px-0">
      <p className="eyebrow mb-4 text-xs text-muted-foreground">
        <Link href="/account" className="hover:text-foreground">
          ACCOUNT
        </Link>
        {" · PROFILE"}
      </p>
      <h1 className="font-display text-[30px] font-medium tracking-[-0.02em]">
        {displayName}
      </h1>
      <ProfileForm
        defaultName={customer?.full_name}
        defaultPhone={customer?.phone}
      />
      <div className="mt-8 border-t pt-6">
        <Link
          href="/account"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Account
        </Link>
      </div>
    </div>
  );
}
