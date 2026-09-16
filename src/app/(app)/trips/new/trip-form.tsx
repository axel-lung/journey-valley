"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { createTripAction, type FormState } from "../actions";

export function TripForm({ currency }: { currency: string }) {
  const [state, action] = useActionState<FormState, FormData>(createTripAction, {});
  const error = (field: string) => state.fieldErrors?.[field];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-5">
      <ErrorNotice message={state.error} />

      <Field label="Comment vous l'appelez ?" hint={error("title")}>
        <input
          name="title"
          required
          placeholder="Road trip dans les fjords norvégiens"
          className={inputClass}
        />
      </Field>

      <Field
        label="L'idée"
        hint={error("summary") ?? "Une phrase pour vous rappeler pourquoi ce voyage existe."}
      >
        <textarea
          name="summary"
          rows={2}
          placeholder="Bergen → Ålesund en voiture, cinq étapes, sans car de tourisme."
          className={inputClass}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Ville" hint={error("destination_city")}>
          <input name="destination_city" required placeholder="Bergen" className={inputClass} />
        </Field>
        <Field label="Pays" hint={error("destination_country")}>
          <input name="destination_country" required placeholder="Norvège" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Départ" hint={error("start_date")}>
          <input name="start_date" type="date" required defaultValue={today} className={inputClass} />
        </Field>
        <Field label="Retour" hint={error("end_date")}>
          <input name="end_date" type="date" required defaultValue={today} className={inputClass} />
        </Field>
        <Field label="Voyageurs" hint={error("travellers")}>
          <input
            name="travellers"
            type="number"
            min={1}
            max={20}
            defaultValue={1}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={`Budget (${currency})`}
          hint={error("budget") ?? "Facultatif. Ce que vous préférez ne pas dépasser."}
        >
          <input name="budget" inputMode="decimal" placeholder="2 100" className={inputClass} />
        </Field>

        <Field
          label={`Devis agence (${currency})`}
          hint={
            error("agency_quote") ??
            "Facultatif, et c'est tout l'intérêt : le prix du même voyage en formule tout compris."
          }
        >
          <input name="agency_quote" inputMode="decimal" placeholder="2 890" className={inputClass} />
        </Field>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <SubmitButton pendingLabel="Création…">Créer le voyage</SubmitButton>
        <p className="text-xs text-stone-500">
          Il démarre comme une idée — réservations, compagnons et checklist viendront après.
        </p>
      </div>
    </form>
  );
}
