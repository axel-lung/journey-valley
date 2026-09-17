"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { addBookingAction, type FormState } from "../actions";

const TYPES = [
  { value: "flight", label: "Vol" },
  { value: "stay", label: "Logement" },
  { value: "transport", label: "Train, voiture, ferry" },
  { value: "activity", label: "Activité" },
  { value: "other", label: "Autre" },
] as const;

export function BookingForm({
  tripId,
  currency,
  defaultDate,
}: {
  tripId: number;
  currency: string;
  defaultDate: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(addBookingAction, {});
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("flight");
  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="trip_id" value={tripId} />
      <ErrorNotice message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="De quoi s'agit-il">
          <select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
            className={inputClass}
          >
            {TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Réservé chez" hint={error("vendor")}>
          <input name="vendor" required placeholder="Norwegian" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Coût d'achat (${currency})`} hint={error("amount") ?? "Ce que vous payez au fournisseur."}>
          <input name="amount" required inputMode="decimal" placeholder="624" className={inputClass} />
        </Field>
        <Field
          label={`Prix de vente (${currency})`}
          hint={error("agency_quote") ?? "Ce que le client paie pour cette ligne. Vide = pas encore fixé."}
        >
          <input name="agency_quote" inputMode="decimal" placeholder="790" className={inputClass} />
        </Field>
      </div>

      <Field
        label="Prestation exécutée"
        hint={
          error("zone") ??
          "Décide de la TVA sur marge : la part hors UE en est exonérée, et la ventilation se fait au prorata des achats."
        }
      >
        <select name="zone" defaultValue="eu" className={inputClass}>
          <option value="eu">Dans l'Union européenne</option>
          <option value="non_eu">Hors UE</option>
        </select>
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="À partir du" hint={error("start_at")}>
          <input
            name="start_at"
            type="date"
            required
            defaultValue={defaultDate}
            className={inputClass}
          />
        </Field>
        {type === "stay" ? (
          <Field label="Nuits" hint="Permet d'afficher le prix par nuit.">
            <input name="nights" type="number" min={1} defaultValue={1} className={inputClass} />
          </Field>
        ) : (
          <Field label="Jusqu'au" hint={error("end_at")}>
            <input name="end_at" type="date" className={inputClass} />
          </Field>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Référence" hint={error("reference")}>
          <input name="reference" placeholder="DY1451" className={inputClass} />
        </Field>
        <Field label="Notes" hint={error("description")}>
          <input
            name="description"
            placeholder="LYS → BGO aller-retour, trois places"
            className={inputClass}
          />
        </Field>
      </div>

      <SubmitButton pendingLabel="Ajout…">Ajouter au voyage</SubmitButton>
    </form>
  );
}
