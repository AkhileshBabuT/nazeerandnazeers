import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { CouponsManager } from "@/components/admin/coupons-manager";

export const metadata = { title: "Coupons" };

export default async function AdminCouponsPage() {
  await connection();

  // Admin-scoped read under RLS ("admins can manage/read" coupon policies):
  // a non-admin session gets zero rows.
  const svc = await createClient();
  const { data, error } = await svc
    .from("coupons")
    .select(
      "id, code, discount_type, discount_value, min_order_paise, max_uses, per_user_limit, is_active, valid_from, valid_until",
    )
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Join redemption counts
  const { data: redemptions } = await svc
    .from("coupon_redemptions")
    .select("coupon_id");

  const redemptionCounts = new Map<string, number>();
  for (const r of redemptions ?? []) {
    redemptionCounts.set(r.coupon_id, (redemptionCounts.get(r.coupon_id) ?? 0) + 1);
  }

  const coupons = (data ?? []).map((c) => ({
    ...c,
    use_count: redemptionCounts.get(c.id) ?? 0,
  }));

  return (
    <div className="space-y-8">
      <h1 className="eyebrow text-muted-foreground">Coupons</h1>
      <CouponsManager coupons={coupons} />
    </div>
  );
}
