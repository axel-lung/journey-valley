import Link from "next/link";
import { SavingsBars } from "@/components/spend-chart";
import { Card, EmptyState, HeroStat, ProvisionalNote, StatTile } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { savingsFromTotals } from "@/lib/budget";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { listTrips } from "@/lib/trips";

export default async function SavingsPage() {
  const user = await requireUser();
  const currency = user.currency;

  const all = listTrips({ userId: user.id, limit: 100 })
    .filter((trip) => trip.stage !== "cancelled")
    .map((trip) => ({ trip, savings: savingsFromTotals(trip) }))
    .filter((entry) => entry.savings.basis !== "none");

  const settled = all.filter((entry) => !entry.savings.provisional);
  const pending = all.filter((entry) => entry.savings.provisional);

  const agencyTotal = settled.reduce((sum, entry) => sum + entry.savings.agency_cents, 0);
  const yourTotal = settled.reduce((sum, entry) => sum + entry.savings.your_cost_cents, 0);
  const best = [...settled].sort((a, b) => b.savings.saved_cents - a.savings.saved_cents)[0];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-stone-900">Économies</h1>
        <p className="mt-1.5 text-sm text-stone-500">
          Ce que vos voyages vous ont coûté, à côté de ce qu'une agence en demandait.
        </p>
      </header>

      {all.length === 0 ? (
        <Card>
          <EmptyState
            title="Rien à comparer pour l'instant"
            hint="Notez un devis d'agence sur un voyage — ou sur une seule réservation — et l'écart apparaît ici."
          />
        </Card>
      ) : (
        <>
          <HeroStat
            label="Gardé dans votre poche"
            value={formatMoney(agencyTotal - yourTotal, currency)}
            hint={
              settled.length > 0
                ? `Sur ${settled.length} voyage${settled.length > 1 ? "s" : ""} entièrement réservé${settled.length > 1 ? "s" : ""}, face à ${formatMoney(agencyTotal, currency)} de devis.`
                : "Aucun voyage entièrement réservé pour l'instant — les comparaisons en cours sont plus bas."
            }
          />

          {settled.length > 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatTile
                  label="Devis d'agence"
                  value={formatMoney(agencyTotal, currency)}
                  hint="Ce que les mêmes voyages coûtaient en formule"
                />
                <StatTile
                  label="Meilleur voyage"
                  value={best ? formatMoney(best.savings.saved_cents, currency) : "—"}
                  hint={best?.trip.title}
                  tone="positive"
                />
              </div>

              <Card title="Tous les voyages comparés">
                <SavingsBars agencyCents={agencyTotal} yourCents={yourTotal} currency={currency} />
              </Card>

              <Card title="Voyage par voyage">
                <ul className="divide-y divide-stone-100">
                  {settled.map(({ trip, savings }) => (
                    <li key={trip.id}>
                      <Link
                        href={`/trips/${trip.id}`}
                        className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-stone-50"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-stone-900">{trip.title}</p>
                          <p className="text-xs text-stone-500">
                            {trip.destination_city} · {formatDate(trip.start_date)} ·{" "}
                            {savings.basis === "trip_quote"
                              ? "forfait complet"
                              : "réservations comparées"}
                          </p>
                          <p className="mt-0.5 text-xs text-stone-400">
                            {formatMoney(savings.your_cost_cents, currency)} payés contre{" "}
                            {formatMoney(savings.agency_cents, currency)} en agence
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p
                            className={`tabular-nums ${
                              savings.saved_cents >= 0 ? "text-emerald-700" : "text-rose-700"
                            }`}
                          >
                            {formatMoney(savings.saved_cents, currency)}
                          </p>
                          <p className="text-xs text-stone-400">{savings.saved_percent} %</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            </>
          )}

          {pending.length > 0 && (
            <Card title="Comparaisons en cours">
              <div className="px-5 pt-4">
                <ProvisionalNote>
                  Ces voyages ne sont pas entièrement réservés : leur devis couvre tout le séjour,
                  vos réservations pas encore. L'écart affiché est une estimation et ne compte pas
                  dans le total ci-dessus.
                </ProvisionalNote>
              </div>
              <ul className="mt-2 divide-y divide-stone-100">
                {pending.map(({ trip, savings }) => (
                  <li key={trip.id}>
                    <Link
                      href={`/trips/${trip.id}`}
                      className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-stone-50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium text-stone-900">{trip.title}</p>
                        <p className="text-xs text-stone-500">
                          {formatMoney(savings.your_cost_cents, currency)} réservés sur un devis de{" "}
                          {formatMoney(savings.agency_cents, currency)}
                        </p>
                      </div>
                      <p className="shrink-0 tabular-nums text-amber-700">
                        ≈ {formatMoney(savings.saved_cents, currency)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      <p className="text-xs leading-relaxed text-stone-500">
        Ces chiffres ne comparent que ce que vous avez saisi comme devis. Un forfait peut inclure
        des extras — transferts, assurance, guide — alors comparez ce qui est comparable.
      </p>
    </div>
  );
}
