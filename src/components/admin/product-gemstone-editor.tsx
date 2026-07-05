"use client";

import { useActionState, useState } from "react";
import { setProductGemstones } from "@/app/actions/product-gemstone";
import type { ActionResult } from "@/app/actions/admin-guard";
import {
  parseProductGemstones,
  type GemstoneRow,
} from "@/lib/admin/product-gemstone";
import { Button } from "@/components/ui/button";

type GemRow = {
  id: string;
  gem_type: string;
  carat_weight: number | null;
  cut: string | null;
  color: string | null;
  clarity: string | null;
  lab: string | null;
  certificate_number: string | null;
  laser_inscription: string | null;
};
type SaveState = {
  result: ActionResult<{ count: number }>;
  fieldErrors?: Record<string, string[]>;
} | null;

const empty = (): GemstoneRow => ({
  gem_type: "",
  carat_weight: "",
  cut: "",
  color: "",
  clarity: "",
  lab: "",
  certificate_number: "",
  laser_inscription: "",
});

/**
 * Product gemstone / certificate editor (PRD 07-07). One card per stone (centre
 * + accents). carat_weight is STONE carat, never the metal's purity. Replace-
 * style save via `setProductGemstones`. Mounted on the product editor for
 * existing pieces only.
 */
export function ProductGemstoneEditor({
  productId,
  gemstones,
}: {
  productId: string;
  gemstones: GemRow[];
}) {
  const [rows, setRows] = useState<GemstoneRow[]>(() =>
    gemstones.map((g) => ({
      gem_type: g.gem_type,
      carat_weight: g.carat_weight != null ? String(g.carat_weight) : "",
      cut: g.cut ?? "",
      color: g.color ?? "",
      clarity: g.clarity ?? "",
      lab: g.lab ?? "",
      certificate_number: g.certificate_number ?? "",
      laser_inscription: g.laser_inscription ?? "",
    })),
  );

  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async () => {
      const parsed = parseProductGemstones(rows);
      if (!parsed.ok) {
        return {
          result: { ok: false, code: "invalid", fieldErrors: parsed.fieldErrors },
          fieldErrors: parsed.fieldErrors,
        };
      }
      return { result: await setProductGemstones(productId, parsed.items) };
    },
    null,
  );
  const result = state?.result ?? null;
  const saved = result?.ok === true;
  const fieldErrors = state?.fieldErrors ?? {};
  const bannerError =
    result?.ok === false && result.code !== "invalid"
      ? result.code === "unauthorized"
        ? "Not authorized — sign in as an admin."
        : result.message
      : null;

  const update = (i: number, patch: Partial<GemstoneRow>) =>
    setRows((prev) => prev.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setRows((prev) => [...prev, empty()]);
  const removeRow = (i: number) =>
    setRows((prev) => prev.filter((_, j) => j !== i));
  const err = (i: number, f: string): string | undefined =>
    fieldErrors[`${i}.${f}`]?.[0];

  return (
    <form action={formAction} className="space-y-4">
      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          No stones — leave empty for a plain metal piece, or add a stone.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={i} className="space-y-3 border p-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Field
                  label="Stone · Required"
                  placeholder="Diamond"
                  value={r.gem_type}
                  onChange={(v) => update(i, { gem_type: v })}
                  error={err(i, "gem_type")}
                />
                <Field
                  label="Carat (stone)"
                  placeholder="0.75"
                  inputMode="decimal"
                  value={r.carat_weight}
                  onChange={(v) => update(i, { carat_weight: v })}
                  error={err(i, "carat_weight")}
                />
                <Field
                  label="Cut"
                  placeholder="Round"
                  value={r.cut}
                  onChange={(v) => update(i, { cut: v })}
                />
                <Field
                  label="Colour"
                  placeholder="F"
                  value={r.color}
                  onChange={(v) => update(i, { color: v })}
                />
                <Field
                  label="Clarity"
                  placeholder="VS1"
                  value={r.clarity}
                  onChange={(v) => update(i, { clarity: v })}
                />
                <Field
                  label="Lab"
                  placeholder="GIA / IGI"
                  value={r.lab}
                  onChange={(v) => update(i, { lab: v })}
                />
                <Field
                  label="Certificate #"
                  placeholder="1234567890"
                  value={r.certificate_number}
                  onChange={(v) => update(i, { certificate_number: v })}
                />
                <Field
                  label="Laser inscription"
                  placeholder="GIA 1234"
                  value={r.laser_inscription}
                  onChange={(v) => update(i, { laser_inscription: v })}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() => removeRow(i)}
              >
                Remove stone
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" onClick={addRow}>
          Add stone
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save stones"}
        </Button>
        {saved && (
          <span className="eyebrow text-muted-foreground">Saved ✓</span>
        )}
      </div>

      {bannerError !== null && (
        <p className="border border-destructive px-4 py-3 text-destructive">
          {bannerError}
        </p>
      )}
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  error,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  placeholder?: string;
  inputMode?: "decimal";
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
      {error !== undefined && (
        <span className="mt-1 block text-xs text-destructive">{error}</span>
      )}
    </label>
  );
}
