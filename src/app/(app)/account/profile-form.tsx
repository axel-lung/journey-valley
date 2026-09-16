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
          Enregistré.
        </p>
      )}

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Nom">
          <input name="name" required defaultValue={user.name} className={inputClass} />
        </Field>
        <Field label="E-mail" hint="C’est avec cet e-mail qu’on vous ajoute à un voyage.">
          <input value={user.email} readOnly className={`${inputClass} bg-stone-50 text-stone-500`} />
        </Field>
        <Field label="Ville de départ" hint="D’où partent vos voyages, en général.">
          <input name="home_city" defaultValue={user.home_city} placeholder="Lyon" className={inputClass} />
        </Field>
        <Field label="Devise" hint="Utilisée pour les totaux de tous vos voyages.">
          <select name="currency" defaultValue={user.currency} className={inputClass}>
            <option value="EUR">EUR €</option>
            <option value="USD">USD $</option>
            <option value="GBP">GBP £</option>
            <option value="CHF">CHF</option>
          </select>
        </Field>
      </div>

      <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  );
}
