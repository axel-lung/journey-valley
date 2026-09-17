"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, SuccessNotice, inputClass } from "@/components/ui";
import type { Agency } from "@/lib/types";
import { updateAgencyAction, type AgencyFormState } from "./actions";

/**
 * La fiche de l'agence : identité, mentions obligatoires, TVA, conditions.
 *
 * Tout ce qui est ici se retrouve sur chaque devis. C'est saisi une fois, et
 * c'est ce qui rend les documents conformes — d'où les explications à côté de
 * chaque champ plutôt qu'un formulaire administratif muet.
 */
export function AgencyForm({ agency }: { agency: Agency }) {
  const [state, action] = useActionState<AgencyFormState, FormData>(updateAgencyAction, {});

  return (
    <form action={action} className="space-y-5 px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nom commercial">
          <input name="name" required defaultValue={agency.name} className={inputClass} />
        </Field>
        <Field label="Raison sociale" hint="Telle qu'au registre du commerce.">
          <input name="legal_name" defaultValue={agency.legal_name} className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="E-mail">
          <input name="email" type="email" defaultValue={agency.email} className={inputClass} />
        </Field>
        <Field label="Téléphone">
          <input name="phone" defaultValue={agency.phone} className={inputClass} />
        </Field>
      </div>

      <Field
        label="Immatriculation Atout France"
        hint="Le numéro IM…, obligatoire sur vos documents commerciaux."
      >
        <input
          name="registration"
          placeholder="IM075000000"
          defaultValue={agency.registration}
          className={inputClass}
        />
      </Field>

      <Field
        label="Garantie financière"
        hint="Le garant et son adresse : c'est lui qui rembourse les fonds en cas de défaillance. Le formulaire d'information standardisé doit le nommer."
      >
        <input
          name="financial_guarantee"
          placeholder="APST, 15 avenue Carnot, 75017 Paris"
          defaultValue={agency.financial_guarantee}
          className={inputClass}
        />
      </Field>

      <Field
        label="Responsabilité civile professionnelle"
        hint="Assureur et numéro de contrat."
      >
        <input
          name="liability_insurance"
          placeholder="Allianz — contrat n° 123456"
          defaultValue={agency.liability_insurance}
          className={inputClass}
        />
      </Field>

      <Field
        label="Médiateur de la consommation"
        hint="Laissez vide pour Médiation Tourisme et Voyage, dont relèvent la plupart des agences."
      >
        <input name="mediator" defaultValue={agency.mediator} className={inputClass} />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Marge visée (%)" hint="Guide l'assistant de prix.">
          <input
            name="target_margin_percent"
            type="number"
            min={0}
            max={90}
            defaultValue={agency.target_margin_percent}
            className={inputClass}
          />
        </Field>
        <Field label="Taux de TVA (%)" hint="Appliqué à la marge.">
          <input
            name="vat_rate"
            type="number"
            min={0}
            max={30}
            defaultValue={agency.vat_rate}
            className={inputClass}
          />
        </Field>
        <Field label="Régime" hint="Décochez en franchise en base.">
          <label className="flex items-center gap-2.5 py-2.5 text-sm text-stone-700">
            <input
              type="checkbox"
              name="vat_on_margin"
              defaultChecked={agency.vat_on_margin === 1}
              className="h-4 w-4 rounded border-stone-300"
            />
            TVA sur marge
          </label>
        </Field>
      </div>

      <Field
        label="Conditions de vente"
        hint="Reprises par défaut sur chaque devis ; modifiables dossier par dossier."
      >
        <textarea name="terms" rows={5} defaultValue={agency.terms} className={inputClass} />
      </Field>

      <ErrorNotice message={state.error} />
      <SuccessNotice message={state.saved ? "Fiche agence enregistrée." : undefined} />
      <SubmitButton pendingLabel="Enregistrement…">Enregistrer</SubmitButton>
    </form>
  );
}
