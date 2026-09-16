import { Card, EmptyState } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { buildItinerary, emptyDays } from "@/lib/itinerary";
import { formatMoney, type Currency } from "@/lib/money";
import type { Booking, BookingType, Expense, Trip } from "@/lib/types";

const BOOKING_ICON: Record<BookingType, string> = {
  flight: "✈",
  stay: "⌂",
  transport: "▤",
  activity: "◈",
  other: "•",
};

/** The day-by-day programme, built from what is already on the trip. */
export function ItineraryCard({
  trip,
  bookings,
  expenses,
  currency,
  nameById,
}: {
  trip: Trip;
  bookings: Booking[];
  expenses: Expense[];
  currency: Currency;
  nameById: Map<number, string>;
}) {
  const itinerary = buildItinerary(trip, bookings, expenses);
  const gaps = emptyDays(itinerary);

  if (bookings.length === 0 && expenses.length === 0) {
    return (
      <Card title="Jour par jour">
        <EmptyState
          title="Le programme se remplit tout seul"
          hint="Chaque réservation et chaque dépense se range à sa date. Ajoutez un vol ou un logement pour voir apparaître les journées."
        />
      </Card>
    );
  }

  return (
    <Card
      title="Jour par jour"
      action={
        gaps.length > 0 ? (
          <span className="text-xs text-stone-400">
            {gaps.length} journée{gaps.length > 1 ? "s" : ""} encore libre
            {gaps.length > 1 ? "s" : ""}
          </span>
        ) : null
      }
    >
      <ol className="divide-y divide-stone-100">
        {itinerary.days.map((day) => (
          <li key={day.date} className="px-5 py-3.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-semibold text-stone-900">
                Jour {day.day_number}
                <span className="ml-2 font-normal text-stone-500">{formatDate(day.date)}</span>
              </p>
              {day.total_cents > 0 && (
                <span className="text-sm tabular-nums text-stone-600">
                  {formatMoney(day.total_cents, currency)}
                </span>
              )}
            </div>

            {day.starts.length === 0 && day.ongoing.length === 0 && day.expenses.length === 0 ? (
              <p className="mt-1 text-sm text-stone-400">Rien de prévu.</p>
            ) : (
              <ul className="mt-2 space-y-1.5 text-sm">
                {day.starts.map((booking) => (
                  <li key={`s${booking.id}`} className="flex gap-2 text-stone-700">
                    <span aria-hidden className="text-stone-400">
                      {BOOKING_ICON[booking.type]}
                    </span>
                    <span>
                      {booking.vendor}
                      {booking.description ? ` — ${booking.description}` : ""}
                      <span className="ml-2 text-xs tabular-nums text-stone-400">
                        {formatMoney(booking.amount_cents, currency)}
                      </span>
                    </span>
                  </li>
                ))}

                {day.ongoing.map((booking) => (
                  <li key={`o${booking.id}`} className="flex gap-2 text-stone-500">
                    <span aria-hidden className="text-stone-300">
                      {BOOKING_ICON[booking.type]}
                    </span>
                    <span className="text-xs">
                      {booking.vendor} — en cours
                    </span>
                  </li>
                ))}

                {day.expenses.map((expense) => (
                  <li key={`e${expense.id}`} className="flex gap-2 text-stone-600">
                    <span aria-hidden className="text-stone-300">
                      €
                    </span>
                    <span className="text-xs">
                      {expense.description} · {nameById.get(expense.paid_by) ?? "quelqu'un"}
                      <span className="ml-2 tabular-nums text-stone-400">
                        {formatMoney(expense.amount_cents, currency)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ol>

      {(itinerary.outside.bookings.length > 0 || itinerary.outside.expenses.length > 0) && (
        <p className="border-t border-stone-100 bg-amber-50 px-5 py-3 text-xs text-amber-800">
          {itinerary.outside.bookings.length + itinerary.outside.expenses.length} élément
          {itinerary.outside.bookings.length + itinerary.outside.expenses.length > 1 ? "s" : ""} porte
          {itinerary.outside.bookings.length + itinerary.outside.expenses.length > 1 ? "nt" : ""} une
          date en dehors du voyage : à corriger, ou les dates du voyage à élargir.
        </p>
      )}
    </Card>
  );
}
