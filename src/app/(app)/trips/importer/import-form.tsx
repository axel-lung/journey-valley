"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, ErrorNotice, Field, inputClass } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import type { EntryKind } from "@/lib/import/parse";
import {
  createFromImportAction,
  readProgrammeAction,
  type ImportState,
} from "./actions";

const KIND_LABEL: Record<EntryKind, string> = {
  flight: "Vol",
  stay: "Logement",
  transport: "Transport",
  activity: "Activité",
  other: "Autre",
};

const KIND_TONE: Record<EntryKind, string> = {
  flight: "bg-sky-100 text-sky-800 ring-transparent",
  stay: "bg-violet-100 text-violet-800 ring-transparent",
  transport: "bg-amber-100 text-amber-800 ring-transparent",
  activity: "bg-emerald-100 text-emerald-800 ring-transparent",
  other: "bg-stone-100 text-stone-600 ring-stone-200",
};

/** Ce qui a été deviné se dit, comme partout ailleurs dans le produit. */
function Guessed({ shown }: { shown: boolean }) {
  if (!shown) return null;
  return (
    <span className="ml-1 text-xs font-normal text-amber-700" title="Deviné : à vérifier">
      supposé
    </span>
  );
}

export function ImportForm({ clients }: { clients: Array<{ id: number; name: string }> }) {
  const [read, readAction] = useActionState<ImportState, FormData>(readProgrammeAction, {});

  return (
    <div className="space-y-6">
      <Card title="Votre programme">
        <form action={readAction} className="space-y-4 px-5 py-4">
          <ErrorNotice message={read.error} />

          <Field
            label="Le fichier que vous avez déjà"
            hint="PDF, Word, ou un e-mail enregistré. Jusqu'à 8 Mo."
          >
            <input
              type="file"
              name="file"
              accept=".pdf,.docx,.txt,.eml,.md"
              className="block w-full text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-stone-100 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-stone-700 hover:file:bg-stone-200"
            />
          </Field>

          <Field
            label="…ou collez-le ici"
            hint="Ce qui marche toujours, y compris quand le PDF est un scan."
          >
            <textarea
              name="pasted"
              rows={6}
              defaultValue={read.source ?? ""}
              placeholder={"Jour 1 – 12 octobre : Paris → Marrakech\n• Vol AF 1796\n• Nuit au Riad Kniza"}
              className={inputClass}
            />
          </Field>

          <SubmitButton pendingLabel="Lecture…">Lire le programme</SubmitButton>
        </form>
      </Card>

      {read.programme && <Preview state={read} clients={clients} />}
    </div>
  );
}

