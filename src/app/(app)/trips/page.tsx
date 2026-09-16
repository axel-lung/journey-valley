import Link from "next/link";
import { Badge, Card, EmptyState, TableShell, buttonClass, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { savingsFromTotals, tripNights } from "@/lib/budget";
import { formatMoney } from "@/lib/money";
import { listTrips } from "@/lib/trips";
import type { TripStage } from "@/lib/types";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/stages";

const FILTERS: Array<{ key: string; label: string; stages?: TripStage[] }> = [
  { key: "active", label: "In progress", stages: ["idea", "planning", "booked", "travelling"] },
  { key: "ideas", label: "Ideas", stages: ["idea"] },
  { key: "booked", label: "Booked", stages: ["booked", "travelling"] },
  { key: "past", label: "Been there", stages: ["completed"] },
  { key: "all", label: "All" },
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
  const currency = user.currency;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Trips</h1>
          <p className="mt-1 text-sm text-slate-500">
            Everything you are planning or have travelled, including trips you were invited to.
          </p>
        </div>
        <Link href="/trips/new" className={buttonClass}>
          Plan a trip
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
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition ${
                entry.key === filter.key
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 ring-inset hover:bg-slate-50"
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
            placeholder="Search by name or place"
            className={`${inputClass} w-64`}
          />
        </form>
      </div>

      <Card>
        {trips.length === 0 ? (
          <EmptyState
            title="No trips in this view"
            hint="Try another filter, or start something new — an idea with no dates counts."
          />
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-5 py-2.5">Trip</th>
                <th className="px-5 py-2.5">When</th>
                <th className="px-5 py-2.5">Stage</th>
                <th className="px-5 py-2.5 text-right">Spent</th>
                <th className="px-5 py-2.5 text-right">Saved</th>
              </tr>
            }
          >
            {trips.map((trip) => {
              const savings = savingsFromTotals(trip);
              return (
                <tr key={trip.id} className="align-top hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/trips/${trip.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {trip.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {trip.destination_city}, {trip.destination_country}
                      {trip.member_count > 1 ? ` · ${trip.member_count} travellers` : ""}
                      {trip.my_role === "companion" ? ` · invited by ${trip.owner_name}` : ""}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-slate-600">
                    {trip.start_date}
                    <p className="text-xs text-slate-400">
                      {tripNights(trip)} night{tripNights(trip) === 1 ? "" : "s"}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <Badge className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Badge>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatMoney(trip.booked_cents + trip.spent_cents, currency)}
                    {trip.budget_cents > 0 && (
                      <p className="text-xs text-slate-400">
                        of {formatMoney(trip.budget_cents, currency)}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    {savings.basis === "none" ? (
                      <span className="text-xs text-slate-400">no quote</span>
                    ) : (
                      <span
                        className={savings.saved_cents >= 0 ? "text-emerald-700" : "text-rose-700"}
                      >
                        {formatMoney(savings.saved_cents, currency)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </TableShell>
        )}
      </Card>
    </div>
  );
}
