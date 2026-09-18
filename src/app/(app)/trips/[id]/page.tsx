import { notFound, redirect } from "next/navigation";
import { Card, EmptyState } from "@/components/ui";
import { isAdvisor } from "@/lib/agency";
import { listAttachments } from "@/lib/attachments-store";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { getTripSummary, listBookings, listChecklist, listExpenses, listMembers } from "@/lib/trips";
import { VAT_ZONE_LABEL } from "@/lib/vat";
import type { BookingType } from "@/lib/types";
import { deleteBookingAction } from "../actions";
import { BookingForm } from "./booking-form";
import { Checklist } from "./checklist";
import { DocumentsCard } from "./documents-card";
import { ItineraryCard } from "./itinerary-card";

export const dynamic = "force-dynamic";

const BOOKING_LABEL: Record<BookingType, string> = {
  flight: "Vol",
  stay: "Logement",
  transport: "Transport",
  activity: "Activité",
  other: "Autre",
};

const BOOKING_ICON: Record<BookingType, string> = {
  flight: "✈",
  stay: "⌂",
  transport: "⇄",
  activity: "◎",
  other: "•",
};

/** Le voyage lui-même : ce qui se passe, jour par jour, et ce qui est acheté. */
export default async function ProgrammePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!isAdvisor(user)) redirect(`/mon-voyage/${id}`);

  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const currency = trip.currency;
  const members = listMembers(trip.id);
  const bookings = listBookings(trip.id);
  const expenses = listExpenses(trip.id);
  const checklist = listChecklist(trip.id);
  const editable = trip.stage !== "cancelled";
  const nameById = new Map(members.map((member) => [member.user_id, member.name]));

  return (
    <div className="space-y-6">
      <ItineraryCard
        trip={trip}
        bookings={bookings}
        expenses={expenses}
        currency={currency}
        nameById={nameById}
      />

      <Card title={`Réservations (${bookings.length})`}>
        {bookings.length === 0 ? (
          <EmptyState
            title="Rien de réservé pour l'instant"
            hint="Vols, logements, location de voiture, l'activité qu'il faut prendre à l'avance."
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {bookings.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
              >
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">
                    <span aria-hidden className="mr-1.5 text-stone-400">
                      {BOOKING_ICON[booking.type]}
                    </span>
                    {booking.vendor}
                  </p>
                  <p className="text-xs text-stone-500">
                    {BOOKING_LABEL[booking.type]}
                    {booking.description ? ` · ${booking.description}` : ""}
                    {booking.reference ? ` · ${booking.reference}` : ""}
                    {booking.nights
                      ? ` · ${booking.nights} nuits (${formatMoney(Math.round(booking.amount_cents / booking.nights), currency)} / nuit)`
                      : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-400">
                    {formatDate(booking.start_at.slice(0, 10))}
                    {booking.end_at ? ` → ${formatDate(booking.end_at.slice(0, 10))}` : ""}
                  </p>
                </div>

                <div className="text-right">
                  <p className="tabular-nums text-stone-800">
                    {formatMoney(booking.amount_cents, currency)}
                  </p>
                  {booking.agency_quote_cents > 0 && (
                    <p className="text-xs text-emerald-700">
                      agence {formatMoney(booking.agency_quote_cents, currency)} · −
                      {formatMoney(booking.agency_quote_cents - booking.amount_cents, currency)}
                    </p>
                  )}
                  {editable && (
                    <form action={deleteBookingAction}>
                      <input type="hidden" name="booking_id" value={booking.id} />
                      <button
                        type="submit"
                        className="text-xs text-stone-400 hover:text-rose-600"
                        aria-label={`Supprimer la réservation ${booking.vendor}`}
                      >
                        Supprimer
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <details className="border-t border-stone-100">
            <summary className="cursor-pointer select-none px-5 py-3.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
              Ajouter une réservation
            </summary>
            <BookingForm tripId={trip.id} currency={currency} defaultDate={trip.start_date} />
          </details>
        )}
      </Card>


      <DocumentsCard tripId={trip.id} attachments={listAttachments(trip.id, true)} />

      <Checklist tripId={trip.id} items={checklist} editable={editable} />
    </div>
  );
}
