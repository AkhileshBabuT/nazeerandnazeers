import { Fragment } from "react";
import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { StockAdjustForm } from "@/components/admin/stock-adjust-form";

export const metadata = { title: "Inventory" };

/**
 * A6 /admin/inventory — stock sheet with active reservations.
 * Grid: SKU | NAME | ON SHELF (22px) | HELD (chip) | ADJUST form
 * Reservation sub-rows expand inline below each product.
 */
export default async function AdminInventoryPage() {
  await connection();

  // Admin-scoped read under RLS (products/reservations admin policies): a
  // non-admin session sees no reservations, so RLS — not just the layout gate —
  // guards this data.
  const svc = await createClient();
  const now = new Date();

  const [productsRes, reservationsRes] = await Promise.all([
    svc
      .from("products")
      .select("id, sku, name, stock_quantity, is_active")
      .order("name", { ascending: true }),
    svc
      .from("reservations")
      .select("id, product_id, quantity, status, expires_at, order_id")
      .eq("status", "active")
      .order("expires_at", { ascending: true }),
  ]);

  if (productsRes.error) throw productsRes.error;
  if (reservationsRes.error) throw reservationsRes.error;
  const products = productsRes.data ?? [];
  const reservations = reservationsRes.data ?? [];

  const reservationsByProduct = new Map<string, typeof reservations>();
  for (const r of reservations) {
    const list = reservationsByProduct.get(r.product_id) ?? [];
    list.push(r);
    reservationsByProduct.set(r.product_id, list);
  }

  function secsLeft(expiresAt: string): number {
    return Math.max(0, Math.floor((new Date(expiresAt).getTime() - now.getTime()) / 1000));
  }

  function fmtCountdown(expiresAt: string): string {
    const s = secsLeft(expiresAt);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-baseline justify-between">
        <h1 className="eyebrow text-muted-foreground">Inventory</h1>
        <p className="text-xs text-muted-foreground">Holds release after 15 min</p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="eyebrow pb-2 text-left text-xs text-muted-foreground w-[90px]">SKU</th>
            <th className="eyebrow pb-2 text-left text-xs text-muted-foreground">Name</th>
            <th className="eyebrow pb-2 text-right text-xs text-muted-foreground w-[80px]">On shelf</th>
            <th className="eyebrow pb-2 text-right text-xs text-muted-foreground w-[80px]">Held</th>
            <th className="eyebrow pb-2 text-left text-xs text-muted-foreground w-[160px] pl-6">Adjust</th>
          </tr>
        </thead>
        <tbody>
          {products.map((product) => {
            const holds = reservationsByProduct.get(product.id) ?? [];
            const heldQty = holds.reduce((s, r) => s + r.quantity, 0);
            const soldOut = product.stock_quantity === 0 && heldQty === 0;
            return (
              <Fragment key={product.id}>
                <tr className="border-t odd:bg-muted/30">
                  <td className="ledger py-3 text-xs text-muted-foreground align-top">
                    {product.sku}
                  </td>
                  <td className="py-3 align-top">
                    <Link href={`/admin/products/${product.id}`} className="hover:text-gold">
                      {product.name}
                    </Link>
                    {!product.is_active && (
                      <span className="eyebrow ml-2 text-xs text-muted-foreground">draft</span>
                    )}
                    {soldOut && (
                      <span className="eyebrow ml-2 rounded-[2px] border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        SOLD OUT
                      </span>
                    )}
                  </td>
                  <td className="ledger py-3 text-right align-top text-[22px] font-medium leading-tight">
                    {product.stock_quantity}
                  </td>
                  <td className="py-3 text-right align-top">
                    {heldQty > 0 ? (
                      <span className="ledger inline-block rounded-[2px] border border-gold px-2 py-0.5 text-xs text-gold">
                        {heldQty}
                      </span>
                    ) : (
                      <span className="ledger text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 pl-6 align-top">
                    <StockAdjustForm productId={product.id} current={product.stock_quantity} />
                  </td>
                </tr>
                {holds.map((r) => (
                  <tr key={r.id} className="border-t border-border/40 bg-muted/10">
                    <td colSpan={5} className="py-1.5 pl-4">
                      <span className="text-xs text-muted-foreground">
                        ↳{" "}
                        <Link
                          href={`/admin/orders/${r.order_id}`}
                          className="ledger hover:text-gold"
                        >
                          order
                        </Link>
                        {" · "}
                        {r.quantity} unit{r.quantity > 1 ? "s" : ""}
                        {" · expires "}
                        <span
                          className={`ledger ${secsLeft(r.expires_at) < 120 ? "text-hallmark" : ""}`}
                        >
                          {fmtCountdown(r.expires_at)}
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
