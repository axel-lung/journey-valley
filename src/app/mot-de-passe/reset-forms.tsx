"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { requestResetAction, setPasswordAction, type ResetState } from "./actions";

const fullWidthButton =
  "w-full justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-60";

export function RequestResetForm() {
  const [state, action] = useActionState<ResetState, FormData>(requestResetAction, {});

  if (state.done) {
    return (
      <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200 ring-inset">
        Si un compte existe avec cette adresse, un lien vient de partir. Il est valable une heure.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <ErrorNotice message={state.error} />
      <Field label="E-mail">
        <input name="email" type="email" autoComplete="username" required className={inputClass} />
      </Field>
      <SubmitButton className={fullWidthButton} pendingLabel="Envoi…">
        Envoyer le lien
      </SubmitButton>
    </form>
  );
}

export function SetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState<ResetState, FormData>(setPasswordAction, {});

  return (
    <form action={action} className="space-y-4">
      <ErrorNotice message={state.error} />
      <input type="hidden" name="token" value={token} />
      <Field label="Nouveau mot de passe" hint="Au moins 8 caractères.">
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className={inputClass}
        />
      </Field>
      <SubmitButton className={fullWidthButton} pendingLabel="Enregistrement…">
        Choisir ce mot de passe
      </SubmitButton>
    </form>
  );
}
