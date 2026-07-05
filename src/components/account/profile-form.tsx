"use client";

import { useActionState } from "react";
import { updateCustomerProfile } from "@/app/actions/customer";
import { UnderlineField } from "@/components/auth/underline-field";
import { Button } from "@/components/ui/button";
import type { ActionResult } from "@/app/actions/admin-guard";

type State = ActionResult<void> | null;

export function ProfileForm({
  defaultName,
  defaultPhone,
}: {
  defaultName?: string | null;
  defaultPhone?: string | null;
}) {
  const [state, action, pending] = useActionState<State, FormData>(
    async (_prev, fd) => {
      return updateCustomerProfile({
        full_name: fd.get("full_name") as string || undefined,
        phone: fd.get("phone") as string || undefined,
      });
    },
    null,
  );

  return (
    <form action={action} className="mt-4 flex flex-col gap-4">
      <UnderlineField
        name="full_name"
        label="Name"
        autoComplete="name"
        defaultValue={defaultName ?? undefined}
      />
      <UnderlineField
        name="phone"
        label="Phone"
        type="tel"
        autoComplete="tel"
        defaultValue={defaultPhone ?? undefined}
      />
      {state?.ok === false && state.code === "error" && (
        <p className="text-xs text-destructive">{state.message}</p>
      )}
      {state?.ok === true && (
        <p className="eyebrow text-xs text-gold">Saved</p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}
