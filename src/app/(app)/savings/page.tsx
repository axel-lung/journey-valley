import Link from "next/link";
import { SavingsBars } from "@/components/spend-chart";
import { Card, EmptyState, StatTile, TableShell } from "@/components/ui";
import { homeStats } from "@/lib/analytics";
import { requireUser } from "@/lib/auth";
import { savingsFromTotals } from "@/lib/budget";
import { formatMoney } from "@/lib/money";
import { listTrips } from "@/lib/trips";

export default async function SavingsPage() {
  const user = await requireUser();
  const currency = user.currency;

  const stats = homeStats(user.id);
  const trips = listTrips({ userId: user.id, limit: 100 })
    .map((trip) => ({ trip, savings: savingsFromTotals(trip) }))
    .filter((entry) => entry.savings.basis !== "none" && entry.trip.stage !== "cancelled");

  const compared = trips.length;
  const best = [...trips].sort((a, b) => b.savings.saved_cents - a.savings.saved_cents)[0];
  const yourTotal = trips.reduce((sum, entry) => sum + entry.savings.your_cost_cents, 0);
  const agencyTotal = trips.reduce((sum, entry) => sum + entry.savings.agency_cents, 0);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Savings</h1>
        <p className="mt-1 text-sm text-slate-500">
          What booking it yourself came to, next to what an agency quoted for the same trip.
        </p>
      </header>

      {compared === 0 ? (
        <Card>
          <EmptyState
            title="Nothing to compare yet"
            hint="Record an agency quote on a trip — or on a single booking — and the difference shows up here."
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile
              label="Kept in your pocket"
              value={formatMoney(stats.saved_cents, currency)}
              hint={`Across ${compared} compared trip${compared === 1 ? "" : "s"}`}
              tone={stats.saved_cents > 0 ? "positive" : "default"}
            />
            <StatTile
              label="Agency quotes"
              value={formatMoney(agencyTotal, currency)}
              hint="What the same trips were quoted at"
            />
            <StatTile
              label="Best trip"
              value={best ? formatMoney(best.savings.saved_cents, currency) : "—"}
              hint={best?.trip.title}
            />
          </div>

          <Card title="All compared trips together">
            <SavingsBars agencyCents={agencyTotal} yourCents={yourTotal} currency={currency} />
          </Card>

          <Card title="Trip by trip">
            <TableShell
              head={
                <tr>
                  <th className="px-5 py-2.5">Trip</th>
                  <th className="px-5 py-2.5">Compared</th>
                  <th className="px-5 py-2.5 text-right">You paid</th>
                  <th className="px-5 py-2.5 text-right">Agency</th>
                  <th className="px-5 py-2.5 text-right">Difference</th>
                </tr>
              }
            >
              {trips.map(({ trip, savings }) => (
                <tr key={trip.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/trips/${trip.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {trip.title}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {trip.destination_city}, {trip.destination_country} · {trip.start_date}
                    </p>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-600">
                    {savings.basis === "trip_quote" ? "Whole package" : "Individual bookings"}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                    {formatMoney(savings.your_cost_cents, currency)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums text-slate-500">
                    {formatMoney(savings.agency_cents, currency)}
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <span className={savings.saved_cents >= 0 ? "text-emerald-700" : "text-rose-700"}>
                      {formatMoney(savings.saved_cents, currency)}
                    </span>
                    <p className="text-xs text-slate-400">{savings.saved_percent}%</p>
                  </td>
                </tr>
              ))}
            </TableShell>
          </Card>
        </>
      )}

      <p className="text-xs text-slate-500">
        These figures only compare what you told us an agency quoted. A package may bundle extras —
        transfers, insurance, a guide — so put like against like when you record the quote.
      </p>
    </div>
  );
}
