import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { SubmitButton } from "@/components/submit-button";
import { coverStyle } from "@/lib/cover";
import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  Meter,
  ProvisionalNote,
  StatTile,
  buttonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { getAgency, isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { budgetStatus, settlementPlan, splitBalances, tripNights } from "@/lib/budget";
import { dossierMargin } from "@/lib/margin";
import { costsByZone, vatOnMargin } from "@/lib/vat";
import { countdown, formatDate, formatDateRange, formatNights, initials } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { estimatePackagePrice } from "@/lib/package";
import { providerFor } from "@/lib/search";
import {
  getTripSummary,
  listBookings,
  listChecklist,
  listExpenses,
  listMembers,
  listWatches,
} from "@/lib/trips";
import type { BookingType, ExpenseCategory } from "@/lib/types";
import {
  availableStageActions,
  STAGE_ACTION_LABEL,
  STAGE_LABEL,
  STAGE_TONE,
} from "@/lib/stages";
import {
  changeStageAction,
  deleteBookingAction,
  deleteExpenseAction,
  removeCompanionAction,
} from "../actions";
import { BookingForm } from "./booking-form";
import { DossierCard, DossierSkeleton } from "./dossier-card";
import { MarginCard } from "./margin-card";
import { ItineraryCard } from "./itinerary-card";
import { Checklist } from "./checklist";
import { CompanionForm } from "./companion-form";
import { ExpenseForm } from "./expense-form";
import { SearchPanel } from "./search-panel";
import { ShareSummary } from "./share-summary";
import { Watches } from "./watches";

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
  transport: "▤",
  activity: "◈",
  other: "•",
};

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: "Nourriture et boissons",
  transport: "Transports sur place",
  lodging: "Hébergement",
  activities: "Activités",
  shopping: "Achats",
  other: "Divers",
};

