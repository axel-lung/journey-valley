import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, EmptyState, secondaryButtonClass } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatMoney, type Currency } from "@/lib/money";
import { describeWatch, type PriceWatch } from "@/lib/watch";
import { checkTripWatchesAction, deleteWatchAction } from "./search-actions";

/**
 * The price alerts on a trip, with what each one has seen. The figures come
 * from whichever provider answered, so they carry the same caveat as the
 * search results themselves.
 */
export function Watches({
  tripId,
  watches,
  currency,
  liveProvider,
}: {
  tripId: number;
  watches: PriceWatch[];
  currency: Currency;
  liveProvider: boolean;
}) {
  return (
    <Card
      title={`Alertes de prix (${watches.length})`}
      action={
        watches.length > 0 ? (
          <form action={checkTripWatchesAction}>
            <input type="hidden" name="trip_id" value={tripId} />
            <SubmitButton className={secondaryButtonClass} pendingLabel="Vérification…">
              Vérifier maintenant
            </SubmitButton>
          </form>
        ) : null
      }
    >
      {watches.length === 0 ? (
        <EmptyState
          title="Aucune alerte"
          hint="Depuis la recherche ci-dessus, « Surveiller ce prix » garde un œil sur un trajet ou un logement et note son évolution."
        />
      ) : (
        <ul className="divide-y divide-stone-100">
          {watches.map((watch) => {
            const dropped =
              watch.best_price_cents !== null &&
              watch.last_price_cents !== null &&
              watch.last_price_cents <= watch.best_price_cents;
            const reached =
              watch.target_cents > 0 &&
              watch.last_price_cents !== null &&
              watch.last_price_cents <= watch.target_cents;

            return (
              <li
                key={watch.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{describeWatch(watch)}</p>
                  <p className="text-xs text-stone-500">
                    {formatDate(watch.start_date)}
                    {watch.end_date ? ` → ${formatDate(watch.end_date)}` : ""}
                    {watch.target_cents > 0
                      ? ` · cible ${formatMoney(watch.target_cents, currency)}`
                      : " · suivi simple"}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {watch.last_checked_at
                      ? `Dernière vérification le ${formatDate(watch.last_checked_at.slice(0, 10))}`
                      : "Jamais vérifiée"}
                    {watch.best_price_cents !== null
                      ? ` · meilleur prix vu ${formatMoney(watch.best_price_cents, currency)}`
                      : ""}
                  </p>
                  {reached && (
                    <p className="mt-1">
                      <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200">
                        Sous votre prix cible
                      </Badge>
                    </p>
                  )}
                  {!reached && dropped && watch.last_checked_at && (
                    <p className="mt-1">
                      <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                        Au plus bas depuis le début du suivi
                      </Badge>
                    </p>
                  )}
                </div>

                <div className="text-right">
                  <p className="tabular-nums text-stone-900">
                    {watch.last_price_cents === null
                      ? "—"
                      : formatMoney(watch.last_price_cents, currency)}
                  </p>
                  <form action={deleteWatchAction}>
                    <input type="hidden" name="watch_id" value={watch.id} />
                    <button type="submit" className="text-xs text-stone-400 hover:text-rose-600">
                      Arrêter
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="border-t border-stone-100 px-5 py-3 text-xs leading-relaxed text-stone-500">
        {liveProvider
          ? "Les alertes sont revérifiées par la tâche planifiée, et à chaque fois que vous cliquez sur « Vérifier maintenant »."
          : "Aucun fournisseur de réservation n'est connecté : les alertes suivent les estimations hors ligne, pas de vrais tarifs. Branchez un fournisseur pour qu'elles deviennent utiles."}
      </p>
    </Card>
  );
}
