"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass, secondaryButtonClass } from "@/components/ui";
import { decideQuoteAction, type DecideState } from "./actions";

/**
 * Accepter ou décliner, depuis le lien public.
 *
 * Le nom saisi n'est pas une formalité : avec l'horodatage et l'adresse IP
 * enregistrés côté serveur, c'est ce qui permet à l'agence de prouver que
 * l'offre a été acceptée, et par qui.
 */
export function DecideForm({ token }: { token: string }) {
  const [state, action] = useActionState<DecideState, FormData>(decideQuoteAction, {});
  const [declining, setDeclining] = useState(false);

  return (
    <form action={action} className="mt-4 space-y-4">
      <input type="hidden" name="token" value={token} />

      <Field label="Votre nom" hint="Il figurera sur la trace de votre accord.">
        <input name="name" required placeholder="Sam Ortega" className={inputClass} />
      </Field>

      <Field label={declining ? "Ce qui ne va pas" : "Un mot pour votre conseiller (facultatif)"}>
        <textarea
          name="note"
          rows={2}
          placeholder={
            declining ? "Le budget est un peu au-dessus…" : "Hâte d'y être !"
          }
          className={inputClass}
        />
      </Field>

      <ErrorNotice message={state.error} />

      <div className="flex flex-wrap gap-2">
        <SubmitButton name="decision" value="accept" pendingLabel="Envoi…">
          J'accepte ce devis
        </SubmitButton>
        <SubmitButton
          name="decision"
          value="decline"
          className={secondaryButtonClass}
          pendingLabel="Envoi…"
          onClick={() => setDeclining(true)}
        >
          Je décline
        </SubmitButton>
      </div>
    </form>
  );
}
