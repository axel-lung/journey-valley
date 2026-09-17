"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { createQuoteAction, type QuoteFormState } from "./actions";

/** Le devis se compose tout seul à partir du dossier ; ceci l'habille. */
export function NewQuoteForm({
  tripId,
  currency,
  defaultTermsText,
}: {
  tripId: number;
  currency: string;
  defaultTermsText: string;
}) {
  const [state, action] = useActionState<QuoteFormState, FormData>(createQuoteAction, {});

  // Trente jours : assez pour laisser réfléchir, assez court pour que les prix
  // tiennent encore.
  const inAMonth = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="trip_id" value={tripId} />

      <Field
        label="Mot d'introduction"
        hint="La phrase que le client lit en premier. Facultative, mais c'est elle qui fait la différence avec un tableur."
      >
        <textarea
          name="intro"
          rows={3}
          placeholder="Comme convenu, voici votre séjour à Kyoto en pleine saison des érables…"
          className={inputClass}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Acompte (%)" hint="Appelé à la confirmation.">
          <input
            name="deposit_percent"
            type="number"
            min={0}
            max={100}
            defaultValue={30}
            className={inputClass}
          />
        </Field>
        <Field label="Valable jusqu'au" hint="Au-delà, le client ne peut plus accepter en ligne.">
          <input name="valid_until" type="date" defaultValue={inAMonth} className={inputClass} />
        </Field>
      </div>

      <Field
        label="Conditions"
        hint={`Reprises telles quelles sur le devis. Laissez vide pour les conditions par défaut (${currency}).`}
      >
        <textarea name="terms" rows={4} defaultValue={defaultTermsText} className={inputClass} />
      </Field>

      <ErrorNotice message={state.error} />
      <SubmitButton pendingLabel="Préparation…">Préparer le devis</SubmitButton>
    </form>
  );
}
