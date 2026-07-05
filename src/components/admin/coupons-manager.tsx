"use client";

import { useState, useTransition } from "react";
import { createCoupon, updateCoupon, deleteCoupon } from "@/app/actions/coupons";
import { formatPaise } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/app/actions/admin-guard";

interface Coupon {
  id: string;
  code: string;
  discount_type: "percent" | "flat";
  discount_value: number;
  min_order_paise: number;
  max_uses: number | null;
  per_user_limit: number;
  is_active: boolean;
  valid_from: string;
  valid_until: string | null;
  use_count: number;
}

const BLANK: Omit<Coupon, "id" | "use_count"> = {
  code: "",
  discount_type: "percent",
  discount_value: 1000, // 10%
  min_order_paise: 0,
  max_uses: null,
  per_user_limit: 1,
  is_active: true,
  valid_from: new Date().toISOString().slice(0, 10),
  valid_until: null,
};

function formatDiscount(c: Pick<Coupon, "discount_type" | "discount_value">): string {
  if (c.discount_type === "percent") {
    return `${(c.discount_value / 100).toFixed(0)}% off`;
  }
  return `${formatPaise(c.discount_value)} off`;
}

function CouponForm({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial: Omit<Coupon, "id" | "use_count">;
  onSave: (data: Omit<Coupon, "id" | "use_count">) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [d, setD] = useState(initial);
  const [maxUsesStr, setMaxUsesStr] = useState(
    initial.max_uses != null ? String(initial.max_uses) : "",
  );
  const [validUntilStr, setValidUntilStr] = useState(
    initial.valid_until ? initial.valid_until.slice(0, 10) : "",
  );

  function field<K extends keyof typeof d>(key: K, value: (typeof d)[K]) {
    setD((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    onSave({
      ...d,
      max_uses: maxUsesStr.trim() ? parseInt(maxUsesStr, 10) || null : null,
      valid_until: validUntilStr.trim()
        ? new Date(validUntilStr).toISOString()
        : null,
    });
  }

  return (
    <div className="rounded-sm border border-border bg-secondary p-4 space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="eyebrow text-xs text-muted-foreground">Code</label>
          <input
            value={d.code}
            onChange={(e) => field("code", e.target.value.toUpperCase())}
            placeholder="SUMMER10"
            className="mt-1 w-full border-b bg-transparent py-1 text-sm uppercase outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">Discount type</label>
          <select
            value={d.discount_type}
            onChange={(e) => field("discount_type", e.target.value as "percent" | "flat")}
            className="mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          >
            <option value="percent">Percent (bps)</option>
            <option value="flat">Flat (Paise)</option>
          </select>
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">
            {d.discount_type === "percent"
              ? "Discount (bps, e.g. 1000 = 10%)"
              : "Discount (Paise, e.g. 50000 = ₹500)"}
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={d.discount_value}
            onChange={(e) => field("discount_value", parseInt(e.target.value, 10) || 0)}
            className="ledger mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">Min order (Paise)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={d.min_order_paise}
            onChange={(e) => field("min_order_paise", parseInt(e.target.value, 10) || 0)}
            className="ledger mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">
            Max uses (blank = unlimited)
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={maxUsesStr}
            onChange={(e) => setMaxUsesStr(e.target.value)}
            placeholder="—"
            className="ledger mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">Per-user limit</label>
          <input
            type="number"
            min={1}
            step={1}
            value={d.per_user_limit}
            onChange={(e) => field("per_user_limit", parseInt(e.target.value, 10) || 1)}
            className="ledger mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">Valid from</label>
          <input
            type="date"
            value={d.valid_from.slice(0, 10)}
            onChange={(e) => field("valid_from", new Date(e.target.value).toISOString())}
            className="ledger mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">
            Valid until (blank = no expiry)
          </label>
          <input
            type="date"
            value={validUntilStr}
            onChange={(e) => setValidUntilStr(e.target.value)}
            className="ledger mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2 pt-4">
          <input
            type="checkbox"
            id="coupon_is_active"
            checked={d.is_active}
            onChange={(e) => field("is_active", e.target.checked)}
            className="accent-gold"
          />
          <label
            htmlFor="coupon_is_active"
            className="eyebrow text-xs text-muted-foreground cursor-pointer"
          >
            Active
          </label>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <Button type="button" onClick={submit} disabled={pending || !d.code.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <button
          type="button"
          onClick={onCancel}
          className="eyebrow text-xs text-muted-foreground hover:text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

export function CouponsManager({ coupons }: { coupons: Coupon[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  function handleResult(r: ActionResult<void>) {
    if (!r.ok) {
      setError(r.code === "error" ? r.message : r.code);
    } else {
      setError(null);
      setEditing(null);
      setAdding(false);
    }
  }

  function save(id: string | null, data: Omit<Coupon, "id" | "use_count">) {
    setError(null);
    startTransition(async () => {
      const r = id ? await updateCoupon(id, data) : await createCoupon(data);
      handleResult(r);
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this coupon?")) return;
    startTransition(async () => handleResult(await deleteCoupon(id)));
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-destructive">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="eyebrow pb-2 text-left text-xs text-muted-foreground">Code</th>
            <th className="eyebrow pb-2 text-left text-xs text-muted-foreground">Discount</th>
            <th className="eyebrow pb-2 text-right text-xs text-muted-foreground">Min order</th>
            <th className="eyebrow pb-2 text-right text-xs text-muted-foreground">Uses</th>
            <th className="eyebrow pb-2 text-center text-xs text-muted-foreground">Active</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {coupons.map((c) =>
            editing === c.id ? (
              <tr key={c.id}>
                <td colSpan={6} className="py-3">
                  <CouponForm
                    initial={c}
                    onSave={(d) => save(c.id, d)}
                    onCancel={() => setEditing(null)}
                    pending={pending}
                  />
                </td>
              </tr>
            ) : (
              <tr key={c.id} className="odd:bg-muted/30">
                <td className="py-3 font-mono text-xs">{c.code}</td>
                <td className="py-3">{formatDiscount(c)}</td>
                <td className="py-3 text-right ledger">
                  {c.min_order_paise > 0 ? formatPaise(c.min_order_paise) : "—"}
                </td>
                <td className="py-3 text-right ledger">
                  {c.use_count}
                  {c.max_uses != null ? ` / ${c.max_uses}` : ""}
                </td>
                <td className="py-3 text-center">
                  {c.is_active ? (
                    <span className="eyebrow text-xs text-gold">YES</span>
                  ) : (
                    <span className="eyebrow text-xs text-muted-foreground">NO</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <button
                      className="eyebrow text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setEditing(c.id)}
                    >
                      Edit
                    </button>
                    <button
                      className="eyebrow text-xs text-destructive hover:opacity-70"
                      onClick={() => remove(c.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ),
          )}
          {coupons.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                No coupons yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {adding ? (
        <CouponForm
          initial={BLANK}
          onSave={(d) => save(null, d)}
          onCancel={() => setAdding(false)}
          pending={pending}
        />
      ) : (
        <Button type="button" onClick={() => setAdding(true)}>
          + Add coupon
        </Button>
      )}
    </div>
  );
}
