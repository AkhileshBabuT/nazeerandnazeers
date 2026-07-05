import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ShippingMethodsManager } from "@/components/admin/shipping-methods-manager";

export const metadata = { title: "Shipping" };

export default async function AdminShippingPage() {
  await connection();

  const svc = await createClient();
  const { data, error } = await svc
    .from("shipping_methods")
    .select("id, name, description, base_rate_paise, per_gram_paise, free_above_paise, is_active")
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (
    <div className="space-y-8">
      <h1 className="eyebrow text-muted-foreground">Shipping methods</h1>
      <ShippingMethodsManager methods={data ?? []} />
    </div>
  );
}
