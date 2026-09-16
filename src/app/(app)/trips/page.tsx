import Link from "next/link";
import { TripCard } from "@/components/trip-card";
import { Card, EmptyState, buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listTrips } from "@/lib/trips";
import type { TripStage } from "@/lib/types";

const FILTERS: Array<{ key: string; label: string; stages?: TripStage[] }> = [
  { key: "active", label: "En cours", stages: ["idea", "planning", "booked", "travelling"] },
  { key: "ideas", label: "Idées", stages: ["idea"] },
  { key: "booked", label: "Réservés", stages: ["booked", "travelling"] },
  { key: "past", label: "Déjà faits", stages: ["completed"] },
  { key: "all", label: "Tous" },
];

export default async function TripsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; q?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const filter = FILTERS.find((entry) => entry.key === params.filter) ?? FILTERS[0];
  const search = params.q?.trim() || undefined;
  const trips = listTrips({ userId: user.id, stages: filter.stages, search });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">Mes voyages</h1>
          <p className="mt-1.5 text-sm text-stone-500">
            Ceux que vous préparez, ceux que vous avez faits, et ceux où l'on vous a invité.
          </p>
        </div>
        <Link href="/trips/new" className={buttonClass}>
          Nouveau voyage
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((entry) => {
          const query = new URLSearchParams({ filter: entry.key });
          if (search) query.set("q", search);
          return (
            <Link
              key={entry.key}
              href={`/trips?${query.toString()}`}
              className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                entry.key === filter.key
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-600 ring-1 ring-stone-200 ring-inset hover:bg-stone-50"
              }`}
            >
              {entry.label}
            </Link>
          );
        })}

        <form className="ml-auto" action="/trips">
          <input type="hidden" name="filter" value={filter.key} />
          <input
            name="q"
            defaultValue={search ?? ""}
            placeholder="Chercher une ville, un nom…"
            className={`${inputClass} w-60`}
          />
        </form>
      </div>

      {trips.length === 0 ? (
        <Card>
          <EmptyState
            title="Aucun voyage dans cette vue"
            hint="Essayez un autre filtre, ou lancez quelque chose — même une idée sans dates compte."
            action={
              <Link href="/trips/new" className={buttonClass}>
                Créer un voyage
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}
