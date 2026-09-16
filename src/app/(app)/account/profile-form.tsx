"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import type { User } from "@/lib/types";
import { updateProfileAction, type AccountState } from "./actions";

export function ProfileForm({ user }: { user: User }) {
  const [state, action] = useActionState<AccountState, FormData>(updateProfileAction, {});

  return (
    <form action={action} className="space-y-5 px-5 py-5">
      <ErrorNotice message={state.error} />
      {state.saved && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200 ring-inset">
          Saved.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name">
          <input name="name" required defaultValue={user.name} className={inputClass} />
        </Field>
        <Field label="Email" hint="Companions use this to add you to their trips.">
          <input value={user.email} readOnly className={`${inputClass} bg-slate-50 text-slate-500`} />
        </Field>
        <Field label="Home city" hint="Where your trips usually start from.">
          <input name="home_city" defaultValue={user.home_city} placeholder="Lyon" className={inputClass} />
        </Field>
        <Field label="Currency" hint="Used for totals across trips.">
          <select name="currency" defaultValue={user.currency} className={inputClass}>
            <option value="EUR">EUR €</option>
            <option value="USD">USD $</option>
            <option value="GBP">GBP £</option>
            <option value="CHF">CHF</option>
          </select>
        </Field>
      </div>

      <SubmitButton pendingLabel="Saving…">Save changes</SubmitButton>
    </form>
  );
}
