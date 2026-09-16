import Link from "next/link";
import { savingsFromTotals, tripNights } from "@/lib/budget";
import { coverStyle } from "@/lib/cover";
import { countdown, formatDateRange, formatNights, formatTravellers } from "@/lib/format";
import { formatMoney, percentOf } from "@/lib/money";
import { STAGE_LABEL, STAGE_TONE } from "@/lib/stages";
import type { TripSummary } from "@/lib/types";
import { Badge, Meter } from "./ui";

export function TripCard({ trip }: { trip: TripSummary }) {
  const nights = tripNights(trip);
  const when = countdown(trip.start_date, trip.end_date);
  const savings = savingsFromTotals(trip);
  const committed = trip.booked_cents + trip.spent_cents;
  const percent = percentOf(committed, trip.budget_cents);
  const over = trip.budget_cents > 0 && committed > trip.budget_cents;

  return (
    <Link
      href={`/trips/${trip.id}`}
      className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div
        className="relative flex h-28 items-end px-5 pb-3.5 pt-3.5"
        style={coverStyle(`${trip.destination_city}${trip.destination_country}`)}
      >
        <div className="absolute inset-x-5 top-3.5 flex items-start justify-between gap-2">
          <Badge className={`${STAGE_TONE[trip.stage]} shadow-sm`}>{STAGE_LABEL[trip.stage]}</Badge>
          {when.upcoming && trip.stage !== "cancelled" && (
            <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-semibold text-white backdrop-blur-sm">
              {when.label}
            </span>
          )}
        </div>
        <div className="text-white">
          <p className="text-lg font-semibold leading-tight drop-shadow-sm">{trip.title}</p>
          <p className="text-sm text-white/85 drop-shadow-sm">
            {trip.destination_city}, {trip.destination_country}
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 px-5 py-4">
        <p className="text-sm text-stone-500">
          {formatDateRange(trip.start_date, trip.end_date)} · {formatNights(nights)} ·{" "}
          {formatTravellers(trip.member_count)}
        </p>

        {trip.budget_cents > 0 ? (
          <div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-stone-700">
                {formatMoney(committed, trip.currency)}
              </span>
              <span className="text-stone-400">
                sur {formatMoney(trip.budget_cents, trip.currency)}
              </span>
            </div>
            <Meter percent={percent} over={over} className="mt-2" />
          </div>
        ) : (
          <p className="text-sm text-stone-500">
            {committed > 0
              ? `${formatMoney(committed, trip.currency)} engagés · pas de budget fixé`
              : "Rien d'engagé pour l'instant"}
          </p>
        )}

        <div className="mt-auto flex items-center justify-between pt-1 text-sm">
          {savings.basis === "none" ? (
            <span className="text-stone-400">Pas encore de comparaison</span>
          ) : savings.provisional ? (
            <span className="text-amber-700">
              ≈ {formatMoney(savings.saved_cents, trip.currency)} d'écart, réservations en cours
            </span>
          ) : (
            <span className={savings.saved_cents >= 0 ? "text-emerald-700" : "text-rose-700"}>
              {savings.saved_cents >= 0 ? "Économisé " : "Dépassement de "}
              <strong>{formatMoney(Math.abs(savings.saved_cents), trip.currency)}</strong>
              {savings.saved_cents >= 0 ? " vs agence" : " vs le devis"}
            </span>
          )}
          <span aria-hidden className="text-stone-300 transition group-hover:text-brand-500">
            →
          </span>
        </div>
      </div>
    </Link>
  );
}
