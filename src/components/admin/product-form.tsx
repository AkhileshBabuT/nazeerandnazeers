"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  upsertProduct,
  type ActionResult,
} from "@/app/actions/catalog";
import type { ProductRow } from "@/lib/catalog";
import type { FacetOption } from "@/lib/shop/data";
import type { PricingSettings } from "@/lib/pricing";
import {
  parseProductForm,
  previewPrice,
  type ProductFormValues,
  type RateRow,
} from "@/lib/admin/product-preview";
import { nowMs } from "@/lib/admin/dashboard";
import {
  bpsToPercentInput,
  paiseToRupeesInput,
} from "@/lib/admin/money-input";
import { formatBps } from "@/lib/gst-display";
import { formatGrams, formatRate, formatTimeIST } from "@/lib/format";
import { PriceReceipt } from "@/components/storefront/price-receipt";
import { UnderlineField } from "@/components/auth/underline-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";

type SaveIntent = "save" | "deactivate" | "reactivate";
type SaveState = { result: ActionResult<{ id: string }> } | null;

/**
 * A2b editor island: ruled form sections over `upsertProduct` (zod field
 * errors per path) + the sticky live PRICE PREVIEW computed client-side from
 * the pure pricing module (never stored — ADR-0007). Gold-only fields
 * (purity, HUID) appear only for gold, marked REQUIRED, mirroring
 * `productInputSchema`. Soft deactivate only — no delete control (FK-safe).
 */
