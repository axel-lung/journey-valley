"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { Badge, ErrorNotice, Field, inputClass, secondaryButtonClass } from "@/components/ui";
import { formatMoney, type Currency } from "@/lib/money";
import type { SearchKind } from "@/lib/search";
import { createWatchAction, importResultAction, searchAction, type SearchState } from "./search-actions";

const KINDS: Array<{ value: SearchKind; label: string }> = [
  { value: "flight", label: "Vol" },
  { value: "stay", label: "Logement" },
  { value: "activity", label: "Activité" },
];

/**
 * Searching, importing a result as a booking, and setting a price alert — the
 * three things that turn "je cherche" into a line on the trip.
 */
export function SearchPanel({
  tripId,
  destination,
  startDate,
  endDate,
  travellers,
  homeCity,
  currency,
}: {
  tripId: number;
  destination: string;
  startDate: string;
  endDate: string;
  travellers: number;
  homeCity: string;
  currency: Currency;
}) {
  const [state, action] = useActionState<SearchState, FormData>(searchAction, {});
  const [kind, setKind] = useState<SearchKind>("flight");

  return (
    <div className="space-y-4 px-5 py-4">
      <form action={action} className="space-y-4">
        <input type="hidden" name="trip_id" value={tripId} />

        <div className="flex flex-wrap gap-2">
          {KINDS.map((entry) => (
            <label
              key={entry.value}
              className={`cursor-pointer rounded-full px-3.5 py-2 text-sm font-medium ring-1 ring-inset transition ${
                kind === entry.value
                  ? "bg-brand-600 text-white ring-brand-600"
                  : "bg-white text-stone-600 ring-stone-300"
              }`}
            >
              <input
                type="radio"
                name="kind"
                value={entry.value}
                checked={kind === entry.value}
                onChange={() => setKind(entry.value)}
                className="sr-only"
              />
              {entry.label}
            </label>
          ))}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {kind === "flight" && (
            <Field label="Départ de">
              <input name="origin" defaultValue={homeCity} placeholder="Lyon" className={inputClass} />
            </Field>
          )}
          <Field label="Destination">
            <input name="destination" required defaultValue={destination} className={inputClass} />
          </Field>
          <Field label="Aller">
            <input name="start_date" type="date" required defaultValue={startDate} className={inputClass} />
          </Field>
          {kind !== "activity" && (
            <Field label="Retour">
              <input name="end_date" type="date" defaultValue={endDate} className={inputClass} />
            </Field>
          )}
          <Field label="Voyageurs">
            <input
              name="travellers"
              type="number"
              min={1}
              max={20}
              defaultValue={travellers}
              className={inputClass}
            />
          </Field>
          <Field
            label={`Prévenez-moi en dessous de (${currency})`}
            hint="Facultatif — crée une alerte sur cette recherche."
          >
            <input name="target" inputMode="decimal" placeholder="250" className={inputClass} />
          </Field>
        </div>

        <ErrorNotice message={state.error} />

        <div className="flex flex-wrap gap-2">
          <SubmitButton pendingLabel="Recherche…">Chercher</SubmitButton>
          <SubmitButton formAction={createWatchAction} className={secondaryButtonClass}>
            Surveiller ce prix
          </SubmitButton>
        </div>
      </form>

      {state.provider && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {state.provider.live ? (
              <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                {(state.results ?? []).some((result) => result.price_known)
                  ? `Offres réelles · ${state.provider.label}`
                  : `Lieux réels · ${state.provider.label}, sans tarif`}
              </Badge>
            ) : (
              <Badge className="bg-amber-50 text-amber-800 ring-amber-200">
                Estimations, pas des offres réelles
              </Badge>
            )}
            <span className="text-stone-500">
              {state.results?.length ?? 0} résultat
              {(state.results?.length ?? 0) > 1 ? "s" : ""}
            </span>
          </div>

          {!state.provider.live && (
            <p className="rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs leading-relaxed text-amber-800 ring-1 ring-amber-200 ring-inset">
              Aucun fournisseur de réservation n'est connecté : ces prix sont des ordres de
              grandeur calculés à partir de votre recherche, utiles pour bâtir un budget, mais ils
              ne correspondent à aucune offre réservable.
              {state.fallback_reason ? ` (${state.fallback_reason})` : ""}
            </p>
          )}

          <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
            {(state.results ?? []).map((result) => (
              <li
                key={result.id}
                className="flex flex-wrap items-start justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{result.vendor}</p>
                  <p className="text-xs text-stone-500">{result.description}</p>
                  {result.price_known ? (
                    <p className="mt-0.5 text-xs text-stone-400">
                      En formule, ce type de prestation se revend autour de{" "}
                      {formatMoney(result.package_price_cents, currency)}
                    </p>
                  ) : (
                    <p className="mt-0.5 text-xs text-stone-400">
                      Lieu réel, tarif non publié par la source
                      {result.deeplink ? (
                        <>
                          {" · "}
                          <a
                            href={result.deeplink}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="text-brand-700 underline"
                          >
                            voir la fiche
                          </a>
                        </>
                      ) : null}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {result.price_known && (
                    <p className="tabular-nums text-stone-900">
                      {formatMoney(result.price_cents, currency)}
                    </p>
                  )}
                  <form action={importResultAction} className="flex items-center gap-2">
                    <input type="hidden" name="trip_id" value={tripId} />
                    <input type="hidden" name="kind" value={result.kind} />
                    <input type="hidden" name="vendor" value={result.vendor} />
                    <input type="hidden" name="description" value={result.description} />
                    <input type="hidden" name="start_at" value={result.start_at} />
                    <input type="hidden" name="end_at" value={result.end_at ?? ""} />
                    <input type="hidden" name="nights" value={result.nights ?? ""} />
                    <input type="hidden" name="price_cents" value={result.price_cents} />
                    <input type="hidden" name="source" value={result.source} />
                    {!result.price_known && (
                      <input
                        name="price"
                        inputMode="decimal"
                        aria-label={`Prix pour ${result.vendor}`}
                        placeholder={`Prix (${currency})`}
                        className={`${inputClass} w-32`}
                      />
                    )}
                    <SubmitButton className={secondaryButtonClass} pendingLabel="Ajout…">
                      Ajouter
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
