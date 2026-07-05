"use client";

import { useActionState, useState } from "react";
import { upsertVariant, deleteVariant } from "@/app/actions/variants";
import type { ActionResult } from "@/app/actions/admin-guard";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";

type VariantRow = Database["public"]["Tables"]["product_variant"]["Row"];

type SaveState = { result: ActionResult<{ id: string }> } | null;
type DeleteState = { result: ActionResult<{ id: string }> } | null;

type DraftVariant = {
  sku: string;
  purity_karat: string;
  weight_grams: string;
  making_charge_type: "flat" | "percent";
  making_charge_value: string;
  stock_quantity: string;
  hallmark_huid: string;
  size_label: string;
  metal_tone: string;
};

const emptyDraft = (): DraftVariant => ({
  sku: "",
  purity_karat: "",
  weight_grams: "",
  making_charge_type: "flat",
  making_charge_value: "0",
  stock_quantity: "0",
  hallmark_huid: "",
  size_label: "",
  metal_tone: "",
});

/**
 * Variant editor island (PRD 07-04). Lists existing variants; allows adding
 * new ones via an inline form. Mounted on the product editor for existing
 * pieces. Follows the product-gemstone-editor pattern.
 */
export function VariantEditor({
  productId,
  initialVariants,
}: {
  productId: string;
  initialVariants: VariantRow[];
}) {
  const [variants, setVariants] = useState<VariantRow[]>(initialVariants);
  const [draft, setDraft] = useState<DraftVariant>(emptyDraft());
  const [showForm, setShowForm] = useState(false);

  const [saveState, saveAction, savePending] = useActionState<SaveState, FormData>(
    async () => {
      const result = await upsertVariant({
        product_id: productId,
        sku: draft.sku,
        purity_karat: draft.purity_karat ? Number(draft.purity_karat) : null,
        size_label: draft.size_label || null,
        metal_tone: (draft.metal_tone as "yellow" | "white" | "rose") || null,
        weight_grams: draft.weight_grams,
        making_charge_type: draft.making_charge_type,
        making_charge_value: Number(draft.making_charge_value),
        stock_quantity: Number(draft.stock_quantity),
        hallmark_huid: draft.hallmark_huid || null,
        is_active: true,
      });
      if (result.ok) {
        // Refresh the list by re-fetching via the action (simpler: just reload)
        // For now, optimistically add — a full reload is the safe fallback.
        window.location.reload();
      }
      return { result };
    },
    null,
  );

  const [, deleteAction] = useActionState<DeleteState, string>(
    async (_prev, id: string) => {
      const result = await deleteVariant(id);
      if (result.ok) {
        setVariants((prev) => prev.filter((v) => v.id !== id));
      }
      return { result };
    },
    null,
  );

  const updateDraft = (patch: Partial<DraftVariant>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const saveError =
    saveState?.result?.ok === false &&
    saveState.result.code !== "invalid"
      ? saveState.result.code === "unauthorized"
        ? "Not authorized — sign in as an admin."
        : (saveState.result as { message?: string }).message ?? "Error saving variant."
      : null;

  return (
    <div className="space-y-4">
      {variants.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No variants — this piece uses its base pricing inputs.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="eyebrow py-1 text-left text-muted-foreground">SKU</th>
              <th className="eyebrow py-1 text-left text-muted-foreground">Size</th>
              <th className="eyebrow py-1 text-left text-muted-foreground">Purity</th>
              <th className="eyebrow py-1 text-left text-muted-foreground">Tone</th>
              <th className="eyebrow py-1 text-left text-muted-foreground">Weight</th>
              <th className="eyebrow py-1 text-left text-muted-foreground">Stock</th>
              <th className="eyebrow py-1 text-left text-muted-foreground">Active</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.id} className="border-b last:border-0">
                <td className="ledger py-2">{v.sku}</td>
                <td className="py-2">{v.size_label ?? "—"}</td>
                <td className="py-2">{v.purity_karat != null ? `${v.purity_karat}k` : "—"}</td>
                <td className="py-2">{v.metal_tone ?? "—"}</td>
                <td className="ledger py-2">{v.weight_grams}g</td>
                <td className="ledger py-2">{v.stock_quantity}</td>
                <td className="py-2">{v.is_active ? "Yes" : "No"}</td>
                <td className="py-2">
                  <form
                    action={async () => {
                      await deleteAction(v.id);
                    }}
                  >
                    <Button
                      type="submit"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                    >
                      Remove
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!showForm && (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowForm(true)}
        >
          Add variant
        </Button>
      )}

      {showForm && (
        <form action={saveAction} className="space-y-4 border p-4">
          <p className="eyebrow text-muted-foreground">New variant</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field
              label="SKU · Required"
              placeholder="RING-22K-US6"
              value={draft.sku}
              onChange={(v) => updateDraft({ sku: v })}
            />
            <Field
              label="Purity (karat)"
              placeholder="22"
              inputMode="numeric"
              value={draft.purity_karat}
              onChange={(v) => updateDraft({ purity_karat: v })}
            />
            <Field
              label="Weight (g) · Required"
              placeholder="5.000"
              inputMode="decimal"
              value={draft.weight_grams}
              onChange={(v) => updateDraft({ weight_grams: v })}
            />
            <Field
              label="Stock qty"
              placeholder="10"
              inputMode="numeric"
              value={draft.stock_quantity}
              onChange={(v) => updateDraft({ stock_quantity: v })}
            />
            <Field
              label="Making charge"
              placeholder="50000"
              inputMode="numeric"
              value={draft.making_charge_value}
              onChange={(v) => updateDraft({ making_charge_value: v })}
            />
            <div>
              <label className="block">
                <span className="eyebrow text-muted-foreground">Charge type</span>
                <select
                  value={draft.making_charge_type}
                  onChange={(e) =>
                    updateDraft({ making_charge_type: e.target.value as "flat" | "percent" })
                  }
                  className="mt-1 w-full border-b bg-transparent py-1.5 text-sm outline-none focus:border-gold"
                >
                  <option value="flat">Flat (paise)</option>
                  <option value="percent">Percent (bps)</option>
                </select>
              </label>
            </div>
            <Field
              label="Size label"
              placeholder="US 6"
              value={draft.size_label}
              onChange={(v) => updateDraft({ size_label: v })}
            />
            <div>
              <label className="block">
                <span className="eyebrow text-muted-foreground">Metal tone</span>
                <select
                  value={draft.metal_tone}
                  onChange={(e) => updateDraft({ metal_tone: e.target.value })}
                  className="mt-1 w-full border-b bg-transparent py-1.5 text-sm outline-none focus:border-gold"
                >
                  <option value="">— none —</option>
                  <option value="yellow">Yellow</option>
                  <option value="white">White</option>
                  <option value="rose">Rose</option>
                </select>
              </label>
            </div>
            <Field
              label="Hallmark HUID"
              placeholder="AB123456"
              value={draft.hallmark_huid}
              onChange={(v) => updateDraft({ hallmark_huid: v })}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" disabled={savePending}>
              {savePending ? "Saving…" : "Save variant"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowForm(false);
                setDraft(emptyDraft());
              }}
            >
              Cancel
            </Button>
          </div>

          {saveError !== null && (
            <p className="border border-destructive px-4 py-3 text-destructive">
              {saveError}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <label className="block">
      <span className="eyebrow text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode={inputMode}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border-b bg-transparent py-1.5 text-sm outline-none transition-colors focus:border-gold"
      />
    </label>
  );
}
