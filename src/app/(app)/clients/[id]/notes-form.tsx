"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import type { Client } from "@/lib/types";
import { updateClientAction, type ClientFormState } from "../actions";

export function ClientNotesForm({ client }: { client: Client }) {
  const [state, action] = useActionState<ClientFormState, FormData>(updateClientAction, {});

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="client_id" value={client.id} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom">
          <input name="name" required defaultValue={client.name} className={inputClass} />
        </Field>
        <Field label="Téléphone">
          <input name="phone" defaultValue={client.phone} className={inputClass} />
        </Field>
      </div>
      <Field label="E-mail">
        <input name="email" type="email" defaultValue={client.email} className={inputClass} />
      </Field>
      <Field label="Notes">
        <textarea name="notes" rows={4} defaultValue={client.notes} className={inputClass} />
      </Field>

      <ErrorNotice message={state.error} />
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  );
}
