"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  upsertAddress,
  deleteAddress,
  setDefaultAddress,
} from "@/app/actions/addresses";
import { UnderlineField } from "@/components/auth/underline-field";
import { Button } from "@/components/ui/button";

type AddressRow = {
  id: string;
  full_name: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  is_default: boolean;
};
type FormValues = Omit<AddressRow, "id" | "line2"> & { line2: string };

const emptyForm: FormValues = {
  full_name: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postal_code: "",
  country: "India",
  is_default: false,
};
const toForm = (a: AddressRow): FormValues => ({
  full_name: a.full_name,
  phone: a.phone,
  line1: a.line1,
  line2: a.line2 ?? "",
  city: a.city,
  state: a.state,
  postal_code: a.postal_code,
  country: a.country,
  is_default: a.is_default,
});

/**
 * Account address book (PRD 08). Lists saved addresses with edit / delete /
 * set-default, plus an add/edit form. Mutations call the owner-scoped Server
 * Actions then `router.refresh()` to re-read the server list.
 */
export function AddressBook({ addresses }: { addresses: AddressRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [values, setValues] = useState<FormValues>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof FormValues>(k: K, v: FormValues[K]) =>
    setValues((s) => ({ ...s, [k]: v }));
  const err = (p: string): string | undefined => fieldErrors[p]?.[0];

  const startAdd = () => {
    setValues(emptyForm);
    setFieldErrors({});
    setBanner(null);
    setEditing("new");
  };
  const startEdit = (a: AddressRow) => {
    setValues(toForm(a));
    setFieldErrors({});
    setBanner(null);
    setEditing(a.id);
  };
  const cancel = () => {
    setEditing(null);
    setFieldErrors({});
    setBanner(null);
  };

  const save = () =>
    startTransition(async () => {
      setFieldErrors({});
      setBanner(null);
      const res = await upsertAddress({
        ...values,
        line2: values.line2.trim() === "" ? undefined : values.line2,
        ...(editing !== "new" && editing ? { id: editing } : {}),
      });
      if (res.ok) {
        setEditing(null);
        router.refresh();
      } else if (res.code === "invalid") {
        setFieldErrors(res.fieldErrors);
      } else {
        setBanner(res.code === "unauthorized" ? "Please sign in." : res.message);
      }
    });

  const remove = (id: string) =>
    startTransition(async () => {
      setBanner(null);
      const res = await deleteAddress(id);
      if (res.ok) {
        router.refresh();
      } else {
        setBanner(
          res.code === "unauthorized" ? "Please sign in." : "Could not delete.",
        );
      }
    });

  const makeDefault = (id: string) =>
    startTransition(async () => {
      setBanner(null);
      const res = await setDefaultAddress(id);
      if (res.ok) {
        router.refresh();
      } else {
        setBanner("Could not set default.");
      }
    });

  return (
    <div className="mt-10 space-y-6">
      {banner !== null && (
        <p className="border border-destructive px-4 py-3 text-destructive">
          {banner}
        </p>
      )}

      {addresses.length === 0 && editing === null && (
        <p className="text-muted-foreground">No saved addresses yet.</p>
      )}

      <ul className="space-y-4">
        {addresses.map((a) => (
          <li key={a.id} className="border p-4">
            <p className="flex items-center gap-2">
              <span className="font-medium">{a.full_name}</span>
              {a.is_default && (
                <span className="eyebrow rounded-xs border border-gold px-2 py-0.5 text-gold">
                  Default
                </span>
              )}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {a.line1}
              {a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state}{" "}
              {a.postal_code}, {a.country}
            </p>
            <p className="ledger mt-1 text-xs text-muted-foreground">
              {a.phone}
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <button
                type="button"
                onClick={() => startEdit(a)}
                className="eyebrow border-b border-foreground pb-px transition-colors hover:border-gold hover:text-gold"
              >
                Edit
              </button>
              {!a.is_default && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => makeDefault(a.id)}
                  className="eyebrow border-b border-transparent pb-px text-muted-foreground transition-colors hover:border-gold hover:text-gold"
                >
                  Set default
                </button>
              )}
              <button
                type="button"
                disabled={pending}
                onClick={() => remove(a.id)}
                className="eyebrow border-b border-transparent pb-px text-destructive transition-colors hover:border-destructive"
              >
                Delete
              </button>
            </div>
          </li>
        ))}
      </ul>

      {editing === null ? (
        <Button type="button" variant="outline" onClick={startAdd}>
          Add address
        </Button>
      ) : (
        <div className="border p-5">
          <h2 className="eyebrow text-muted-foreground">
            {editing === "new" ? "New address" : "Edit address"}
          </h2>
          <div className="mt-4 space-y-4">
            <UnderlineField
              label="Full name"
              value={values.full_name}
              onChange={(e) => set("full_name", e.target.value)}
              error={err("full_name")}
            />
            <UnderlineField
              label="Phone"
              value={values.phone}
              onChange={(e) => set("phone", e.target.value)}
              error={err("phone")}
            />
            <UnderlineField
              label="Address line 1"
              value={values.line1}
              onChange={(e) => set("line1", e.target.value)}
              error={err("line1")}
            />
            <UnderlineField
              label="Address line 2 (optional)"
              value={values.line2}
              onChange={(e) => set("line2", e.target.value)}
              error={err("line2")}
            />
            <div className="grid grid-cols-2 gap-4">
              <UnderlineField
                label="City"
                value={values.city}
                onChange={(e) => set("city", e.target.value)}
                error={err("city")}
              />
              <UnderlineField
                label="State"
                value={values.state}
                onChange={(e) => set("state", e.target.value)}
                error={err("state")}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <UnderlineField
                label="PIN code"
                inputMode="numeric"
                value={values.postal_code}
                onChange={(e) => set("postal_code", e.target.value)}
                error={err("postal_code")}
              />
              <UnderlineField
                label="Country"
                value={values.country}
                onChange={(e) => set("country", e.target.value)}
                error={err("country")}
              />
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={values.is_default}
                onChange={(e) => set("is_default", e.target.checked)}
                className="accent-gold"
              />
              <span className="eyebrow text-muted-foreground">
                Set as default
              </span>
            </label>
          </div>
          <div className="mt-5 flex gap-3">
            <Button type="button" disabled={pending} onClick={save}>
              {pending ? "Saving…" : "Save address"}
            </Button>
            <Button type="button" variant="outline" onClick={cancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
