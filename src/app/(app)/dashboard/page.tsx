import Link from "next/link";
import { CategorySpendBars, MonthlySpendChart } from "@/components/spend-chart";
import { Badge, Card, EmptyState, StatTile, buttonClass } from "@/components/ui";
import { homeStats, monthlySpend, recentActivity, spendByCategory } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { tripNights } from "@/lib/budget";
import { formatMoney } from "@/lib/money";
import { PLANS } from "@/lib/plans";
import { countActiveTrips, listTrips } from "@/lib/trips";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/stages";

export default async function DashboardPage() {
  const user = await requireUser();
  const currency = user.currency;

  const stats = homeStats(user.id);
  const months = monthlySpend(user.id, 6);
  const categories = spendByCategory(user.id);
  const activity = recentActivity(user.id, 8);
  const upcoming = listTrips({
    userId: user.id,
    stages: ["idea", "planning", "booked", "travelling"],
    limit: 4,
  });

  const plan = PLANS[user.plan];
  const activeTrips = countActiveTrips(user.id);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Hello {user.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {stats.trips_active} trip{stats.trips_active === 1 ? "" : "s"} in progress ·{" "}
            {stats.nights_away} night{stats.nights_away === 1 ? "" : "s"} away so far.
          </p>
        </div>
        <Link href="/trips/new" className={buttonClass}>
          Plan a trip
        </Link>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Saved vs. agencies"
          value={formatMoney(stats.saved_cents, currency)}
          hint={
            stats.agency_cents > 0
              ? `Against ${formatMoney(stats.agency_cents, currency)} of quotes`
              : "Add an agency quote to a trip to compare"
          }
          tone={stats.saved_cents > 0 ? "positive" : "default"}
        />
        <StatTile
          label="Committed so far"
          value={formatMoney(stats.committed_cents, currency)}
          hint="Bookings plus on-trip spending"
        />
        <StatTile label="Coming up" value={stats.upcoming_count} hint="Planned or booked" />
        <StatTile
          label="Trips completed"
          value={stats.trips_completed}
          hint={`${stats.trips_total} in total`}
        />
      </div>

      {user.plan === "free" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-5 py-3.5 text-sm">
          <p className="text-brand-900">
            You are on the {plan.name} plan — {activeTrips} of {plan.max_active_trips} active trips
            used.
          </p>
          <Link href="/account" className="font-medium text-brand-700 hover:underline">
            See Plus →
          </Link>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Your travel spending" className="xl:col-span-2">
          <MonthlySpendChart points={months} currency={currency} />
        </Card>

        <Card title="Where the money goes">
          {categories.length === 0 ? (
            <EmptyState title="No spending logged yet" hint="Expenses you add to a trip show up here." />
          ) : (
            <CategorySpendBars rows={categories} currency={currency} />
          )}
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Trips in progress"
          action={
            <Link href="/trips" className="text-xs font-medium text-brand-600 hover:underline">
              All trips
            </Link>
          }
        >
          {upcoming.length === 0 ? (
            <EmptyState
              title="Nothing planned yet"
              hint="Start with a rough idea — dates and budget can come later."
            />
          ) : (
            <ul className="divide-y divide-slate-100">
              {upcoming.map((trip) => (
                <li key={trip.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/trips/${trip.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {trip.title}
                    </Link>
                    <p className="truncate text-xs text-slate-500">
                      {trip.destination_city}, {trip.destination_country} · {trip.start_date} ·{" "}
                      {tripNights(trip)} night{tripNights(trip) === 1 ? "" : "s"}
                    </p>
                  </div>
                  <Badge className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent activity">
          {activity.length === 0 ? (
            <EmptyState title="Nothing has happened yet" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {activity.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-baseline justify-between gap-4 px-5 py-2.5 text-sm"
                >
                  <span className="text-slate-700">
                    <span className="font-medium">{entry.actor_name ?? "Someone"}</span>{" "}
                    <span className="text-slate-500">{humanise(entry.action)}</span>{" "}
                    {entry.detail && <span className="text-slate-700">{entry.detail}</span>}
                  </span>
                  <time className="shrink-0 text-xs text-slate-400">
                    {entry.created_at.slice(0, 10)}
                  </time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function humanise(action: string): string {
  const map: Record<string, string> = {
    "trip.created": "started planning",
    "trip.idea": "had an idea:",
    "trip.planning": "moved into planning",
    "trip.booked": "finished booking",
    "trip.travelling": "set off on",
    "trip.completed": "came back from",
    "trip.cancelled": "cancelled",
    "booking.added": "booked",
    "booking.removed": "removed a booking from",
    "expense.added": "logged",
    "expense.removed": "deleted an expense from",
    "companion.added": "invited",
    "companion.removed": "removed a companion from",
    "account.created": "joined Journey Valley",
  };
  return map[action] ?? action.replace(".", " ");
}