export function ProductForm({
  product,
  rates,
  maxRateAgeSeconds,
  settings,
  categories,
  audiences,
}: {
  product: ProductRow | null;
  rates: { gold: RateRow; silver: RateRow };
  maxRateAgeSeconds: number;
  settings: PricingSettings;
  categories: FacetOption[];
  audiences: FacetOption[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<ProductFormValues>(() => ({
    sku: product?.sku ?? "",
    name: product?.name ?? "",
    description: product?.description ?? "",
    material: product?.material ?? "gold",
    weight_grams: product !== null ? String(product.weight_grams) : "",
    purity_karat:
      product?.purity_karat != null ? String(product.purity_karat) : "",
    making_charge_type: product?.making_charge_type ?? "flat",
    making_charge_value:
      product === null
        ? ""
        : product.making_charge_type === "flat"
          ? paiseToRupeesInput(product.making_charge_value)
          : bpsToPercentInput(product.making_charge_value),
    hallmark_huid: product?.hallmark_huid ?? "",
    stock_quantity: product !== null ? String(product.stock_quantity) : "0",
    category_id: product?.category_id ?? "",
    audience_id: product?.audience_id ?? "",
  }));
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
  // Which submit button fired — read inside the action, reset after.
  const intentRef = useRef<SaveIntent>("save");

  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    async () => {
      const intent = intentRef.current;
      intentRef.current = "save";
      const isActive =
        intent === "deactivate"
          ? false
          : intent === "reactivate"
            ? true
            : (product?.is_active ?? true);
      const parsed = parseProductForm(values, isActive);
      if (!parsed.ok) {
        return {
          result: {
            ok: false,
            code: "invalid",
            fieldErrors: parsed.fieldErrors,
          },
        };
      }
      return {
        result: await upsertProduct(
          product !== null ? { ...parsed.input, id: product.id } : parsed.input,
        ),
      };
    },
    null,
  );
  const result = state?.result ?? null;

  useEffect(() => {
    if (result?.ok === true) {
      router.push("/admin/products");
    }
  }, [result, router]);

  const fieldErrors =
    result?.ok === false && result.code === "invalid"
      ? result.fieldErrors
      : {};
  // Unique-violation on products.sku → an inline SKU error, not a banner.
  const skuConflict =
    result?.ok === false &&
    result.code === "error" &&
    /duplicate key|unique constraint/i.test(result.message) &&
    /sku/i.test(result.message);
  const bannerError =
    result?.ok === false && result.code !== "invalid" && !skuConflict
      ? result.code === "unauthorized"
        ? "Not authorized — sign in as an admin."
        : result.message
      : null;

  const fieldError = (path: string): string | undefined =>
    fieldErrors[path]?.[0];

  const set = <K extends keyof ProductFormValues>(
    key: K,
    value: ProductFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  const gold = values.material === "gold";
  const preview = previewPrice(
    values,
    rates[values.material],
    maxRateAgeSeconds,
    settings,
    nowMs(),
  );

  return (
    <form
      action={formAction}
      className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]"
    >
      <div className="max-w-xl space-y-8">
        <Section title="Identity">
          <UnderlineField
            label="SKU"
            value={values.sku}
            onChange={(e) => set("sku", e.target.value)}
            error={
              skuConflict
                ? "This SKU already exists — choose another."
                : fieldError("sku")
            }
          />
          <UnderlineField
            label="Name"
            value={values.name}
            onChange={(e) => set("name", e.target.value)}
            error={fieldError("name")}
          />
          <UnderlineTextarea
            label="Description"
            value={values.description}
            onChange={(e) => set("description", e.target.value)}
            error={fieldError("description")}
          />
        </Section>

        <Section title="Classification">
          <UnderlineSelect
            label="Category · Required"
            value={values.category_id}
            onChange={(e) => set("category_id", e.target.value)}
            error={fieldError("category_id")}
          >
            <option value="" disabled>
              Choose a category…
            </option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.display_name}
              </option>
            ))}
          </UnderlineSelect>
          <UnderlineSelect
            label="Audience · Required"
            value={values.audience_id}
            onChange={(e) => set("audience_id", e.target.value)}
            error={fieldError("audience_id")}
          >
            <option value="" disabled>
              Choose who it&apos;s for…
            </option>
            {audiences.map((a) => (
              <option key={a.id} value={a.id}>
                {a.display_name}
              </option>
            ))}
          </UnderlineSelect>
        </Section>

        <Section title="Metal & weight">
          <div>
            <span className="eyebrow text-muted-foreground">Material</span>
            <div className="mt-2 flex gap-2" role="group" aria-label="Material">
              <ToggleChip
                active={gold}
                onClick={() => set("material", "gold")}
              >
                Gold
              </ToggleChip>
              <ToggleChip
                active={!gold}
                onClick={() => set("material", "silver")}
              >
                Silver
              </ToggleChip>
            </div>
          </div>
          <UnderlineField
            label="Weight (grams)"
            inputMode="decimal"
            placeholder="7.350"
            value={values.weight_grams}
            onChange={(e) => set("weight_grams", e.target.value)}
            error={fieldError("weight_grams")}
          />
          {gold && (
            <UnderlineField
              label="Purity (karat) · Required"
              inputMode="numeric"
              placeholder="22"
              value={values.purity_karat}
              onChange={(e) => set("purity_karat", e.target.value)}
              error={fieldError("purity_karat")}
            />
          )}
        </Section>

        <Section title="Making charges">
          <div>
            <span className="eyebrow text-muted-foreground">Type</span>
            <div
              className="mt-2 flex gap-2"
              role="group"
              aria-label="Making charge type"
            >
              <ToggleChip
                active={values.making_charge_type === "flat"}
                onClick={() => set("making_charge_type", "flat")}
              >
                Flat ₹
              </ToggleChip>
              <ToggleChip
                active={values.making_charge_type === "percent"}
                onClick={() => set("making_charge_type", "percent")}
              >
                % of metal
              </ToggleChip>
            </div>
          </div>
          <UnderlineField
            label={
              values.making_charge_type === "flat"
                ? "Amount (rupees)"
                : "Percent of metal value"
            }
            inputMode="decimal"
            placeholder={values.making_charge_type === "flat" ? "8500.00" : "12.5"}
            value={values.making_charge_value}
            onChange={(e) => set("making_charge_value", e.target.value)}
            error={fieldError("making_charge_value")}
          />
        </Section>

        <Section title="Hallmark">
          {gold ? (
            <UnderlineField
              label="HUID · Required"
              placeholder="AB123456"
              value={values.hallmark_huid}
              onChange={(e) => set("hallmark_huid", e.target.value)}
              error={fieldError("hallmark_huid")}
            />
          ) : (
            <p className="text-muted-foreground">
              BIS hallmarking applies to gold pieces only.
            </p>
          )}
        </Section>

        <Section title="Stock">
          <UnderlineField
            label="Quantity"
            inputMode="numeric"
            value={values.stock_quantity}
            onChange={(e) => set("stock_quantity", e.target.value)}
            error={fieldError("stock_quantity")}
          />
          {product !== null && (
            <div className="space-y-3">
              <p className="flex items-center gap-2">
                <span className="eyebrow text-muted-foreground">
                  Shop visibility
                </span>
                <span
                  className={cn(
                    "eyebrow rounded-xs border px-2 py-0.5",
                    product.is_active
                      ? "border-foreground/40"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {product.is_active ? "Active" : "Hidden"}
                </span>
              </p>
              {product.is_active && !confirmingDeactivate && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setConfirmingDeactivate(true)}
                >
                  Deactivate piece
                </Button>
              )}
              {product.is_active && confirmingDeactivate && (
                <div className="space-y-3 border border-destructive p-4">
                  <p>
                    This piece will be hidden from the shop. Nothing is
                    deleted — it can be reactivated later.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={pending}
                      onClick={(e) => {
                        intentRef.current = "deactivate";
                        e.currentTarget.form?.requestSubmit();
                      }}
                    >
                      Confirm deactivate
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setConfirmingDeactivate(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {!product.is_active && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={(e) => {
                    intentRef.current = "reactivate";
                    e.currentTarget.form?.requestSubmit();
                  }}
                >
                  Reactivate piece
                </Button>
              )}
            </div>
          )}
        </Section>

        {bannerError !== null && (
          <p className="border border-destructive px-4 py-3 text-destructive">
            {bannerError}
          </p>
        )}

        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : product !== null ? "Save piece" : "Create piece"}
        </Button>
      </div>

      <PricePreviewCard values={values} preview={preview} settings={settings} />
    </form>
  );
}

