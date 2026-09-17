import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgency, isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { budgetStatus, settlementPlan, splitBalances, tripNights } from "@/lib/budget";
import { formatDate, formatDateRange, formatNights, formatTravellers } from "@/lib/format";
import { buildItinerary } from "@/lib/itinerary";
import { formatMoney } from "@/lib/money";
import { countryCodeFromName, OFFICIAL_ADVICE_URL, practicalFor } from "@/lib/practical";
import { STAGE_LABEL } from "@/lib/stages";
import {
  getTripSummary,
  listBookings,
  listChecklist,
  listExpenses,
  listMembers,
} from "@/lib/trips";
import type { BookingType } from "@/lib/types";

const BOOKING_LABEL: Record<BookingType, string> = {
  flight: "Vol",
  stay: "Logement",
  transport: "Transport",
  activity: "Activité",
  other: "Autre",
};

/**
 * The travel book — the printed file an agency hands over before departure:
 * the programme, every booking with its reference, the practical page and who
 * owes what. One page, built for paper as much as for screen.
 */
export default async function CarnetPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const currency = trip.currency;
  const members = listMembers(trip.id);
  const bookings = listBookings(trip.id);
  const expenses = listExpenses(trip.id);
  const checklist = listChecklist(trip.id);

  const itinerary = buildItinerary(trip, bookings, expenses);
  const budget = budgetStatus(trip, bookings, expenses);
  const balances = splitBalances(members, expenses);
  const transfers = settlementPlan(balances);
  const practical = practicalFor(
    countryCodeFromName(trip.destination_country) ?? trip.destination_country,
  );
  const nameById = new Map(members.map((member) => [member.user_id, member.name]));

  // Le même carnet, deux lectures. Le conseiller voit ses coûts d'achat ; le
  // voyageur voit le prix qu'il paie, et rien d'autre — c'est le document qu'on
  // lui remet, pas la fiche interne du dossier.
  const advisor = isAdvisor(user);
  const agency = getAgency(user.agency_id);
  const sellCents =
    trip.agency_quote_cents > 0
      ? trip.agency_quote_cents
      : bookings.reduce((total, booking) => total + booking.agency_quote_cents, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-8 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/trips/${trip.id}`} className="text-sm text-stone-500 hover:text-stone-900">
          ← Retour au voyage
        </Link>
        <p className="text-sm text-stone-500">
          Utilisez l'impression de votre navigateur pour en faire un PDF.
        </p>
      </div>

      <header className="border-b border-stone-200 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          Carnet de voyage
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-stone-900">{trip.title}</h1>
        <p className="mt-2 text-stone-600">
          {trip.destination_city}, {trip.destination_country} ·{" "}
          {formatDateRange(trip.start_date, trip.end_date)} · {formatNights(tripNights(trip))} ·{" "}
          {formatTravellers(members.length)}
        </p>
        <p className="mt-1 text-sm text-stone-500">
          {STAGE_LABEL[trip.stage]}
          {advisor
            ? ` · ${formatMoney(budget.committed_cents, currency)} d'achats · ${formatMoney(budget.per_traveller_cents, currency)} par personne`
            : sellCents > 0
              ? ` · ${formatMoney(sellCents, currency)}`
              : ""}
        </p>
        {trip.summary && <p className="mt-3 text-sm text-stone-700">{trip.summary}</p>}
      </header>

      {practical && (
        <section>
          <h2 className="text-lg font-semibold text-stone-900">En cas de pépin</h2>
          <dl className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {[
              ["Urgences sur place", practical.emergency],
              ["Monnaie", practical.currency],
              ["Prises électriques", `${practical.plugs} · ${practical.voltage}`],
              ["On roule à", practical.drive],
              ["Entrée sur le territoire", practical.entry],
              ["Pourboire", practical.tipping],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {label}
                </dt>
                <dd className="text-sm text-stone-800">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs text-stone-500">
            Informations indicatives — les conditions d'entrée sont à vérifier sur France
            Diplomatie ({OFFICIAL_ADVICE_URL}).
          </p>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-stone-900">Vos réservations</h2>
        {bookings.length === 0 ? (
          <p className="mt-2 text-sm text-stone-500">Aucune réservation enregistrée.</p>
        ) : (
          <table className="mt-3 w-full border-collapse text-sm">
            <thead className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-2">Quoi</th>
                <th className="py-2">Quand</th>
                <th className="py-2">Référence</th>
                <th className="py-2 text-right">{advisor ? "Achat" : "Prix"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {bookings.map((booking) => (
                <tr key={booking.id}>
                  <td className="py-2 pr-3">
                    <span className="font-medium text-stone-900">{booking.vendor}</span>
                    <span className="block text-xs text-stone-500">
                      {BOOKING_LABEL[booking.type]}
                      {booking.description ? ` · ${booking.description}` : ""}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-stone-600">
                    {formatDate(booking.start_at.slice(0, 10))}
                    {booking.end_at ? ` → ${formatDate(booking.end_at.slice(0, 10))}` : ""}
                  </td>
                  <td className="py-2 pr-3 text-stone-600">{booking.reference ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums text-stone-800">
                    {advisor
                      ? formatMoney(booking.amount_cents, currency)
                      : booking.agency_quote_cents > 0
                        ? formatMoney(booking.agency_quote_cents, currency)
                        : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="break-before-page">
        <h2 className="text-lg font-semibold text-stone-900">Jour par jour</h2>
        <ol className="mt-3 space-y-4">
          {itinerary.days.map((day) => (
            <li key={day.date} className="break-inside-avoid border-l-2 border-stone-200 pl-4">
              <p className="text-sm font-semibold text-stone-900">
                Jour {day.day_number} · {formatDate(day.date)}
              </p>
              {day.starts.length === 0 &&
              day.ongoing.length === 0 &&
              day.returns.length === 0 &&
              day.expenses.length === 0 ? (
                <p className="text-sm text-stone-400">Journée libre.</p>
              ) : (
                <ul className="mt-1 space-y-1 text-sm text-stone-700">
                  {day.starts.map((booking) => (
                    <li key={`s${booking.id}`}>
                      <strong>{booking.vendor}</strong>
                      {booking.description ? ` — ${booking.description}` : ""}
                    </li>
                  ))}
                  {day.returns.map((booking) => (
                    <li key={`r${booking.id}`}>{booking.vendor} — retour</li>
                  ))}
                  {day.ongoing.map((booking) => (
                    <li key={`o${booking.id}`} className="text-stone-500">
                      {booking.vendor} — en cours
                    </li>
                  ))}
                  {day.expenses.map((expense) => (
                    <li key={`e${expense.id}`} className="text-stone-500">
                      {expense.description} · {formatMoney(expense.amount_cents, currency)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      </section>

      {checklist.length > 0 && (
        <section className="break-inside-avoid">
          <h2 className="text-lg font-semibold text-stone-900">Avant de partir</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {checklist.map((item) => (
              <li key={item.id} className={item.done ? "text-stone-400" : "text-stone-800"}>
                <span aria-hidden className="mr-2">
                  {item.done ? "☑" : "☐"}
                </span>
                {item.label}
              </li>
            ))}
          </ul>
        </section>
      )}

      {members.length > 1 && expenses.length > 0 && (
        <section className="break-inside-avoid">
          <h2 className="text-lg font-semibold text-stone-900">Les comptes</h2>
          <ul className="mt-3 space-y-1 text-sm text-stone-700">
            {balances.map((balance) => (
              <li key={balance.user_id}>
                {balance.name} — a payé {formatMoney(balance.paid_cents, currency)}, sa part est{" "}
                {formatMoney(balance.share_cents, currency)}
                {balance.net_cents === 0
                  ? " · à jour"
                  : balance.net_cents > 0
                    ? ` · on lui doit ${formatMoney(balance.net_cents, currency)}`
                    : ` · doit ${formatMoney(-balance.net_cents, currency)}`}
              </li>
            ))}
          </ul>
          {transfers.length > 0 && (
            <>
              <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
                Pour être quittes
              </p>
              <ul className="mt-1 space-y-1 text-sm text-stone-700">
                {transfers.map((transfer) => (
                  <li key={`${transfer.from_user_id}-${transfer.to_user_id}`}>
                    {transfer.from_name} → {transfer.to_name} :{" "}
                    <strong>{formatMoney(transfer.amount_cents, currency)}</strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <footer className="border-t border-stone-200 pt-4 text-xs text-stone-400">
        Carnet établi le {formatDate(new Date().toISOString().slice(0, 10))} avec Journey Valley ·
        Voyage organisé par {trip.owner_name}
      </footer>
    </div>
  );
}
