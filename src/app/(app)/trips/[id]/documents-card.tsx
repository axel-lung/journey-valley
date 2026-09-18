"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, ErrorNotice, Field, inputClass } from "@/components/ui";
import { formatBytes, VISIBILITY_HINT, VISIBILITY_LABEL } from "@/lib/attachments";
import type { Attachment } from "@/lib/attachments-store";
import { formatDate } from "@/lib/format";
import {
  deleteAttachmentAction,
  setAttachmentVisibilityAction,
  uploadAttachmentAction,
  type AttachmentState,
} from "./attachments-actions";

/**
 * Les pièces du dossier, côté conseiller.
 *
 * Chaque ligne dit à qui elle est visible, et le bouton bascule. C'est la
 * seule décision qui compte ici : une facture fournisseur porte un prix
 * d'achat, elle ne sort pas ; un billet se remet.
 */
export function DocumentsCard({
  tripId,
  attachments,
}: {
  tripId: number;
  attachments: Attachment[];
}) {
  const [state, action] = useActionState<AttachmentState, FormData>(uploadAttachmentAction, {});

  return (
    <Card title={`Pièces du dossier (${attachments.length})`}>
      <form action={action} className="space-y-3 border-b border-stone-100 px-5 py-4">
        <ErrorNotice message={state.error} />
        <input type="hidden" name="trip_id" value={tripId} />

        <Field label="Ajouter une pièce" hint="PDF, image ou texte, jusqu'à 10 Mo.">
          <input
            type="file"
            name="file"
            required
            accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.txt"
            className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700 hover:file:bg-stone-200"
          />
        </Field>

        <Field label="Qui la voit ?" hint={VISIBILITY_HINT.agency}>
          <select name="visibility" defaultValue="agency" className={inputClass}>
            <option value="agency">{VISIBILITY_LABEL.agency}</option>
            <option value="traveller">{VISIBILITY_LABEL.traveller}</option>
          </select>
        </Field>

        <SubmitButton pendingLabel="Dépôt…">Déposer</SubmitButton>
      </form>

      {attachments.length === 0 ? (
        <p className="px-5 py-6 text-sm text-stone-500">
          Aucune pièce pour l'instant. Déposez les vouchers et les billets : le voyageur les
          retrouve dans son espace et dans l'application.
        </p>
      ) : (
        <ul className="divide-y divide-stone-100">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <a
                  href={`/pieces/${attachment.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-stone-900 hover:underline"
                >
                  {attachment.name}
                </a>
                <p className="text-xs text-stone-500">
                  {formatBytes(attachment.size_bytes)} · déposée le{" "}
                  {formatDate(attachment.created_at.slice(0, 10))}
                </p>
              </div>

              <Badge
                className={
                  attachment.visibility === "traveller"
                    ? "bg-emerald-100 text-emerald-800 ring-transparent"
                    : "bg-stone-100 text-stone-600 ring-stone-200"
                }
              >
                {VISIBILITY_LABEL[attachment.visibility]}
              </Badge>

              <form action={setAttachmentVisibilityAction}>
                <input type="hidden" name="attachment_id" value={attachment.id} />
                <input
                  type="hidden"
                  name="visibility"
                  value={attachment.visibility === "traveller" ? "agency" : "traveller"}
                />
                <button
                  type="submit"
                  className="text-xs font-semibold text-brand-700 hover:underline"
                >
                  {attachment.visibility === "traveller" ? "Retirer au voyageur" : "Remettre au voyageur"}
                </button>
              </form>

              <form action={deleteAttachmentAction}>
                <input type="hidden" name="attachment_id" value={attachment.id} />
                <button type="submit" className="text-xs text-stone-400 hover:text-rose-600">
                  Supprimer
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