/* ---------------------------------------------------------------- preview -- */

type Preview = ReturnType<typeof previewPrice>;

/**
 * Sticky live PRICE PREVIEW (A2 brief): the storefront receipt computed from
 * the form's current values. Stale/missing rate → em-dashes + sienna stamp.
 */
function PricePreviewCard({
  values,
  preview,
  settings,
}: {
  values: ProductFormValues;
  preview: Preview;
  settings: PricingSettings;
}) {
  return (
    <aside className="border bg-card p-5 lg:sticky lg:top-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="eyebrow">Price preview</h2>
        {preview.status === "rate_unavailable" && (
          <span className="eyebrow border border-hallmark px-2 py-0.5 text-hallmark">
            {preview.reason === "stale" ? "Rate stale" : "No rate"}
          </span>
        )}
      </div>
      <p className="eyebrow mt-1 text-muted-foreground">
        Never stored — computed live
      </p>
      <div className="mt-4">
        {preview.status === "priced" ? (
          <PriceReceipt
            metalValuePaise={preview.price.metal_value}
            makingChargesPaise={preview.price.making_charges}
            gstMetalPaise={preview.split.gst_metal}
            gstMakingPaise={preview.split.gst_making}
            totalPaise={preview.price.total}
            gstMetalBps={settings.gst_metal_bps}
            gstMakingBps={settings.gst_making_bps}
            metalFormula={
              values.material === "gold"
                ? `${formatGrams(values.weight_grams)} × ${formatRate(preview.ratePaise)} × ${Number(values.purity_karat)}/24`
                : `${formatGrams(values.weight_grams)} × ${formatRate(preview.ratePaise)}`
            }
          />
        ) : (
          <DashReceipt settings={settings} />
        )}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        {preview.status === "priced" && (
          <>
            at today&apos;s {values.material}{" "}
            <span className="ledger">
              {formatRate(preview.ratePaise)} ·{" "}
              {formatTimeIST(preview.effectiveAt)} IST
            </span>
          </>
        )}
        {preview.status === "rate_unavailable" && (
          <>
            {preview.reason === "stale"
              ? `The latest ${values.material} rate is past the staleness ceiling — storefront prices are hidden. `
              : `No ${values.material} rate has been posted. `}
            <Link
              href="/admin/rates"
              className="underline transition-colors hover:text-gold"
            >
              Post today&apos;s rate
            </Link>
          </>
        )}
        {preview.status === "incomplete" &&
          "Complete weight and making charges to preview."}
      </p>
    </aside>
  );
}

/** Em-dash receipt — same rows, no numbers (a wrong number is worse). */
function DashReceipt({ settings }: { settings: PricingSettings }) {
  const rows = [
    "Metal value",
    "Making charges",
    `GST on metal @ ${formatBps(settings.gst_metal_bps)}`,
    `GST on making @ ${formatBps(settings.gst_making_bps)}`,
  ];
  return (
    <div>
      {rows.map((label) => (
        <div
          key={label}
          className="flex items-baseline justify-between gap-4 border-b py-3"
        >
          <span className="eyebrow text-muted-foreground">{label}</span>
          <span className="ledger text-muted-foreground">—</span>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-4 border-t-2 border-foreground py-3">
        <span className="eyebrow">Total</span>
        <span className="ledger text-lg text-muted-foreground">—</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits -- */

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="eyebrow border-b-2 border-foreground pb-2 text-muted-foreground">
        {title}
      </h2>
      <div className="mt-4 space-y-5">{children}</div>
    </section>
  );
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "eyebrow cursor-pointer rounded-xs border px-2.5 py-1 transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-primary text-foreground hover:border-gold hover:text-gold",
      )}
    >
      {children}
    </button>
  );
}

/** Select twin of `UnderlineField` — same underline treatment. */
function UnderlineSelect({
  label,
  error,
  children,
  ...props
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
} & React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label className="block">
      <span className="eyebrow text-muted-foreground">{label}</span>
      <select
        className="mt-2 w-full border-b bg-transparent py-2 text-base outline-none transition-colors focus:border-gold focus:shadow-[0_1px_0_0_var(--color-gold)]"
        {...props}
      >
        {children}
      </select>
      {error !== undefined && (
        <span className="mt-1 block text-xs text-destructive">{error}</span>
      )}
    </label>
  );
}

/** Textarea twin of `UnderlineField` (design contract §3.4). */
function UnderlineTextarea({
  label,
  error,
  ...props
}: {
  label: string;
  error?: string;
} & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className="block">
      <span className="eyebrow text-muted-foreground">{label}</span>
      <textarea
        rows={3}
        className="mt-2 w-full resize-y border-b bg-transparent py-2 text-base outline-none transition-colors focus:border-gold focus:shadow-[0_1px_0_0_var(--color-gold)]"
        {...props}
      />
      {error !== undefined && (
        <span className="mt-1 block text-xs text-destructive">{error}</span>
      )}
    </label>
  );
}
