import { notFound, redirect } from "next/navigation";
import { Card, Meter } from "@/components/ui";
import { getAgency, isAdvisor } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { budgetStatus } from "@/lib/budget";
import { dossierMargin } from "@/lib/margin";
import { formatMoney } from "@/lib/money";
import { estimatePackagePrice } from "@/lib/package";
import { providerFor } from "@/lib/search";
import { getTripSummary, listBookings, listExpenses, listMembers, listWatches } from "@/lib/trips";
import { costsByZone, vatOnMargin } from "@/lib/vat";
import { MarginCard } from "../margin-card";
import { SearchPanel } from "../search-panel";
import { Watches } from "../watches";

export const dynamic = "force-dynamic";

/** Ce que le dossier coûte, ce qu'il rapporte, et où trouver mieux. */
export default async function PricingPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (!isAdvisor(user)) redirect("/mon-voyage");

  const { id } = await params;
  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const currency = trip.currency;
  const members = listMembers(trip.id);
  const bookings = listBookings(trip.id);
  const expenses = listExpenses(trip.id);
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
  const packageEstimate = estimatePackagePrice(bookings);
  const searchProviderIsLive = providerFor("flight").live;

  return (
    <div className="space-y-6">
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


      <Watches
        tripId={trip.id}
        watches={watches}
        currency={currency}
        liveProvider={searchProviderIsLive}
      />
    </div>
  );
}
