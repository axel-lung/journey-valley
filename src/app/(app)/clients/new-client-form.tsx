"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { createClientAction, type ClientFormState } from "./actions";

export function NewClientForm() {
  const [state, action] = useActionState<ClientFormState, FormData>(createClientAction, {});

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <Field label="Nom">
        <input name="name" required placeholder="Famille Berger" className={inputClass} />
      </Field>
      <Field label="E-mail" hint="Nécessaire plus tard pour lui ouvrir son espace voyageur.">
        <input name="email" type="email" placeholder="berger@example.com" className={inputClass} />
      </Field>
      <Field label="Téléphone">
        <input name="phone" placeholder="06 12 34 56 78" className={inputClass} />
      </Field>
      <Field label="Notes" hint="Préférences, anniversaires, allergies — ce qui fait revenir.">
        <textarea name="notes" rows={3} className={inputClass} />
      </Field>

      <ErrorNotice message={state.error} />
      <SubmitButton pendingLabel="Création…">Créer le client</SubmitButton>
    </form>
  );
}
