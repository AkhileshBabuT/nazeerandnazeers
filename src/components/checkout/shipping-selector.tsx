"use client";

import { formatPaise } from "@/lib/format";

export interface ShippingOption {
  id: string;
  name: string;
  description: string;
  shipping_paise: number;
}

export function ShippingSelector({
  options,
  selectedId,
  onChange,
}: {
  options: ShippingOption[];
  selectedId: string | null;
  onChange: (id: string, shippingPaise: number) => void;
}) {
  if (options.length === 0) {
    return null;
  }

  return (
    <fieldset className="space-y-2">
      <legend className="eyebrow text-xs text-muted-foreground">Delivery</legend>
      <div className="divide-y border">
        {options.map((opt) => (
          <label
            key={opt.id}
            className="flex cursor-pointer items-center gap-4 px-4 py-3 hover:bg-muted/30"
          >
            <input
              type="radio"
              name="shipping_method_id"
              value={opt.id}
              checked={selectedId === opt.id}
              onChange={() => onChange(opt.id, opt.shipping_paise)}
              className="accent-gold"
            />
            <div className="flex-1">
              <div className="text-sm font-medium">{opt.name}</div>
              {opt.description && (
                <div className="text-xs text-muted-foreground">{opt.description}</div>
              )}
            </div>
            <div className="ledger text-sm text-right">
              {opt.shipping_paise === 0 ? (
                <span className="text-gold">Free</span>
              ) : (
                formatPaise(opt.shipping_paise)
              )}
            </div>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
