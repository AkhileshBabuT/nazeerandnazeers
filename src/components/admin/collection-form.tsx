"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { upsertCollection } from "@/app/actions/collections";
import type { ActionResult } from "@/app/actions/admin-guard";
import type { CollectionRow } from "@/lib/shop/data";
import {
  parseCollectionForm,
  slugify,
  type CollectionFormValues,
} from "@/lib/admin/collection-form";
import { UnderlineField } from "@/components/auth/underline-field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SaveIntent = "save" | "deactivate" | "reactivate";
type SaveState = { result: ActionResult<{ id: string }> } | null;

type ProductOption = {
  id: string;
  sku: string;
  name: string;
  is_active: boolean;
};

/**
 * Collection editor island (PRD 07-01): ruled form sections over
 * `upsertCollection` (zod field errors per path) plus a product membership
 * checklist. Soft deactivate only — no delete control (FK-safe). No price
 * anywhere (ADR-0007).
 */
export function CollectionForm({
  collection,
  products,
  memberIds,
}: {
  collection: CollectionRow | null;
  products: ProductOption[];
  memberIds: string[];
}) {
  const router = useRouter();
  const [values, setValues] = useState<CollectionFormValues>(() => ({
    slug: collection?.slug ?? "",
    display_name: collection?.display_name ?? "",
    description: collection?.description ?? "",
    hero_image: collection?.hero_image ?? "",
    sort_order: collection !== null ? String(collection.sort_order) : "0",
    meta_title: collection?.meta_title ?? "",
    meta_description: collection?.meta_description ?? "",
  }));
  // Ordered membership — the array order IS the persisted sort_order, so the
  // admin can deliberately arrange pieces within the collection (07-01 review).
  const [members, setMembers] = useState<string[]>(() => memberIds);
  const [confirmingDeactivate, setConfirmingDeactivate] = useState(false);
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
            : (collection?.is_active ?? true);
      const parsed = parseCollectionForm(values, isActive);
      if (!parsed.ok) {
        return {
          result: { ok: false, code: "invalid", fieldErrors: parsed.fieldErrors },
        };
      }
      return {
        result: await upsertCollection({
          ...parsed.input,
          ...(collection !== null ? { id: collection.id } : {}),
          productIds: members,
        }),
      };
    },
    null,
  );
  const result = state?.result ?? null;

  useEffect(() => {
    if (result?.ok === true) {
      router.push("/admin/collections");
    }
  }, [result, router]);

  const fieldErrors =
    result?.ok === false && result.code === "invalid"
      ? result.fieldErrors
      : {};
  const slugConflict =
    result?.ok === false &&
    result.code === "error" &&
    /duplicate key|unique constraint/i.test(result.message) &&
    /slug/i.test(result.message);
  const bannerError =
    result?.ok === false && result.code !== "invalid" && !slugConflict
      ? result.code === "unauthorized"
        ? "Not authorized — sign in as an admin."
        : result.message
      : null;

  const fieldError = (path: string): string | undefined =>
    fieldErrors[path]?.[0];
  const set = <K extends keyof CollectionFormValues>(
    key: K,
    value: CollectionFormValues[K],
  ) => setValues((v) => ({ ...v, [key]: value }));

  const memberSet = new Set(members);
  const productById = new Map(products.map((p) => [p.id, p]));
  const available = products.filter((p) => !memberSet.has(p.id));

  const addMember = (id: string) =>
    setMembers((prev) => [...prev, id]);
  const removeMember = (id: string) =>
    setMembers((prev) => prev.filter((m) => m !== id));
  const moveMember = (index: number, dir: -1 | 1) =>
    setMembers((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) {
        return prev;
      }
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });

  return (
    <form action={formAction} className="max-w-xl space-y-8">
      <Section title="Identity">
        <UnderlineField
          label="Name"
          value={values.display_name}
          onChange={(e) => set("display_name", e.target.value)}
          error={fieldError("display_name")}
        />
        <UnderlineField
          label="Slug · auto from name if blank"
          placeholder={
            values.display_name ? slugify(values.display_name) : "bridal-edit"
          }
          value={values.slug}
          onChange={(e) => set("slug", e.target.value)}
          error={
            slugConflict
              ? "This slug already exists — choose another."
              : fieldError("slug")
          }
        />
        <UnderlineTextarea
          label="Description"
          value={values.description}
          onChange={(e) => set("description", e.target.value)}
          error={fieldError("description")}
        />
        <UnderlineField
          label="Hero image URL"
          value={values.hero_image}
          onChange={(e) => set("hero_image", e.target.value)}
          error={fieldError("hero_image")}
        />
        <UnderlineField
          label="Sort order"
          inputMode="numeric"
          value={values.sort_order}
          onChange={(e) => set("sort_order", e.target.value)}
          error={fieldError("sort_order")}
        />
      </Section>

      <Section title="SEO">
        <UnderlineField
          label="Meta title"
          value={values.meta_title}
          onChange={(e) => set("meta_title", e.target.value)}
          error={fieldError("meta_title")}
        />
        <UnderlineTextarea
          label="Meta description"
          value={values.meta_description}
          onChange={(e) => set("meta_description", e.target.value)}
          error={fieldError("meta_description")}
        />
      </Section>

      <Section title={`Products · ${members.length} selected`}>
        <div className="space-y-4">
          <div>
            <p className="eyebrow mb-2 text-muted-foreground">
              In this collection · in display order
            </p>
            {members.length === 0 ? (
              <p className="text-muted-foreground">
                None yet — add pieces from below.
              </p>
            ) : (
              <ul className="divide-y border">
                {members.map((id, i) => {
                  const p = productById.get(id);
                  if (!p) {
                    return null;
                  }
                  return (
                    <li key={id} className="flex items-center gap-3 px-3 py-2">
                      <span className="ledger w-6 text-right text-xs text-muted-foreground">
                        {i + 1}
                      </span>
                      <span className="ledger text-xs text-muted-foreground">
                        {p.sku}
                      </span>
                      <span className="truncate">{p.name}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <IconButton
                          label="Move up"
                          disabled={i === 0}
                          onClick={() => moveMember(i, -1)}
                        >
                          ↑
                        </IconButton>
                        <IconButton
                          label="Move down"
                          disabled={i === members.length - 1}
                          onClick={() => moveMember(i, 1)}
                        >
                          ↓
                        </IconButton>
                        <IconButton
                          label="Remove from collection"
                          onClick={() => removeMember(id)}
                        >
                          ✕
                        </IconButton>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div>
            <p className="eyebrow mb-2 text-muted-foreground">Add pieces</p>
            {available.length === 0 ? (
              <p className="text-muted-foreground">
                {products.length === 0
                  ? "No products yet."
                  : "All pieces are in this collection."}
              </p>
            ) : (
              <ul className="max-h-64 divide-y overflow-y-auto border">
                {available.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => addMember(p.id)}
                      className="flex w-full cursor-pointer items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <span className="eyebrow text-gold">+ Add</span>
                      <span className="ledger text-xs text-muted-foreground">
                        {p.sku}
                      </span>
                      <span className="truncate">{p.name}</span>
                      {!p.is_active && (
                        <span className="eyebrow ml-auto text-muted-foreground">
                          Hidden
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Section>

      {collection !== null && (
        <Section title="Visibility">
          <p className="flex items-center gap-2">
            <span className="eyebrow text-muted-foreground">
              Shop visibility
            </span>
            <span
              className={cn(
                "eyebrow rounded-xs border px-2 py-0.5",
                collection.is_active
                  ? "border-foreground/40"
                  : "border-border text-muted-foreground",
              )}
            >
              {collection.is_active ? "Active" : "Hidden"}
            </span>
          </p>
          {collection.is_active && !confirmingDeactivate && (
            <Button
              type="button"
              variant="destructive"
              onClick={() => setConfirmingDeactivate(true)}
            >
              Deactivate collection
            </Button>
          )}
          {collection.is_active && confirmingDeactivate && (
            <div className="space-y-3 border border-destructive p-4">
              <p>
                This collection will be hidden from the shop. Nothing is
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
          {!collection.is_active && (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={(e) => {
                intentRef.current = "reactivate";
                e.currentTarget.form?.requestSubmit();
              }}
            >
              Reactivate collection
            </Button>
          )}
        </Section>
      )}

      {bannerError !== null && (
        <p className="border border-destructive px-4 py-3 text-destructive">
          {bannerError}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving…"
          : collection !== null
            ? "Save collection"
            : "Create collection"}
      </Button>
    </form>
  );
}

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

/** Small square control for reorder/remove (↑ ↓ ✕). */
function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-xs border text-foreground transition-colors hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-30"
    >
      {children}
    </button>
  );
}

/** Textarea twin of `UnderlineField` (matches the product editor). */
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
