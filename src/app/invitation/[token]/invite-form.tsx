"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { acceptInviteAction, type InviteState } from "./actions";

export function AcceptInviteForm({ token, name }: { token: string; name: string }) {
  const [state, action] = useActionState<InviteState, FormData>(acceptInviteAction, {});

  return (
    <form action={action} className="space-y-4">
      <ErrorNotice message={state.error} />
      <input type="hidden" name="token" value={token} />

      <Field label="Votre prénom et nom">
        <input name="name" required defaultValue={name} autoComplete="name" className={inputClass} />
      </Field>

      <Field label="Mot de passe" hint="Au moins 8 caractères.">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={inputClass}
        />
      </Field>

      <SubmitButton
        className="w-full justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60"
        pendingLabel="Création…"
      >
        Ouvrir mon accès
      </SubmitButton>
    </form>
  );
}
