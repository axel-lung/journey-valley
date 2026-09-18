"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { PURCHASE_CURRENCIES } from "@/lib/exchange";
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
  // Replié par défaut : la plupart des achats se règlent dans la devise du
  // dossier, et un champ de plus sur chaque ligne ralentirait tout le monde.
  const [foreign, setForeign] = useState(false);
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
        <Field
          label={`Coût d'achat (${currency})`}
          hint={error("amount") ?? (foreign ? `Ce qui a été débité de votre compte, en ${currency}.` : "Ce que vous payez au fournisseur.")}
        >
          <input name="amount" required inputMode="decimal" placeholder="624" className={inputClass} />
        </Field>
        <Field
          label={`Prix de vente (${currency})`}
          hint={error("agency_quote") ?? "Ce que le client paie pour cette ligne. Vide = pas encore fixé."}
        >
          <input name="agency_quote" inputMode="decimal" placeholder="790" className={inputClass} />
        </Field>
      </div>

      {foreign ? (
        <div className="grid gap-4 rounded-xl bg-stone-50 px-4 py-3 sm:grid-cols-2">
          <Field
            label="Facturé par le fournisseur"
            hint={error("foreign_amount") ?? "Le montant de sa facture, dans sa devise."}
          >
            <input
              name="foreign_amount"
              inputMode="decimal"
              placeholder="45000"
              className={inputClass}
            />
          </Field>
          <Field
            label="Devise"
            hint={
              error("foreign_currency") ??
              `Le taux se déduit des deux montants : pas de taux à saisir, c'est votre relevé qui fait foi.`
            }
          >
            <select name="foreign_currency" defaultValue="USD" className={inputClass}>
              {PURCHASE_CURRENCIES.filter((code) => code !== currency).map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="button"
            onClick={() => setForeign(false)}
            className="justify-self-start text-xs text-stone-400 hover:text-stone-700"
          >
            Cet achat est en {currency}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setForeign(true)}
          className="text-xs font-semibold text-brand-700 hover:underline"
        >
          Cet achat a été facturé dans une autre devise
        </button>
      )}

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
