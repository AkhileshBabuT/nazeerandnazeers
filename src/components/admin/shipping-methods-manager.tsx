"use client";

import { useState, useTransition } from "react";
import {
  createShippingMethod,
  updateShippingMethod,
  deleteShippingMethod,
} from "@/app/actions/shipping";
import { formatPaise } from "@/lib/format";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/app/actions/admin-guard";

interface Method {
  id: string;
  name: string;
  description: string;
  base_rate_paise: number;
  per_gram_paise: number;
  free_above_paise: number | null;
  is_active: boolean;
}

const BLANK: Omit<Method, "id"> = {
  name: "",
  description: "",
  base_rate_paise: 0,
  per_gram_paise: 0,
  free_above_paise: null,
  is_active: true,
};

function MethodForm({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial: Omit<Method, "id">;
  onSave: (data: Omit<Method, "id">) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [d, setD] = useState(initial);
  const [freeStr, setFreeStr] = useState(
    initial.free_above_paise != null ? String(initial.free_above_paise) : "",
  );

  function field(key: keyof typeof d, value: string | number | boolean | null) {
    setD((prev) => ({ ...prev, [key]: value }));
  }

  function submit() {
    onSave({
      ...d,
      free_above_paise: freeStr.trim() ? parseInt(freeStr, 10) || null : null,
    });
  }

  return (
    <div className="rounded-sm border border-border bg-secondary p-4 space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="eyebrow text-xs text-muted-foreground">Name</label>
          <input
            value={d.name}
            onChange={(e) => field("name", e.target.value)}
            placeholder="Standard delivery"
            className="mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">Description</label>
          <input
            value={d.description}
            onChange={(e) => field("description", e.target.value)}
            placeholder="3–5 business days"
            className="mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">Base rate (paise)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={d.base_rate_paise}
            onChange={(e) => field("base_rate_paise", parseInt(e.target.value, 10) || 0)}
            className="ledger mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">Per gram (paise)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={d.per_gram_paise}
            onChange={(e) => field("per_gram_paise", parseInt(e.target.value, 10) || 0)}
            className="ledger mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div>
          <label className="eyebrow text-xs text-muted-foreground">
            Free above (paise) — leave blank for no threshold
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={freeStr}
            onChange={(e) => setFreeStr(e.target.value)}
            placeholder="500000"
            className="ledger mt-1 w-full border-b bg-transparent py-1 text-sm outline-none"
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id="is_active"
            checked={d.is_active}
            onChange={(e) => field("is_active", e.target.checked)}
            className="accent-gold"
          />
          <label htmlFor="is_active" className="eyebrow text-xs text-muted-foreground cursor-pointer">
            Active (visible at checkout)
          </label>
        </div>
      </div>
      <div className="flex gap-3 pt-1">
        <Button type="button" onClick={submit} disabled={pending || !d.name.trim()}>
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

export function ShippingMethodsManager({ methods }: { methods: Method[] }) {
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

  function save(id: string | null, data: Omit<Method, "id">) {
    setError(null);
    startTransition(async () => {
      const r = id
        ? await updateShippingMethod(id, data)
        : await createShippingMethod(data);
      handleResult(r);
    });
  }

  function remove(id: string) {
    if (!confirm("Delete this shipping method?")) return;
    startTransition(async () => {
      handleResult(await deleteShippingMethod(id));
    });
  }

  return (
    <div className="space-y-4">
      {error && <p className="text-xs text-destructive">{error}</p>}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="eyebrow pb-2 text-left text-xs text-muted-foreground">Method</th>
            <th className="eyebrow pb-2 text-right text-xs text-muted-foreground">Base</th>
            <th className="eyebrow pb-2 text-right text-xs text-muted-foreground">Per g</th>
            <th className="eyebrow pb-2 text-right text-xs text-muted-foreground">Free above</th>
            <th className="eyebrow pb-2 text-center text-xs text-muted-foreground">Active</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {methods.map((m) =>
            editing === m.id ? (
              <tr key={m.id}>
                <td colSpan={6} className="py-3">
                  <MethodForm
                    initial={m}
                    onSave={(d) => save(m.id, d)}
                    onCancel={() => setEditing(null)}
                    pending={pending}
                  />
                </td>
              </tr>
            ) : (
              <tr key={m.id} className="odd:bg-muted/30">
                <td className="py-3">
                  <div className="font-medium">{m.name}</div>
                  {m.description && (
                    <div className="text-xs text-muted-foreground">{m.description}</div>
                  )}
                </td>
                <td className="py-3 text-right ledger">{formatPaise(m.base_rate_paise)}</td>
                <td className="py-3 text-right ledger">
                  {m.per_gram_paise > 0 ? `${m.per_gram_paise} p/g` : "—"}
                </td>
                <td className="py-3 text-right ledger">
                  {m.free_above_paise != null ? formatPaise(m.free_above_paise) : "—"}
                </td>
                <td className="py-3 text-center">
                  {m.is_active ? (
                    <span className="eyebrow text-xs text-gold">YES</span>
                  ) : (
                    <span className="eyebrow text-xs text-muted-foreground">NO</span>
                  )}
                </td>
                <td className="py-3 text-right">
                  <div className="flex justify-end gap-3">
                    <button
                      className="eyebrow text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setEditing(m.id)}
                    >
                      Edit
                    </button>
                    <button
                      className="eyebrow text-xs text-destructive hover:opacity-70"
                      onClick={() => remove(m.id)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>

      {adding ? (
        <MethodForm
          initial={BLANK}
          onSave={(d) => save(null, d)}
          onCancel={() => setAdding(false)}
          pending={pending}
        />
      ) : (
        <Button type="button" onClick={() => setAdding(true)}>
          + Add shipping method
        </Button>
      )}
    </div>
  );
}