export default async function TripPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;

  // Le dossier est l'atelier du conseiller : il montre les coûts fournisseurs.
  // Un client n'a rien à faire ici — son voyage se lit dans son espace, qui ne
  // contient aucun montant d'achat.
  if (!isAdvisor(user)) redirect(`/mon-voyage/${id}`);

  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const currency = trip.currency;
  const members = listMembers(trip.id);
  const bookings = listBookings(trip.id);
  const expenses = listExpenses(trip.id);
  const checklist = listChecklist(trip.id);
  const watches = listWatches(trip.id);

  const budget = budgetStatus(trip, bookings, expenses);
  const margin = dossierMargin(trip, bookings);
  const agency = getAgency(user.agency_id);
  const vat = vatOnMargin({
    marginGrossCents: margin.margin_cents,
    costs: costsByZone(bookings),
    ratePercent: agency?.vat_rate,
    subjectToVat: agency ? agency.vat_on_margin === 1 : true,
  });
  const balances = splitBalances(members, expenses);
  const transfers = settlementPlan(balances);
  const actions = availableStageActions(trip, trip.my_role);
  const when = countdown(trip.start_date, trip.end_date);
  const packageEstimate = estimatePackagePrice(bookings);
  const searchProviderIsLive = providerFor("flight").live;
  const isOwner = trip.my_role === "owner";
  const editable = trip.stage !== "cancelled";

  const nameById = new Map(members.map((member) => [member.user_id, member.name]));

  const summaryText = [
    `${trip.title} — ${formatDateRange(trip.start_date, trip.end_date)}`,
    `Total : ${formatMoney(budget.committed_cents, currency)} (${formatMoney(budget.per_traveller_cents, currency)} par personne)`,
    "",
    ...balances.map((balance) =>
      balance.net_cents === 0
        ? `${balance.name} : à jour`
        : balance.net_cents > 0
          ? `${balance.name} : on lui doit ${formatMoney(balance.net_cents, currency)}`
          : `${balance.name} : doit ${formatMoney(-balance.net_cents, currency)}`,
    ),
    ...(transfers.length > 0
      ? ["", "Pour être quittes :", ...transfers.map((transfer) => `${transfer.from_name} → ${transfer.to_name} : ${formatMoney(transfer.amount_cents, currency)}`)]
      : []),
  ].join("\n");

  return (
    <div className="space-y-6">
      <Link href="/trips" className="inline-block text-sm text-stone-500 hover:text-stone-900">
        ← Retour aux voyages
      </Link>

      <header
        className="relative overflow-hidden rounded-2xl px-6 py-7 text-white shadow-sm"
        style={coverStyle(`${trip.destination_city}${trip.destination_country}`)}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`${STAGE_TONE[trip.stage]} shadow-sm`}>
                {STAGE_LABEL[trip.stage]}
              </Badge>
              {when.upcoming && trip.stage !== "cancelled" && (
                <span className="rounded-full bg-black/25 px-2.5 py-0.5 text-xs font-semibold backdrop-blur-sm">
                  {when.label}
                </span>
              )}
              {budget.over_budget && (
                <span className="rounded-full bg-rose-500/90 px-2.5 py-0.5 text-xs font-semibold">
                  Budget dépassé
                </span>
              )}
            </div>

            <h1 className="mt-2.5 text-2xl font-semibold drop-shadow-sm">{trip.title}</h1>
            <p className="mt-1 text-sm text-white/85 drop-shadow-sm">
              {trip.destination_city}, {trip.destination_country} ·{" "}
              {formatDateRange(trip.start_date, trip.end_date)} · {formatNights(tripNights(trip))}
              {!isOwner ? ` · organisé par ${trip.owner_name}` : ""}
            </p>
          </div>

          <div className="flex -space-x-2">
            {members.slice(0, 4).map((member) => (
              <span
                key={member.user_id}
                title={member.name}
                className="grid h-9 w-9 place-items-center rounded-full bg-white/90 text-xs font-semibold text-stone-700 ring-2 ring-white/40"
              >
                {initials(member.name)}
              </span>
            ))}
          </div>
        </div>

        {trip.summary && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/90">{trip.summary}</p>
        )}
      </header>

      <ErrorNotice message={error} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/trips/${trip.id}/carnet`} className={secondaryButtonClass}>
          Carnet de voyage
        </Link>
        <span className="text-xs text-stone-500">
          Tout le voyage sur une page, à imprimer ou à enregistrer en PDF.
        </span>
      </div>

      {actions.length > 0 && (
        <form action={changeStageAction} className="flex flex-wrap gap-2">
          <input type="hidden" name="trip_id" value={trip.id} />
          {actions.map((action, index) => (
            <SubmitButton
              key={action}
              name="action"
              value={action}
              // Only the natural next step is emphasised; the rest stay quiet.
              className={index === 0 && action !== "cancel" ? buttonClass : secondaryButtonClass}
            >
              {STAGE_ACTION_LABEL[action]}
            </SubmitButton>
          ))}
        </form>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Engagé"
          value={formatMoney(budget.committed_cents, currency)}
          hint={`${formatMoney(budget.booked_cents, currency)} réservé · ${formatMoney(budget.spent_cents, currency)} sur place`}
        />
        <StatTile
          label="Reste du budget"
          value={
            trip.budget_cents > 0 ? formatMoney(budget.remaining_cents, currency) : "Pas de budget"
          }
          hint={
            trip.budget_cents > 0
              ? `${budget.percent_used} % de ${formatMoney(trip.budget_cents, currency)}`
              : "Vous pouvez en fixer un à tout moment"
          }
          tone={budget.over_budget ? "warning" : "default"}
        />
        <StatTile
          label="Par personne"
          value={formatMoney(budget.per_traveller_cents, currency)}
          hint={`À ${members.length}`}
        />
        <StatTile
          label="Marge nette"
          value={margin.basis === "none" ? "—" : formatMoney(vat.margin_net_cents, currency)}
          hint={
            margin.basis === "none"
              ? "Posez un prix de vente"
              : margin.partial
                ? `Plancher : ${margin.unpriced_lines} ligne${margin.unpriced_lines > 1 ? "s" : ""} sans prix`
                : `${margin.margin_percent} % de marque${margin.basis === "package" ? " · forfait" : ""}`
          }
          tone={
            margin.basis === "none"
              ? "default"
              : margin.partial
                ? "warning"
                : margin.margin_cents > 0
                  ? "positive"
                  : "warning"
          }
        />
      </div>

      {trip.budget_cents > 0 && (
        <Card title="Budget">
          <div className="px-5 py-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-stone-600">
                {formatMoney(budget.committed_cents, currency)} sur{" "}
                {formatMoney(trip.budget_cents, currency)}
              </span>
              <span className="tabular-nums text-stone-500">{budget.percent_used} %</span>
            </div>
            <Meter percent={budget.percent_used} over={budget.over_budget} className="mt-2" />
            {budget.over_budget && (
              <p className="mt-2 text-xs text-rose-600">
                {formatMoney(-budget.remaining_cents, currency)} de plus que prévu.
              </p>
            )}
          </div>
        </Card>
      )}

      <MarginCard
        margin={margin}
        vat={vat}
        currency={currency}
        targetMarginPercent={agency?.target_margin_percent ?? 15}
      />

      {margin.basis === "none" && packageEstimate.components > 0 && (
        <Card title="Repère de prix : ce que ces prestations se vendent">
          <div className="space-y-2.5 px-5 py-4 text-sm text-stone-600">
            <p>
              Ces {packageEstimate.components} ligne{packageEstimate.components > 1 ? "s" : ""} vous
              coûtent{" "}
              <strong className="text-stone-900">
                {formatMoney(packageEstimate.your_cost_cents, currency)}
              </strong>
              . Vendues en forfait, elles se situent d'ordinaire entre{" "}
              <strong className="text-stone-900">
                {formatMoney(packageEstimate.low_cents, currency)}
              </strong>{" "}
              et{" "}
              <strong className="text-stone-900">
                {formatMoney(packageEstimate.high_cents, currency)}
              </strong>
              .
            </p>
            <p className="text-xs leading-relaxed text-stone-500">
              Repère indicatif, calculé sur les marges habituelles du secteur : faibles sur les
              vols, plus élevées sur l'hébergement et les excursions. C'est une fourchette de
              marché, pas votre prix — le vôtre se pose ligne par ligne, ou en forfait sur le
              dossier.
            </p>
          </div>
        </Card>
      )}

      <Card title="Chercher vols, logements et activités">
        <SearchPanel
          tripId={trip.id}
          destination={trip.destination_city}
          startDate={trip.start_date}
          endDate={trip.end_date}
          travellers={members.length}
          homeCity={user.home_city}
          currency={currency}
        />
      </Card>

      <Watches
        tripId={trip.id}
        watches={watches}
        currency={currency}
        liveProvider={searchProviderIsLive}
      />

      <Suspense fallback={<DossierSkeleton city={trip.destination_city} />}>
        <DossierCard trip={trip} currency={currency} />
      </Suspense>

      <ItineraryCard
        trip={trip}
        bookings={bookings}
        expenses={expenses}
        currency={currency}
        nameById={nameById}
      />

      <Checklist tripId={trip.id} items={checklist} editable={editable} />

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

      <Card title={`Dépenses sur place (${expenses.length})`}>
        {expenses.length === 0 ? (
          <EmptyState
            title="Rien de noté"
            hint="Les repas, les taxis, les billets — partagés ou personnels."
          />
        ) : (
          <ul className="divide-y divide-stone-100">
            {expenses.map((expense) => {
              const participants = expense.participant_ids;
              return (
                <li
                  key={expense.id}
                  className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900">{expense.description}</p>
                    <p className="text-xs text-stone-500">
                      {CATEGORY_LABEL[expense.category]} · {formatDate(expense.spent_on)} · payé par{" "}
                      {nameById.get(expense.paid_by) ?? "quelqu'un"}
                    </p>
                    <p className="mt-1">
                      {expense.shared ? (
                        <Badge className="bg-brand-50 text-brand-700 ring-brand-200">
                          {participants
                            ? `partagée entre ${participants
                                .map((userId) => nameById.get(userId) ?? "?")
                                .join(", ")}`
                            : "partagée entre tous"}
                        </Badge>
                      ) : (
                        <Badge>personnelle</Badge>
                      )}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="tabular-nums text-stone-800">
                      {formatMoney(expense.amount_cents, currency)}
                    </p>
                    {editable && (
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="expense_id" value={expense.id} />
                        <button
                          type="submit"
                          className="text-xs text-stone-400 hover:text-rose-600"
                          aria-label={`Supprimer ${expense.description}`}
                        >
                          Supprimer
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {editable && (
          <details className="border-t border-stone-100">
            <summary className="cursor-pointer select-none px-5 py-3.5 text-sm font-semibold text-brand-700 hover:text-brand-800">
              Noter une dépense
            </summary>
            <ExpenseForm
              tripId={trip.id}
              currency={currency}
              defaultDate={trip.start_date}
              members={members.map((member) => ({ user_id: member.user_id, name: member.name }))}
              currentUserId={user.id}
            />
          </details>
        )}
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Qui vient">
          <ul className="divide-y divide-stone-100">
            {members.map((member) => (
              <li
                key={member.user_id}
                className="flex items-center justify-between gap-3 px-5 py-3.5"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600">
                    {initials(member.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900">
                      {member.name}
                      {member.user_id === user.id && (
                        <span className="ml-1.5 text-xs text-stone-400">vous</span>
                      )}
                    </p>
                    <p className="truncate text-xs text-stone-500">{member.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      member.role === "owner"
                        ? "bg-brand-50 text-brand-700 ring-brand-200"
                        : "bg-stone-100 text-stone-600 ring-stone-200"
                    }
                  >
                    {member.role === "owner" ? "organisateur" : "compagnon"}
                  </Badge>
                  {isOwner && member.role !== "owner" && (
                    <form action={removeCompanionAction}>
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <input type="hidden" name="user_id" value={member.user_id} />
                      <button type="submit" className="text-xs text-stone-400 hover:text-rose-600">
                        Retirer
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {isOwner && editable && <CompanionForm tripId={trip.id} />}
        </Card>

        <Card title="Qui doit quoi">
          {expenses.length === 0 || members.length < 2 ? (
            <EmptyState
              title="Rien à régler"
              hint="Dès qu'une dépense partagée est notée, le décompte apparaît ici."
            />
          ) : (
            <>
              <ul className="divide-y divide-stone-100">
                {balances.map((balance) => (
                  <li
                    key={balance.user_id}
                    className="flex items-center justify-between gap-3 px-5 py-3 text-sm"
                  >
                    <span className="text-stone-700">{balance.name}</span>
                    <span className="text-right">
                      <span
                        className={`tabular-nums ${
                          balance.net_cents > 0
                            ? "text-emerald-700"
                            : balance.net_cents < 0
                              ? "text-rose-700"
                              : "text-stone-500"
                        }`}
                      >
                        {balance.net_cents === 0
                          ? "à jour"
                          : balance.net_cents > 0
                            ? `on lui doit ${formatMoney(balance.net_cents, currency)}`
                            : `doit ${formatMoney(-balance.net_cents, currency)}`}
                      </span>
                      <p className="text-xs text-stone-400">
                        a payé {formatMoney(balance.paid_cents, currency)} · part{" "}
                        {formatMoney(balance.share_cents, currency)}
                      </p>
                    </span>
                  </li>
                ))}
              </ul>

              {transfers.length > 0 && (
                <div className="border-t border-stone-100 bg-stone-50 px-5 py-3.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                    Pour être quittes
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-stone-700">
                    {transfers.map((transfer) => (
                      <li key={`${transfer.from_user_id}-${transfer.to_user_id}`}>
                        {transfer.from_name} → {transfer.to_name} :{" "}
                        <strong>{formatMoney(transfer.amount_cents, currency)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <ShareSummary text={summaryText} />
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
