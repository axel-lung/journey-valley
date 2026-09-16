import Link from "next/link";
import { CategorySpendBars, MonthlySpendChart } from "@/components/spend-chart";
import { TripCard } from "@/components/trip-card";
import { Card, EmptyState, HeroStat, StatTile, buttonClass } from "@/components/ui";
import { homeStats, monthlySpend, recentActivity, spendByCategory } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { countdown, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { countActiveTrips, listTrips } from "@/lib/trips";

export default async function DashboardPage() {
  const user = await requireUser();
  const currency = user.currency;

  const stats = homeStats(user.id);
  const months = monthlySpend(user.id, 6);
  const categories = spendByCategory(user.id);
  const activity = recentActivity(user.id, 6);
  const upcoming = listTrips({
    userId: user.id,
    stages: ["idea", "planning", "booked", "travelling"],
    limit: 4,
  });

  const plan = PLANS[user.plan];
  const activeTrips = countActiveTrips(user.id);
  const next = [...upcoming]
    .filter((trip) => countdown(trip.start_date, trip.end_date).upcoming)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">
            Bonjour {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1.5 text-sm text-stone-500">
            {next
              ? `Prochain départ : ${next.destination_city}, ${formatDate(next.start_date)} — ${countdown(next.start_date, next.end_date).label.toLowerCase()}.`
              : "Aucun départ prévu pour l'instant. La prochaine idée commence ici."}
          </p>
        </div>
        <Link href="/trips/new" className={buttonClass}>
          Nouveau voyage
        </Link>
      </header>

      <HeroStat
        label="Gardé dans votre poche"
        value={formatMoney(stats.saved_cents, currency)}
        hint={
          stats.compared_trips > 0
            ? `Sur ${stats.compared_trips} voyage${stats.compared_trips > 1 ? "s" : ""} comparé${stats.compared_trips > 1 ? "s" : ""}, face à ${formatMoney(stats.agency_cents, currency)} de devis.`
            : "Notez le devis d'une agence sur un voyage pour voir l'écart."
        }
        aside={
          <Link
            href="/savings"
            className="rounded-xl bg-white/15 px-4 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/25"
          >
            Voir le détail →
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Voyages en cours"
          value={stats.trips_active}
          hint={`${stats.trips_total} au total`}
        />
        <StatTile label="À venir" value={stats.upcoming_count} hint="Préparés ou réservés" />
        <StatTile
          label="Engagé"
          value={formatMoney(stats.committed_cents, currency)}
          hint="Réservations et dépenses"
        />
        <StatTile
          label="Nuits passées dehors"
          value={stats.nights_away}
          hint={`${stats.trips_completed} voyage${stats.trips_completed > 1 ? "s" : ""} terminé${stats.trips_completed > 1 ? "s" : ""}`}
        />
      </div>

      {user.plan === "free" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-5 py-4 text-sm">
          <p className="text-brand-900">
            Forfait {plan.name} — {activeTrips} voyage{activeTrips > 1 ? "s" : ""} en cours sur{" "}
            {plan.max_active_trips}.
          </p>
          <Link href="/account" className="font-semibold text-brand-700 hover:underline">
            Découvrir Plus →
          </Link>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-stone-900">Vos voyages en cours</h2>
          <Link href="/trips" className="text-sm font-medium text-brand-600 hover:underline">
            Tout voir
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <Card>
            <EmptyState
              title="Rien de prévu pour l'instant"
              hint="Commencez par une idée : une ville, des dates approximatives, et c'est parti."
              action={
                <Link href="/trips/new" className={buttonClass}>
                  Créer mon premier voyage
                </Link>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {upcoming.map((trip) => (
              <TripCard key={trip.id} trip={trip} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Vos dépenses de voyage" className="xl:col-span-2">
          <MonthlySpendChart points={months} currency={currency} />
        </Card>

        <Card title="Où part l'argent">
          {categories.length === 0 ? (
            <EmptyState
              title="Aucune dépense enregistrée"
              hint="Les dépenses ajoutées à un voyage apparaissent ici."
            />
          ) : (
            <CategorySpendBars rows={categories} currency={currency} />
          )}
        </Card>
      </div>

      {activity.length > 0 && (
        <Card title="Dernières activités">
          <ul className="divide-y divide-stone-100">
            {activity.map((entry) => (
              <li
                key={entry.id}
                className="flex items-baseline justify-between gap-4 px-5 py-3 text-sm"
              >
                <span className="text-stone-700">
                  <span className="font-medium">{entry.actor_name ?? "Quelqu'un"}</span>{" "}
                  <span className="text-stone-500">{humanise(entry.action)}</span>{" "}
                  {entry.detail && <span className="text-stone-700">{entry.detail}</span>}
                </span>
                <time className="shrink-0 text-xs text-stone-400">
                  {formatDate(entry.created_at.slice(0, 10))}
                </time>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function humanise(action: string): string {
  const map: Record<string, string> = {
    "trip.created": "a lancé",
    "trip.idea": "a eu une idée :",
    "trip.planning": "prépare",
    "trip.booked": "a fini de réserver",
    "trip.travelling": "est parti pour",
    "trip.completed": "est rentré de",
    "trip.cancelled": "a annulé",
    "booking.added": "a réservé",
    "booking.removed": "a supprimé une réservation de",
    "expense.added": "a noté",
    "expense.removed": "a supprimé une dépense de",
    "companion.added": "a invité",
    "companion.removed": "a retiré un compagnon de",
    "account.created": "a rejoint Journey Valley",
  };
  return map[action] ?? action.replace(".", " ");
}
