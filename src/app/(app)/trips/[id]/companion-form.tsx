"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, inputClass } from "@/components/ui";
import { addCompanionAction, type FormState } from "../actions";

export function CompanionForm({ tripId }: { tripId: number }) {
  const [state, action] = useActionState<FormState, FormData>(addCompanionAction, {});

  return (
    <form action={action} className="space-y-3 border-t border-stone-100 px-5 py-4">
      <input type="hidden" name="trip_id" value={tripId} />
      <ErrorNotice message={state.error ?? state.fieldErrors?.email} />

      <div className="flex flex-wrap gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="son@email.com"
          className={`${inputClass} sm:w-64`}
        />
        <SubmitButton pendingLabel="Ajout…">Inviter</SubmitButton>
      </div>
      <p className="text-xs leading-relaxed text-stone-500">
        La personne voit le voyage, peut ajouter réservations et dépenses, et compte dans le
        partage des frais.
      </p>
    </form>
  );
}