function Preview({
  state,
  clients,
}: {
  state: ImportState;
  clients: Array<{ id: number; name: string }>;
}) {
  const programme = state.programme!;
  const [create, createAction] = useActionState<ImportState, FormData>(
    createFromImportAction,
    {},
  );

  // Décocher une ligne suffit à l'écarter : c'est le geste le plus fréquent,
  // il ne doit pas demander de suppression.
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const keyOf = (day: number, index: number) => `${day}:${index}`;

  const kept = programme.days.flatMap((day, dayIndex) =>
    day.entries
      .map((entry, index) => ({ entry, key: keyOf(dayIndex, index), date: day.date }))
      .filter(({ key }) => !dropped.has(key))
      .map(({ entry, date }) => ({
        kind: entry.kind,
        label: entry.label,
        date: date ?? "",
        reference: entry.reference ?? "",
        nights: entry.nights ?? 0,
      })),
  );

  return (
    <form action={createAction} className="space-y-6">
      <ErrorNotice message={create.error} />
      <input type="hidden" name="entries" value={JSON.stringify(kept)} />

      <Card title="Ce que nous avons lu">
        <p className="border-b border-stone-100 px-5 py-3 text-sm text-stone-600">
          {state.coverage?.matched ?? 0} prestations rattachées sur{" "}
          {state.coverage?.total ?? 0} lignes lues. Corrigez ce qu'il faut : rien n'est
          enregistré tant que vous n'avez pas créé le dossier.
        </p>

        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Field label={<>Titre<Guessed shown={programme.confidence.title === "guess"} /></>}>
            <input name="title" required defaultValue={programme.title} className={inputClass} />
          </Field>
          <Field label="Pour quel client ?">
            <select name="client_id" defaultValue="" className={inputClass}>
              <option value="">À rattacher plus tard</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label={
              <>Ville<Guessed shown={programme.confidence.destination_city === "guess"} /></>
            }
          >
            <input
              name="destination_city"
              defaultValue={programme.destination_city}
              className={inputClass}
            />
          </Field>
          <Field label="Pays">
            <input
              name="destination_country"
              defaultValue={programme.destination_country}
              className={inputClass}
            />
          </Field>
          <Field label="Départ">
            <input
              name="start_date"
              type="date"
              required
              defaultValue={programme.start_date ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Retour">
            <input
              name="end_date"
              type="date"
              required
              defaultValue={programme.end_date ?? ""}
              className={inputClass}
            />
          </Field>
          <Field label="Voyageurs">
            <input
              name="travellers"
              type="number"
              min={1}
              defaultValue={programme.travellers ?? 1}
              className={inputClass}
            />
          </Field>
          {programme.price_cents !== null && (
            <Field
              label={<>Prix repéré<Guessed shown /></>}
              hint="Non repris : un montant lu dans un document peut être un supplément. Posez le prix de vente sur le dossier."
            >
              <input
                readOnly
                value={formatMoney(programme.price_cents, "EUR")}
                className={`${inputClass} bg-stone-50 text-stone-500`}
              />
            </Field>
          )}
        </div>
      </Card>

      <Card title={`Le programme (${programme.days.length} journées)`}>
        {programme.days.length === 0 ? (
          <p className="px-5 py-6 text-sm text-stone-500">
            Aucun marqueur de journée reconnu. Votre programme n'en porte peut-être pas — ajoutez
            « Jour 1 », « Jour 2 » dans le texte collé, ou créez le dossier et saisissez les
            prestations à la main.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {programme.days.map((day, dayIndex) => (
              <li key={day.day_number} className="px-5 py-4">
                <p className="font-medium text-stone-900">
                  Jour {day.day_number}
                  {day.title ? ` — ${day.title}` : ""}
                  {day.date && <span className="ml-2 text-sm font-normal text-stone-500">{day.date}</span>}
                </p>

                <ul className="mt-2 space-y-1.5">
                  {day.entries.map((entry, index) => {
                    const key = keyOf(dayIndex, index);
                    return (
                      <li key={key} className="flex items-start gap-2.5 text-sm">
                        <input
                          type="checkbox"
                          checked={!dropped.has(key)}
                          aria-label={`Retenir ${entry.label}`}
                          onChange={(event) =>
                            setDropped((previous) => {
                              const next = new Set(previous);
                              if (event.target.checked) next.delete(key);
                              else next.add(key);
                              return next;
                            })
                          }
                          className="mt-1 h-4 w-4 rounded border-stone-300"
                        />
                        <Badge className={KIND_TONE[entry.kind]}>{KIND_LABEL[entry.kind]}</Badge>
                        <span className={dropped.has(key) ? "text-stone-400 line-through" : "text-stone-700"}>
                          {entry.label}
                        </span>
                        {entry.reference && (
                          <span className="text-xs text-brand-700">{entry.reference}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {programme.unmatched.length > 0 && (
        <Card title={`Non rattaché (${programme.unmatched.length})`}>
          <p className="border-b border-stone-100 px-5 py-3 text-sm text-stone-600">
            Ces lignes n'appartenaient à aucune journée — souvent le prix et les conditions. Elles
            ne sont pas reprises dans le dossier, mais rien n'a été perdu : les voici.
          </p>
          <ul className="divide-y divide-stone-100">
            {programme.unmatched.map((line, index) => (
              <li key={`${index}-${line.slice(0, 12)}`} className="px-5 py-2 text-sm text-stone-600">
                {line}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <SubmitButton pendingLabel="Création…">
        Créer le dossier avec {kept.length} prestation{kept.length > 1 ? "s" : ""}
      </SubmitButton>
    </form>
  );
}
