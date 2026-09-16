"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { addExpenseAction, type FormState } from "../actions";

const CATEGORIES = [
  { value: "food", label: "Nourriture et boissons" },
  { value: "transport", label: "Transports sur place" },
  { value: "lodging", label: "Hébergement" },
  { value: "activities", label: "Activités" },
  { value: "shopping", label: "Achats" },
  { value: "other", label: "Divers" },
] as const;

export function ExpenseForm({
  tripId,
  currency,
  defaultDate,
  members,
  currentUserId,
}: {
  tripId: number;
  currency: string;
  defaultDate: string;
  members: Array<{ user_id: number; name: string }>;
  currentUserId: number;
}) {
  const [state, action] = useActionState<FormState, FormData>(addExpenseAction, {});
  const [shared, setShared] = useState(true);
  // Everyone is ticked by default, which is what "partagée" means most of the time.
  const [participants, setParticipants] = useState<number[]>(() =>
    members.map((member) => member.user_id),
  );
  const error = (field: string) => state.fieldErrors?.[field];

  const toggle = (userId: number) => {
    setParticipants((current) =>
      current.includes(userId)
        ? current.filter((entry) => entry !== userId)
        : [...current, userId],
    );
  };

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="trip_id" value={tripId} />
      <ErrorNotice message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Catégorie">
          <select name="category" defaultValue="food" className={inputClass}>
            {CATEGORIES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Montant (${currency})`} hint={error("amount")}>
          <input name="amount" required inputMode="decimal" placeholder="42,50" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Quand" hint={error("spent_on")}>
          <input
            name="spent_on"
            type="date"
            required
            defaultValue={defaultDate}
            className={inputClass}
          />
        </Field>
        <Field label="Qui a payé">
          <select name="paid_by" defaultValue={String(currentUserId)} className={inputClass}>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.user_id === currentUserId ? `${member.name} (vous)` : member.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="C'était quoi" hint={error("description")}>
        <input name="description" required placeholder="Dîner à Bergen" className={inputClass} />
      </Field>

      <Field label="Justificatif" hint="Un nom de fichier ou une référence, pour l'instant.">
        <input name="receipt_name" placeholder="diner-bergen.jpg" className={inputClass} />
      </Field>

      <div className="rounded-xl bg-stone-50 px-4 py-3.5">
        <label className="flex items-center gap-2.5 text-sm font-medium text-stone-800">
          <input
            type="checkbox"
            name="shared"
            checked={shared}
            onChange={(event) => setShared(event.target.checked)}
            className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-200"
          />
          Dépense partagée
        </label>

        {shared && members.length > 1 && (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Qui participe
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {members.map((member) => {
                const on = participants.includes(member.user_id);
                return (
                  <label
                    key={member.user_id}
                    className={`cursor-pointer rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset transition ${
                      on
                        ? "bg-brand-600 text-white ring-brand-600"
                        : "bg-white text-stone-600 ring-stone-300"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="participants"
                      value={member.user_id}
                      checked={on}
                      onChange={() => toggle(member.user_id)}
                      className="sr-only"
                    />
                    {member.user_id === currentUserId ? "Vous" : member.name}
                  </label>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-stone-500">
              {participants.length === 0 || participants.length === members.length
                ? "Partagée entre tout le monde."
                : `Partagée entre ${participants.length} personne${participants.length > 1 ? "s" : ""}.`}
            </p>
          </div>
        )}

        {!shared && (
          <p className="mt-2 text-xs text-stone-500">
            Dépense personnelle : elle compte dans le budget du voyage, mais reste à la charge de
            celui qui a payé.
          </p>
        )}
      </div>

      <SubmitButton pendingLabel="Ajout…">Ajouter la dépense</SubmitButton>
    </form>
  );
}
