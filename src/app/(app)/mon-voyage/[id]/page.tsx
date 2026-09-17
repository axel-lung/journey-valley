import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { Badge, Card, EmptyState, StatTile } from "@/components/ui";
import { getAgency, isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { tripNights } from "@/lib/budget";
import { coverStyle } from "@/lib/cover";
import { countdown, formatDate, formatDateRange, formatNights, formatTravellers } from "@/lib/format";
import { buildItinerary } from "@/lib/itinerary";
import { formatMoney } from "@/lib/money";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/stages";
import { getTripSummary, listBookings, listChecklist, listMembers } from "@/lib/trips";
import { DossierCard, DossierSkeleton } from "../../trips/[id]/dossier-card";
import type { BookingType } from "@/lib/types";

export const dynamic = "force-dynamic";

const BOOKING_LABEL: Record<BookingType, string> = {
  flight: "Vol",
  stay: "Logement",
  transport: "Transport",
  activity: "Activité",
  other: "Autre",
};

/**
 * Le voyage vu par celui qui le fait.
 *
 * Un seul montant paraît : le prix qu'il paie. Les coûts d'achat de l'agence ne
 * sont pas masqués par du CSS, ils ne sont simplement jamais lus — la requête
 * qui les porterait n'est pas faite.
 */
export default async function MyTripPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (isAdvisor(user)) redirect("/trips");

  const { id } = await params;
  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const members = listMembers(trip.id);
  const bookings = listBookings(trip.id);
  const checklist = listChecklist(trip.id);
  const itinerary = buildItinerary(trip, bookings, []);
  const when = countdown(trip.start_date, trip.end_date);
  const agency = getAgency(user.agency_id);

  // Le prix du voyage : le forfait s'il est posé, la somme des lignes vendues
  // sinon. Une ligne sans prix de vente n'est pas encore facturée au client.
  const price =
    trip.agency_quote_cents > 0
      ? trip.agency_quote_cents
      : bookings.reduce((total, booking) => total + booking.agency_quote_cents, 0);

  return (
    <div className="space-y-6">
      <Link href="/mon-voyage" className="text-sm text-stone-500 hover:text-stone-900">
        ← Tous vos voyages
      </Link>

      <div
        className="overflow-hidden rounded-2xl px-6 py-6 text-white"
        style={coverStyle(`${trip.destination_city}${trip.destination_country}`)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Badge>
          {when.upcoming && trip.stage !== "cancelled" && (
            <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-semibold">
              {when.label}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{trip.title}</h1>
        <p className="mt-1 text-sm text-white/85">
          {trip.destination_city}, {trip.destination_country} ·{" "}
          {formatDateRange(trip.start_date, trip.end_date)} · {formatNights(tripNights(trip))} ·{" "}
          {formatTravellers(trip.travellers)}
        </p>
        {trip.summary && <p className="mt-3 max-w-2xl text-sm leading-relaxed">{trip.summary}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Prix du voyage"
          value={price > 0 ? formatMoney(price, trip.currency) : "En cours de préparation"}
          hint={price > 0 ? "Tel que proposé par votre conseiller" : "Votre devis arrive"}
        />
        <StatTile label="Voyageurs" value={trip.travellers} />
        <StatTile
          label="Départ"
          value={formatDate(trip.start_date)}
          hint={when.upcoming ? when.label : undefined}
        />
      </div>

      <Card title="Votre programme">
        {itinerary.days.length === 0 ? (
          <EmptyState title="Le programme se prépare" hint="Il apparaîtra ici dès qu'il est prêt." />
        ) : (
          <ol className="divide-y divide-stone-100">
            {itinerary.days.map((day) => (
              <li key={day.date} className="px-5 py-4">
                <p className="text-sm font-semibold text-stone-900">
                  Jour {day.day_number}
                  <span className="ml-2 font-normal text-stone-500">{formatDate(day.date)}</span>
                </p>
                {day.starts.length === 0 && day.ongoing.length === 0 ? (
                  <p className="mt-1 text-sm text-stone-400">Journée libre.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1 text-sm text-stone-700">
                    {day.starts.map((booking) => (
                      <li key={`s${booking.id}`}>
                        <strong className="font-medium">{booking.vendor}</strong>
                        {booking.description ? ` — ${booking.description}` : ""}
                      </li>
                    ))}
                    {day.ongoing.length > 0 && (
                      <li className="text-xs text-stone-500">
                        En cours : {day.ongoing.map((booking) => booking.vendor).join(", ")}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="Ce qui est réservé pour vous">
        {bookings.length === 0 ? (
          <EmptyState title="Rien de confirmé pour l'instant" />
        ) : (
          <ul className="divide-y divide-stone-100">
            {bookings.map((booking) => (
              <li key={booking.id} className="px-5 py-3.5">
                <p className="font-medium text-stone-900">{booking.vendor}</p>
                <p className="text-sm text-stone-500">
                  {BOOKING_LABEL[booking.type]}
                  {booking.description ? ` · ${booking.description}` : ""}
                  {booking.nights ? ` · ${booking.nights} nuits` : ""}
                </p>
                <p className="text-xs text-stone-400">
                  {formatDate(booking.start_at)}
                  {booking.reference ? ` · référence ${booking.reference}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Suspense fallback={<DossierSkeleton city={trip.destination_city} />}>
        <DossierCard trip={trip} currency={trip.currency} />
      </Suspense>

      {checklist.length > 0 && (
        <Card title="Avant de partir">
          <ul className="divide-y divide-stone-100">
            {checklist.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <span aria-hidden className={item.done ? "text-emerald-600" : "text-stone-300"}>
                  {item.done ? "☑" : "☐"}
                </span>
                <span className={item.done ? "text-stone-400 line-through" : "text-stone-700"}>
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Link
          href={`/trips/${trip.id}/carnet`}
          className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          Ouvrir mon carnet de voyage
        </Link>
        <p className="text-sm text-stone-500">
          {members.length > 1 ? `${members.length} voyageurs sur ce dossier. ` : ""}
          {agency ? `Préparé par ${agency.name}.` : "Une question ? Écrivez à votre conseiller."}
        </p>
      </div>
    </div>
  );
}
