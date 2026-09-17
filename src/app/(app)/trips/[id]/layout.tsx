import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Badge, StatTile, buttonClass, secondaryButtonClass } from "@/components/ui";
import { TripTabs } from "@/components/trip-tabs";
import { getAgency, isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { budgetStatus, tripNights } from "@/lib/budget";
import { coverStyle } from "@/lib/cover";
import { countdown, formatDateRange, formatNights, initials } from "@/lib/format";
import { dossierMargin } from "@/lib/margin";
import { formatMoney } from "@/lib/money";
import { listQuotes } from "@/lib/quotes";
import { availableStageActions, STAGE_ACTION_LABEL, STAGE_LABEL, STAGE_TONE } from "@/lib/stages";
import { getTripSummary, listBookings, listExpenses, listMembers } from "@/lib/trips";
import { costsByZone, vatOnMargin } from "@/lib/vat";
import { changeStageAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * L'en-tête du dossier, partagé par tous ses onglets.
 *
 * Le dossier était une page unique de six cents lignes où il fallait faire
 * défiler pour trouver la marge, puis remonter pour changer d'étape. Ce sont
 * maintenant cinq routes sous un même en-tête : chaque onglet a son adresse,
 * donc le retour du navigateur marche, un lien s'envoie à un collègue, et la
 * page ne charge que ce qu'elle montre.
 *
 * Ce qui reste ici est ce qu'on veut sous les yeux en permanence : où on en
 * est, ce que ça pèse, et l'action suivante.
 */
export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;

  // Un client qui suit le lien d'un dossier veut voir *ce* voyage : on
  // l'emmène à sa version, pas à la liste.
  if (!isAdvisor(user)) redirect(`/mon-voyage/${id}`);

  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const currency = trip.currency;
  const members = listMembers(trip.id);
  const bookings = listBookings(trip.id);
  const expenses = listExpenses(trip.id);
  const budget = budgetStatus(trip, bookings, expenses);
  const margin = dossierMargin(trip, bookings);
  const agency = getAgency(user.agency_id);
  const vat = vatOnMargin({
    marginGrossCents: margin.margin_cents,
    costs: costsByZone(bookings),
    ratePercent: agency?.vat_rate,
    subjectToVat: agency ? agency.vat_on_margin === 1 : true,
  });
  const quotes = listQuotes(trip.id);
  const actions = availableStageActions(trip, trip.my_role);
  const when = countdown(trip.start_date, trip.end_date);
  const isOwner = trip.my_role === "owner";

  return (
    <div className="space-y-6">
      <Link href="/trips" className="inline-block text-sm text-stone-500 hover:text-stone-900">
        ← Tous les dossiers
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
              {!isOwner ? ` · suivi par ${trip.owner_name}` : ""}
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

      <div className="flex flex-wrap items-center gap-2">
        {actions.length > 0 && (
          <form action={changeStageAction} className="flex flex-wrap gap-2">
            <input type="hidden" name="trip_id" value={trip.id} />
            {actions.map((action, index) => (
              <SubmitButton
                key={action}
                name="action"
                value={action}
                // Seule l'étape naturelle est mise en avant ; les autres se taisent.
                className={index === 0 && action !== "cancel" ? buttonClass : secondaryButtonClass}
              >
                {STAGE_ACTION_LABEL[action]}
              </SubmitButton>
            ))}
          </form>
        )}
        <Link href={`/carnet/${trip.id}`} className={secondaryButtonClass}>
          Carnet de voyage
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Vendu"
          value={margin.basis === "none" ? "—" : formatMoney(margin.sell_cents, currency)}
          hint={margin.basis === "package" ? "Forfait posé sur le dossier" : "Somme des lignes"}
        />
        <StatTile
          label="Achats"
          value={formatMoney(margin.cost_cents, currency)}
          hint={`${bookings.length} ligne${bookings.length > 1 ? "s" : ""}`}
        />
        <StatTile
          label="Marge nette"
          value={margin.basis === "none" ? "—" : formatMoney(vat.margin_net_cents, currency)}
          hint={
            margin.basis === "none"
              ? "Posez un prix de vente"
              : margin.partial
                ? "Pas encore ferme"
                : `${margin.margin_percent} % de marque`
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
        <StatTile
          label="Par personne"
          value={formatMoney(budget.per_traveller_cents, currency)}
          hint={`À ${members.length}`}
        />
      </div>

      <TripTabs
        tripId={trip.id}
        counts={{
          bookings: bookings.length,
          quotes: quotes.length,
          travellers: members.length,
          expenses: expenses.length,
        }}
      />

      {children}
    </div>
  );
}
