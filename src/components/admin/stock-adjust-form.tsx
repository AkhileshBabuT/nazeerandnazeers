"use client";

import { useState } from "react";
import { setProductStock } from "@/app/actions/admin";

export function StockAdjustForm({
  productId,
  current,
}: {
  productId: string;
  current: number;
}) {
  const [qty, setQty] = useState(current);
  const [saving, setSaving] = useState(false);
  const dirty = qty !== current;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty) return;
    setSaving(true);
    await setProductStock(productId, qty);
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
      <input
        type="number"
        min="0"
        value={qty}
        onChange={(e) => setQty(Math.max(0, parseInt(e.target.value, 10) || 0))}
        className="ledger w-14 rounded-xs border border-border bg-card px-1.5 py-0.5 text-xs"
      />
      <button
        type="submit"
        disabled={saving || !dirty}
        className="eyebrow rounded-xs border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors disabled:opacity-40 hover:border-foreground hover:text-foreground"
      >
        {saving ? "…" : "Save"}
      </button>
    </form>
  );
}
