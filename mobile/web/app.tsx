/**
 * Journey Valley pour Android.
 *
 * Même produit qu'en ligne, un seul appareil : préparer ses voyages, chercher
 * vols, logements et activités, surveiller les prix, lire la fiche destination,
 * imprimer son carnet, noter ce qu'on a payé face au devis d'une agence et
 * partager les frais avec ceux qui viennent.
 *
 * Les calculs viennent des modules partagés (`budget.ts`, `stages.ts`,
 * `watch.ts`, les parseurs d'API), pour que le téléphone et le site ne puissent
 * jamais donner deux chiffres différents. Tout fonctionne sans réseau ; ce qui
 * en a besoin le dit, et se souvient de sa dernière réponse.
 */
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  budgetStatus,
  savingsSummary,
  settlementPlan,
  splitBalances,
  tripNights,
} from "../../src/lib/budget";
import { coverStyle } from "../../src/lib/cover";
import {
  countdown,
  formatDate,
  formatDateRange,
  formatNights,
  formatTravellers,
  initials,
} from "../../src/lib/format";
import { buildItinerary } from "../../src/lib/itinerary";
import { formatMoney, parseAmountToCents, percentOf } from "../../src/lib/money";
import { estimatePackagePrice } from "../../src/lib/package";
import {
  countryCodeFromName,
  OFFICIAL_ADVICE_URL,
  practicalFor,
} from "../../src/lib/practical";
import {
  availableStageActions,
  checkStageChange,
  STAGE_ACTION_LABEL,
  STAGE_LABEL,
  type StageAction,
} from "../../src/lib/stages";
import type { BookingType, ExpenseCategory, Trip, TripStage } from "../../src/lib/types";
import { describeWatch } from "../../src/lib/watch";
import type { SearchKind, SearchQuery, SearchResult } from "../../src/lib/search/types";
import { buildDossier, checkWatch, search, type MobileDossier, type MobileSearchOutcome } from "./api";
import { networkAllowed, printPage, setNetworkAllowed } from "./net";
import * as store from "./store";

const CURRENCY = store.CURRENCY;

const STAGE_TONE: Record<TripStage, string> = {
  idea: "bg-stone-100 text-stone-600",
  planning: "bg-amber-100 text-amber-800",
  booked: "bg-brand-100 text-brand-800",
  travelling: "bg-emerald-100 text-emerald-800",
  completed: "bg-stone-100 text-stone-600",
  cancelled: "bg-stone-100 text-stone-400",
};

const BOOKING_LABEL: Record<BookingType, string> = {
  flight: "Vol",
  stay: "Logement",
  transport: "Transport",
  activity: "Activité",
  other: "Autre",
};

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: "Nourriture et boissons",
  transport: "Transports sur place",
  lodging: "Hébergement",
  activities: "Activités",
  shopping: "Achats",
  other: "Divers",
};

type Screen =
  | { name: "trips" }
  | { name: "trip"; id: number }
  | { name: "carnet"; id: number }
  | { name: "new" }
  | { name: "savings" }
  | { name: "settings" };

function App() {
  const [screen, setScreen] = useState<Screen>({ name: "trips" });
  // Bumped after every write so the screens re-read the store.
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);

  // Android's back button: step back inside the app before leaving it. The
  // travel book goes back to its trip, not to the list — that is where you came
  // from.
  useEffect(() => {
    window.JVBack = () => {
      if (screen.name === "trips") return false;
      setScreen(screen.name === "carnet" ? { name: "trip", id: screen.id } : { name: "trips" });
      return true;
    };
    return () => {
      delete window.JVBack;
    };
  }, [screen]);

  const body = (() => {
    switch (screen.name) {
      case "trips":
        return <TripsScreen revision={revision} onOpen={(id) => setScreen({ name: "trip", id })} />;
      case "trip":
        return (
          <TripScreen
            tripId={screen.id}
            revision={revision}
            refresh={refresh}
            onBack={() => setScreen({ name: "trips" })}
            onCarnet={() => setScreen({ name: "carnet", id: screen.id })}
          />
        );
      case "carnet":
        return (
          <CarnetScreen
            tripId={screen.id}
            revision={revision}
            onBack={() => setScreen({ name: "trip", id: screen.id })}
          />
        );
      case "new":
        return (
          <NewTripScreen
            onCancel={() => setScreen({ name: "trips" })}
            onCreated={(id) => {
              refresh();
              setScreen({ name: "trip", id });
            }}
          />
        );
      case "savings":
        return <SavingsScreen revision={revision} onOpen={(id) => setScreen({ name: "trip", id })} />;
      case "settings":
        return (
          <SettingsScreen
            onChanged={() => {
              refresh();
              setScreen({ name: "trips" });
            }}
          />
        );
    }
  })();

  return (
    <div className="flex min-h-screen flex-col bg-stone-50">
      <header className="sticky top-0 z-20 flex items-center gap-2.5 bg-brand-700 px-4 py-3.5 text-white shadow-sm print:hidden">
        <span aria-hidden className="grid h-8 w-8 place-items-center rounded-xl bg-white/20 text-base">
          ◇
        </span>
        <span className="text-base font-semibold">Journey Valley</span>
        {screen.name === "trips" && (
          <button
            type="button"
            onClick={() => setScreen({ name: "new" })}
            className="ml-auto rounded-xl bg-white/15 px-3.5 py-2 text-sm font-semibold active:bg-white/25"
          >
            + Voyage
          </button>
        )}
      </header>

      <main className="flex-1 px-4 pb-24 pt-4 print:p-0">{body}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] print:hidden">
        {(
          [
            { key: "trips", label: "Voyages", icon: "✈" },
            { key: "savings", label: "Économies", icon: "↓" },
            { key: "settings", label: "Réglages", icon: "⚙" },
          ] as const
        ).map((tab) => {
          const active =
            screen.name === tab.key ||
            (tab.key === "trips" && (screen.name === "trip" || screen.name === "carnet"));
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setScreen({ name: tab.key } as Screen)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                active ? "text-brand-700" : "text-stone-500"
              }`}
            >
              <span aria-hidden className="text-lg leading-none">
                {tab.icon}
              </span>
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

/* --------------------------------------------------------------- écrans */

function TripsScreen({ revision, onOpen }: { revision: number; onOpen: (id: number) => void }) {
  const trips = useMemo(() => store.listTrips(), [revision]);

  if (trips.length === 0) {
    return (
      <Empty
        title="Aucun voyage pour l'instant"
        hint="Touchez « + Voyage » pour commencer — une idée sans dates, ça compte aussi."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {trips.map((trip) => {
        const bookings = store.listBookings(trip.id);
        const expenses = store.listExpenses(trip.id);
        const budget = budgetStatus(trip, bookings, expenses);
        const savings = savingsSummary(trip, bookings);
        const when = countdown(trip.start_date, trip.end_date);

        return (
          <li key={trip.id}>
            <button
              type="button"
              onClick={() => onOpen(trip.id)}
              className="w-full overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm active:bg-stone-50"
            >
              <div
                className="relative flex h-24 items-end px-4 pb-3 pt-3"
                style={coverStyle(`${trip.destination_city}${trip.destination_country}`)}
              >
                <div className="absolute inset-x-4 top-3 flex items-start justify-between gap-2">
                  <Pill className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Pill>
                  {when.upcoming && trip.stage !== "cancelled" && (
                    <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-semibold text-white">
                      {when.label}
                    </span>
                  )}
                </div>
                <div className="text-white">
                  <p className="text-base font-semibold leading-tight">{trip.title}</p>
                  <p className="text-xs text-white/85">
                    {trip.destination_city}, {trip.destination_country}
                  </p>
                </div>
              </div>

              <div className="space-y-2.5 px-4 py-3.5">
                <p className="text-xs text-stone-500">
                  {formatDateRange(trip.start_date, trip.end_date)} ·{" "}
                  {formatNights(tripNights(trip))}
                </p>

                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-stone-700">
                    {formatMoney(budget.committed_cents, CURRENCY)}
                    {trip.budget_cents > 0 && (
                      <span className="text-stone-400">
                        {" "}
                        sur {formatMoney(trip.budget_cents, CURRENCY)}
                      </span>
                    )}
                  </span>
                  {savings.basis !== "none" && (
                    <span
                      className={
                        savings.provisional
                          ? "text-amber-700"
                          : savings.saved_cents >= 0
                            ? "text-emerald-700"
                            : "text-rose-700"
                      }
                    >
                      {savings.provisional ? "≈ " : savings.saved_cents >= 0 ? "économisé " : "+ "}
                      {formatMoney(Math.abs(savings.saved_cents), CURRENCY)}
                    </span>
                  )}
                </div>

                {trip.budget_cents > 0 && (
                  <Meter percent={budget.percent_used} over={budget.over_budget} />
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function TripScreen({
  tripId,
  revision,
  refresh,
  onBack,
  onCarnet,
}: {
  tripId: number;
  revision: number;
  refresh: () => void;
  onBack: () => void;
  onCarnet: () => void;
}) {
  const trip = useMemo(() => store.getTrip(tripId), [tripId, revision]);
  const [error, setError] = useState<string | null>(null);

  if (!trip) {
    return <Empty title="Ce voyage n'existe plus" hint="Il a été supprimé sur cet appareil." />;
  }

  const travellers = store.listTravellers(tripId);
  const bookings = store.listBookings(tripId);
  const expenses = store.listExpenses(tripId);
  const checklist = store.listChecklist(tripId);
  const watches = store.listWatches(tripId);
  const budget = budgetStatus(trip, bookings, expenses);
  const savings = savingsSummary(trip, bookings);
  const balances = splitBalances(travellers, expenses);
  const transfers = settlementPlan(balances);
  const actions = availableStageActions(trip, "owner");
  const when = countdown(trip.start_date, trip.end_date);
  const packageEstimate = estimatePackagePrice(bookings);
  const itinerary = buildItinerary(trip, bookings, expenses);
  const practical = practicalFor(
    countryCodeFromName(trip.destination_country) ?? trip.destination_country,
  );
  const nameById = new Map(travellers.map((traveller) => [traveller.user_id, traveller.name]));

  const runAction = (action: StageAction) => {
    const check = checkStageChange(trip, action, "owner");
    if (!check.allowed || !check.nextStage) {
      setError(check.reason ?? "Impossible pour l'instant.");
      return;
    }
    setError(null);
    store.setStage(trip.id, check.nextStage);
    refresh();
  };

  const summaryText = [
    `${trip.title} — ${formatDateRange(trip.start_date, trip.end_date)}`,
    `Total : ${formatMoney(budget.committed_cents, CURRENCY)} (${formatMoney(budget.per_traveller_cents, CURRENCY)} par personne)`,
    "",
    ...balances.map((balance) =>
      balance.net_cents === 0
        ? `${balance.name} : à jour`
        : balance.net_cents > 0
          ? `${balance.name} : on lui doit ${formatMoney(balance.net_cents, CURRENCY)}`
          : `${balance.name} : doit ${formatMoney(-balance.net_cents, CURRENCY)}`,
    ),
    ...(transfers.length > 0
      ? [
          "",
          "Pour être quittes :",
          ...transfers.map(
            (transfer) =>
              `${transfer.from_name} → ${transfer.to_name} : ${formatMoney(transfer.amount_cents, CURRENCY)}`,
          ),
        ]
      : []),
  ].join("\n");

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-stone-500">
        ← Tous les voyages
      </button>

      <div
        className="overflow-hidden rounded-2xl px-4 py-4 text-white"
        style={coverStyle(`${trip.destination_city}${trip.destination_country}`)}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Pill className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Pill>
          {when.upcoming && trip.stage !== "cancelled" && (
            <span className="rounded-full bg-black/25 px-2 py-0.5 text-xs font-semibold">
              {when.label}
            </span>
          )}
        </div>
        <h1 className="mt-2 text-xl font-semibold">{trip.title}</h1>
        <p className="mt-1 text-sm text-white/85">
          {trip.destination_city}, {trip.destination_country}
        </p>
        <p className="text-sm text-white/85">
          {formatDateRange(trip.start_date, trip.end_date)} · {formatNights(tripNights(trip))} ·{" "}
          {formatTravellers(travellers.length)}
        </p>
        {trip.summary && <p className="mt-2.5 text-sm leading-relaxed text-white/90">{trip.summary}</p>}
      </div>

      {error && (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">
          {error}
        </p>
      )}

      {actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {actions.map((action, index) => (
            <button
              key={action}
              type="button"
              onClick={() => runAction(action)}
              className={
                index === 0 && action !== "cancel"
                  ? "rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white active:bg-brand-700"
                  : "rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100"
              }
            >
              {STAGE_ACTION_LABEL[action]}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Engagé" value={formatMoney(budget.committed_cents, CURRENCY)} />
        <Tile
          label="Reste du budget"
          value={trip.budget_cents > 0 ? formatMoney(budget.remaining_cents, CURRENCY) : "—"}
          tone={budget.over_budget ? "warn" : "plain"}
        />
        <Tile label="Par personne" value={formatMoney(budget.per_traveller_cents, CURRENCY)} />
        <Tile
          label="Économisé"
          value={savings.basis === "none" ? "—" : formatMoney(savings.saved_cents, CURRENCY)}
          tone={
            savings.basis !== "none" && !savings.provisional && savings.saved_cents > 0
              ? "good"
              : savings.provisional
                ? "warn"
                : "plain"
          }
        />
      </div>

      {trip.budget_cents > 0 && (
        <Card title="Budget">
          <div className="px-4 py-3">
            <div className="flex items-baseline justify-between text-sm text-stone-600">
              <span>
                {formatMoney(budget.committed_cents, CURRENCY)} sur{" "}
                {formatMoney(trip.budget_cents, CURRENCY)}
              </span>
              <span>{budget.percent_used} %</span>
            </div>
            <Meter percent={budget.percent_used} over={budget.over_budget} />
            {budget.over_budget && (
              <p className="mt-2 text-xs text-rose-600">
                {formatMoney(-budget.remaining_cents, CURRENCY)} de plus que prévu.
              </p>
            )}
          </div>
        </Card>
      )}

      {savings.basis !== "none" && (
        <Card title={savings.basis === "trip_quote" ? "Face au forfait" : "Face à vos devis"}>
          <div className="space-y-3 px-4 py-3">
            <CompareBar
              label="Devis agence"
              value={savings.agency_cents}
              max={Math.max(savings.agency_cents, savings.your_cost_cents)}
              color="bg-orange-500"
            />
            <CompareBar
              label="Vous avez payé"
              value={savings.your_cost_cents}
              max={Math.max(savings.agency_cents, savings.your_cost_cents)}
              color="bg-brand-600"
            />
            {savings.provisional ? (
              <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                Le voyage n'est pas entièrement réservé : le devis couvre tout, vos réservations
                pas encore. L'écart de {formatMoney(savings.saved_cents, CURRENCY)} est une
                estimation, et ne compte pas dans le total des économies.
              </p>
            ) : (
              <p className="text-sm text-stone-600">
                {savings.saved_cents >= 0 ? (
                  <>
                    Réserver vous-même vous garde{" "}
                    <strong className="text-emerald-700">
                      {formatMoney(savings.saved_cents, CURRENCY)}
                    </strong>{" "}
                    ({savings.saved_percent} %).
                  </>
                ) : (
                  <>
                    C'est{" "}
                    <strong className="text-rose-700">
                      {formatMoney(-savings.saved_cents, CURRENCY)}
                    </strong>{" "}
                    de plus que le devis.
                  </>
                )}
              </p>
            )}
          </div>
        </Card>
      )}

      {savings.basis === "none" && packageEstimate.components > 0 && (
        <Card title="Estimation : le même voyage en formule">
          <div className="space-y-2 px-4 py-3 text-sm text-stone-600">
            <p>
              Vos réservations totalisent{" "}
              <strong className="text-stone-900">
                {formatMoney(packageEstimate.your_cost_cents, CURRENCY)}
              </strong>
              . En agence, elles tourneraient plutôt autour de{" "}
              <strong className="text-stone-900">
                {formatMoney(packageEstimate.low_cents, CURRENCY)} –{" "}
                {formatMoney(packageEstimate.high_cents, CURRENCY)}
              </strong>
              .
            </p>
            <p className="text-xs leading-relaxed text-stone-500">
              Ordre de grandeur calculé à partir des marges habituelles du secteur. Il ne compte
              pas dans vos économies : pour ça, saisissez un vrai devis.
            </p>
          </div>
        </Card>
      )}

      <SearchCard trip={trip} travellers={travellers.length} refresh={refresh} />

      <WatchesCard watches={watches} refresh={refresh} />

      <DossierCard trip={trip} />

      {(bookings.length > 0 || expenses.length > 0) && (
        <Card title="Jour par jour">
          <ol className="divide-y divide-stone-100">
            {itinerary.days.map((day) => (
              <li key={day.date} className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-stone-900">
                    Jour {day.day_number}
                    <span className="ml-2 font-normal text-stone-500">{formatDate(day.date)}</span>
                  </p>
                  {day.total_cents > 0 && (
                    <span className="text-sm tabular-nums text-stone-600">
                      {formatMoney(day.total_cents, CURRENCY)}
                    </span>
                  )}
                </div>
                {day.starts.length === 0 &&
                day.ongoing.length === 0 &&
                day.returns.length === 0 &&
                day.expenses.length === 0 ? (
                  <p className="mt-1 text-sm text-stone-400">Rien de prévu.</p>
                ) : (
                  <ul className="mt-1 space-y-1 text-sm text-stone-700">
                    {day.starts.map((booking) => (
                      <li key={`s${booking.id}`}>
                        <strong className="font-medium">{booking.vendor}</strong>
                        {booking.description ? ` — ${booking.description}` : ""}
                      </li>
                    ))}
                    {day.returns.map((booking) => (
                      <li key={`r${booking.id}`} className="text-stone-600">
                        {booking.vendor} — retour
                      </li>
                    ))}
                    {day.ongoing.map((booking) => (
                      <li key={`o${booking.id}`} className="text-xs text-stone-500">
                        {booking.vendor} — en cours
                      </li>
                    ))}
                    {day.expenses.map((expense) => (
                      <li key={`e${expense.id}`} className="text-xs text-stone-500">
                        {expense.description} · {formatMoney(expense.amount_cents, CURRENCY)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </Card>
      )}

      {practical && (
        <Card title="En cas de pépin">
          <dl className="divide-y divide-stone-100 text-sm">
            {[
              ["Urgences", practical.emergency],
              ["Monnaie", practical.currency],
              ["Prises", `${practical.plugs} · ${practical.voltage}`],
              ["On roule à", practical.drive],
              ["Pourboire", practical.tipping],
              ["Entrée", practical.entry],
            ].map(([label, value]) => (
              <div key={label} className="px-4 py-2.5">
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {label}
                </dt>
                <dd className="mt-0.5 text-stone-800">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="border-t border-stone-100 px-4 py-3 text-xs leading-relaxed text-stone-500">
            Informations indicatives, disponibles sans réseau. Les conditions d'entrée changent :
            vérifiez sur France Diplomatie ({OFFICIAL_ADVICE_URL}) avant de partir.
          </p>
        </Card>
      )}

      <ChecklistCard tripId={trip.id} items={checklist} refresh={refresh} />

      <Card title={`Réservations (${bookings.length})`}>
        {bookings.length === 0 ? (
          <p className="px-4 py-4 text-sm text-stone-500">Rien de réservé pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {bookings.map((booking) => (
              <li key={booking.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{booking.vendor}</p>
                  <p className="text-xs text-stone-500">
                    {BOOKING_LABEL[booking.type]}
                    {booking.description ? ` · ${booking.description}` : ""}
                    {booking.nights ? ` · ${booking.nights} nuits` : ""}
                  </p>
                  <p className="text-xs text-stone-400">{formatDate(booking.start_at)}</p>
                  {booking.agency_quote_cents > 0 && (
                    <p className="text-xs text-emerald-700">
                      agence {formatMoney(booking.agency_quote_cents, CURRENCY)} · −
                      {formatMoney(booking.agency_quote_cents - booking.amount_cents, CURRENCY)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums text-stone-800">
                    {formatMoney(booking.amount_cents, CURRENCY)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      store.deleteBooking(booking.id);
                      refresh();
                    }}
                    className="text-xs text-stone-400"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Expander label="Ajouter une réservation">
          <BookingForm tripId={trip.id} defaultDate={trip.start_date} onAdded={refresh} />
        </Expander>
      </Card>

      <Card title={`Dépenses (${expenses.length})`}>
        {expenses.length === 0 ? (
          <p className="px-4 py-4 text-sm text-stone-500">Rien de noté pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{expense.description}</p>
                  <p className="text-xs text-stone-500">
                    {CATEGORY_LABEL[expense.category]} · {formatDate(expense.spent_on)} ·{" "}
                    {nameById.get(expense.paid_by) ?? "quelqu'un"}
                  </p>
                  <p className="text-xs text-stone-400">
                    {expense.shared
                      ? expense.participant_ids
                        ? `partagée entre ${expense.participant_ids
                            .map((userId) => nameById.get(userId) ?? "?")
                            .join(", ")}`
                        : "partagée entre tous"
                      : "personnelle"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums text-stone-800">
                    {formatMoney(expense.amount_cents, CURRENCY)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      store.deleteExpense(expense.id);
                      refresh();
                    }}
                    className="text-xs text-stone-400"
                  >
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Expander label="Noter une dépense">
          <ExpenseForm
            tripId={trip.id}
            travellers={travellers}
            defaultDate={trip.start_date}
            onAdded={refresh}
          />
        </Expander>
      </Card>

      <Card title="Qui vient">
        <ul className="divide-y divide-stone-100">
          {travellers.map((traveller) => {
            const balance = balances.find((entry) => entry.user_id === traveller.user_id);
            return (
              <li
                key={traveller.user_id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-semibold text-stone-600">
                    {initials(traveller.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900">
                      {traveller.name}
                      {traveller.is_me ? (
                        <span className="ml-1 text-xs text-stone-400">vous</span>
                      ) : null}
                    </p>
                    {balance && (
                      <p className="text-xs text-stone-500">
                        a payé {formatMoney(balance.paid_cents, CURRENCY)} · part{" "}
                        {formatMoney(balance.share_cents, CURRENCY)}
                      </p>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {balance && (
                    <p
                      className={`text-sm tabular-nums ${
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
                          ? `on lui doit ${formatMoney(balance.net_cents, CURRENCY)}`
                          : `doit ${formatMoney(-balance.net_cents, CURRENCY)}`}
                    </p>
                  )}
                  {!traveller.is_me && (
                    <button
                      type="button"
                      onClick={() => {
                        store.removeTraveller(trip.id, traveller.user_id);
                        refresh();
                      }}
                      className="text-xs text-stone-400"
                    >
                      Retirer
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <TravellerForm tripId={trip.id} onAdded={refresh} />

        {transfers.length > 0 && (
          <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
              Pour être quittes
            </p>
            <ul className="mt-2 space-y-1 text-sm text-stone-700">
              {transfers.map((transfer) => (
                <li key={`${transfer.from_user_id}-${transfer.to_user_id}`}>
                  {transfer.from_name} → {transfer.to_name} :{" "}
                  <strong>{formatMoney(transfer.amount_cents, CURRENCY)}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}

        {expenses.length > 0 && travellers.length > 1 && <ShareButton text={summaryText} />}
      </Card>

      <button
        type="button"
        onClick={onCarnet}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm font-semibold text-stone-700 active:bg-stone-100"
      >
        Ouvrir le carnet de voyage
      </button>

      <button
        type="button"
        onClick={() => {
          if (confirm(`Supprimer « ${trip.title} » et tout ce qu'il contient ?`)) {
            store.deleteTrip(trip.id);
            refresh();
            onBack();
          }
        }}
        className="w-full rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-rose-700 active:bg-rose-50"
      >
        Supprimer ce voyage
      </button>
    </div>
  );
}

function ChecklistCard({
  tripId,
  items,
  refresh,
}: {
  tripId: number;
  items: store.LocalChecklistItem[];
  refresh: () => void;
}) {
  const done = items.filter((item) => item.done).length;
  const percent = items.length === 0 ? 0 : Math.round((done / items.length) * 100);

  return (
    <Card title={items.length > 0 ? `Avant de partir (${done}/${items.length})` : "Avant de partir"}>
      {items.length === 0 ? (
        <div className="space-y-3 px-4 py-4 text-center">
          <p className="text-sm text-stone-500">
            Passeport, assurance, adaptateur… ce qu'il ne faut pas oublier.
          </p>
          <button
            type="button"
            onClick={() => {
              store.addChecklistTemplate(tripId);
              refresh();
            }}
            className="rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100"
          >
            Ajouter les essentiels
          </button>
        </div>
      ) : (
        <>
          <div className="px-4 pt-3">
            <Meter percent={percent} />
          </div>
          <ul className="mt-2 divide-y divide-stone-100">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    store.toggleChecklistItem(item.id);
                    refresh();
                  }}
                  aria-label={item.done ? `Décocher ${item.label}` : `Cocher ${item.label}`}
                  className={`grid h-6 w-6 shrink-0 place-items-center rounded-md border text-xs ${
                    item.done
                      ? "border-brand-600 bg-brand-600 text-white"
                      : "border-stone-300 bg-white text-transparent"
                  }`}
                >
                  ✓
                </button>
                <span
                  className={`flex-1 text-sm ${item.done ? "text-stone-400 line-through" : "text-stone-800"}`}
                >
                  {item.label}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    store.deleteChecklistItem(item.id);
                    refresh();
                  }}
                  className="text-xs text-stone-400"
                >
                  Supprimer
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <form
        className="flex gap-2 border-t border-stone-100 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const label = String(new FormData(form).get("label") ?? "").trim();
          if (!label) return;
          store.addChecklistItem(tripId, label);
          form.reset();
          refresh();
        }}
      >
        <input name="label" placeholder="Ajouter une chose à faire" className={`${inputClass} flex-1`} />
        <button
          type="submit"
          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 active:bg-stone-100"
        >
          Ajouter
        </button>
      </form>
    </Card>
  );
}

/* ------------------------------------------------- recherche et alertes */

const SEARCH_KINDS: Array<{ value: SearchKind; label: string }> = [
  { value: "flight", label: "Vol" },
  { value: "stay", label: "Logement" },
  { value: "activity", label: "Activité" },
];

/**
 * Chercher un vol, un logement ou une activité, ajouter ce qu'on retient au
 * voyage, et poser une alerte sur le prix — sans quitter l'application.
 *
 * Les activités viennent d'OpenStreetMap : des lieux réels, sans tarif, donc on
 * demande le prix plutôt que d'en inventer un. Les vols et les logements sont
 * des estimations tant qu'aucun fournisseur n'est branché, et l'écran le dit.
 */
function SearchCard({
  trip,
  travellers,
  refresh,
}: {
  trip: Trip;
  travellers: number;
  refresh: () => void;
}) {
  const [kind, setKind] = useState<SearchKind>("flight");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<MobileSearchOutcome | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<string[]>([]);

  /** Reads the form, or returns the message to show instead. */
  function readQuery(form: HTMLFormElement): SearchQuery | string {
    const data = new FormData(form);
    const read = (key: string) => String(data.get(key) ?? "").trim();

    const destination = read("destination");
    if (!destination) return "Vous cherchez où ?";

    return {
      kind,
      origin: kind === "flight" ? read("origin") || undefined : undefined,
      destination,
      country: trip.destination_country || undefined,
      start_date: read("start_date") || trip.start_date,
      end_date: kind === "activity" ? undefined : read("end_date") || trip.end_date,
      travellers: Math.max(1, Number(read("travellers")) || travellers),
    };
  }

  async function runSearch(form: HTMLFormElement) {
    const query = readQuery(form);
    if (typeof query === "string") return setError(query);

    setError(null);
    setNotice(null);
    setAdded([]);
    setBusy(true);
    try {
      setOutcome(await search(query));
    } catch (failure) {
      setOutcome(null);
      setError(failure instanceof Error ? failure.message : "La recherche n'a pas abouti.");
    } finally {
      setBusy(false);
    }
  }

  function createWatch(form: HTMLFormElement) {
    const query = readQuery(form);
    if (typeof query === "string") return setError(query);

    const raw = String(new FormData(form).get("target") ?? "").trim();
    const target = raw === "" ? 0 : parseAmountToCents(raw);
    if (target === null) return setError("Le prix cible n'est pas un montant lisible.");

    store.addWatch({
      trip_id: trip.id,
      kind: query.kind,
      origin: query.origin ?? null,
      destination: query.destination,
      start_date: query.start_date,
      end_date: query.end_date ?? null,
      travellers: query.travellers,
      target_cents: target,
    });
    setError(null);
    setNotice("Alerte créée : elle apparaît juste en dessous.");
    refresh();
  }

  function importResult(result: SearchResult) {
    const amount = result.price_known
      ? result.price_cents
      : parseAmountToCents(prices[result.id] ?? "");

    if (amount === null || amount <= 0) {
      return setError("Indiquez le prix de cette prestation — la source ne le publie pas.");
    }

    store.addBooking({
      trip_id: trip.id,
      type: result.kind,
      vendor: result.vendor,
      description: result.description,
      start_at: result.start_at,
      end_at: result.end_at,
      amount_cents: amount,
      // Une estimation n'est pas un devis : elle ne doit jamais gonfler les
      // économies affichées.
      agency_quote_cents: 0,
      nights: result.nights,
    });
    setError(null);
    setAdded((current) => [...current, result.id]);
    refresh();
  }

  const results = outcome?.results ?? [];
  const priced = results.some((result) => result.price_known);

  return (
    <Card title="Chercher et réserver">
      <form
        className="space-y-3 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          void runSearch(event.currentTarget);
        }}
      >
        <div className="flex gap-2">
          {SEARCH_KINDS.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => {
                setKind(entry.value);
                setOutcome(null);
              }}
              className={`flex-1 rounded-full px-3 py-2 text-sm font-medium ring-1 ring-inset ${
                kind === entry.value
                  ? "bg-brand-600 text-white ring-brand-600"
                  : "bg-white text-stone-600 ring-stone-300"
              }`}
            >
              {entry.label}
            </button>
          ))}
        </div>

        {kind === "flight" && (
          <Field label="Départ de">
            <input name="origin" placeholder="Lyon" className={inputClass} />
          </Field>
        )}

        <Field label="Destination">
          <input
            name="destination"
            defaultValue={trip.destination_city}
            className={inputClass}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === "activity" ? "Quand" : "Aller"}>
            <input
              name="start_date"
              type="date"
              defaultValue={trip.start_date}
              className={inputClass}
            />
          </Field>
          {kind === "activity" ? (
            <Field label="Voyageurs">
              <input
                name="travellers"
                type="number"
                min={1}
                max={20}
                defaultValue={travellers}
                className={inputClass}
              />
            </Field>
          ) : (
            <Field label="Retour">
              <input
                name="end_date"
                type="date"
                defaultValue={trip.end_date}
                className={inputClass}
              />
            </Field>
          )}
        </div>

        {kind !== "activity" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Voyageurs">
              <input
                name="travellers"
                type="number"
                min={1}
                max={20}
                defaultValue={travellers}
                className={inputClass}
              />
            </Field>
            <Field label={`Prévenez-moi sous (${CURRENCY})`}>
              <input name="target" inputMode="decimal" placeholder="250" className={inputClass} />
            </Field>
          </div>
        )}
        {kind === "activity" && (
          <Field label={`Prévenez-moi sous (${CURRENCY})`} hint="Facultatif.">
            <input name="target" inputMode="decimal" placeholder="40" className={inputClass} />
          </Field>
        )}

        {error && <p className="text-sm text-rose-700">{error}</p>}
        {notice && <p className="text-sm text-emerald-700">{notice}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={busy}
            className="flex-1 rounded-xl bg-brand-600 px-3 py-3 text-sm font-semibold text-white active:bg-brand-700 disabled:opacity-60"
          >
            {busy ? "Recherche…" : "Chercher"}
          </button>
          <button
            type="button"
            onClick={(event) => createWatch(event.currentTarget.form!)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm font-semibold text-stone-700 active:bg-stone-100"
          >
            Surveiller
          </button>
        </div>
      </form>

      {outcome && (
        <div className="border-t border-stone-100">
          <div className="px-4 pt-3">
            <Pill
              className={
                outcome.source === "openstreetmap"
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-amber-100 text-amber-800"
              }
            >
              {outcome.source === "openstreetmap"
                ? "Lieux réels · OpenStreetMap, sans tarif"
                : "Estimations, pas des offres réservables"}
            </Pill>

            {outcome.source === "offline" && (
              <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800">
                Aucun fournisseur de réservation n'est connecté : ces prix sont des ordres de
                grandeur calculés à partir de votre recherche. Utiles pour bâtir un budget, ils ne
                correspondent à aucune offre.
                {outcome.note ? ` (${outcome.note})` : ""}
              </p>
            )}
            {outcome.source === "openstreetmap" && !priced && (
              <p className="mt-2 text-xs leading-relaxed text-stone-500">
                OpenStreetMap est une carte, pas une billetterie : elle connaît le lieu, pas le prix
                d'entrée. Saisissez-le pour l'ajouter au voyage.
              </p>
            )}
          </div>

          {results.length === 0 ? (
            <p className="px-4 py-4 text-sm text-stone-500">Rien trouvé pour cette recherche.</p>
          ) : (
            <ul className="mt-2 divide-y divide-stone-100">
              {results.map((result) => (
                <li key={result.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900">{result.vendor}</p>
                      <p className="text-xs text-stone-500">{result.description}</p>
                      {result.price_known ? (
                        <p className="mt-0.5 text-xs text-stone-400">
                          En formule, ce type de prestation se revend autour de{" "}
                          {formatMoney(result.package_price_cents, CURRENCY)}
                        </p>
                      ) : (
                        result.deeplink && (
                          <a
                            href={result.deeplink}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="mt-0.5 inline-block text-xs text-brand-700 underline"
                          >
                            Voir la fiche
                          </a>
                        )
                      )}
                    </div>
                    {result.price_known && (
                      <p className="shrink-0 tabular-nums text-stone-900">
                        {formatMoney(result.price_cents, CURRENCY)}
                      </p>
                    )}
                  </div>

                  <div className="mt-2 flex gap-2">
                    {!result.price_known && (
                      <input
                        inputMode="decimal"
                        aria-label={`Prix pour ${result.vendor}`}
                        placeholder={`Prix (${CURRENCY})`}
                        value={prices[result.id] ?? ""}
                        onChange={(event) =>
                          setPrices((current) => ({
                            ...current,
                            [result.id]: event.target.value,
                          }))
                        }
                        className={`${inputClass} flex-1`}
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => importResult(result)}
                      disabled={added.includes(result.id)}
                      className="rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100 disabled:text-stone-400"
                    >
                      {added.includes(result.id) ? "Ajouté ✓" : "Ajouter au voyage"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}

/**
 * Les alertes prix. Android ne laisse pas une application dormante interroger
 * le réseau en continu sans un service en arrière-plan ; ici, la vérification
 * est déclenchée par le voyageur, et l'application garde l'historique pour dire
 * si ça a baissé depuis la dernière fois.
 */
function WatchesCard({ watches, refresh }: { watches: store.LocalWatch[]; refresh: () => void }) {
  const [busy, setBusy] = useState<number | "all" | null>(null);
  const [news, setNews] = useState<Record<number, string>>({});

  async function run(watch: store.LocalWatch) {
    setBusy(watch.id);
    try {
      const evaluation = await checkWatch(watch);
      setNews((current) => ({ ...current, [watch.id]: describeEvaluation(evaluation) }));
    } catch (failure) {
      setNews((current) => ({
        ...current,
        [watch.id]: failure instanceof Error ? failure.message : "Vérification impossible.",
      }));
    } finally {
      setBusy(null);
      refresh();
    }
  }

  async function runAll() {
    setBusy("all");
    for (const watch of watches) {
      try {
        const evaluation = await checkWatch(watch);
        setNews((current) => ({ ...current, [watch.id]: describeEvaluation(evaluation) }));
      } catch {
        setNews((current) => ({ ...current, [watch.id]: "Vérification impossible." }));
      }
    }
    setBusy(null);
    refresh();
  }

  if (watches.length === 0) return null;

  return (
    <Card title={`Alertes prix (${watches.length})`}>
      <ul className="divide-y divide-stone-100">
        {watches.map((watch) => (
          <li key={watch.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-stone-900">{describeWatch(watch)}</p>
                <p className="text-xs text-stone-500">
                  {formatDate(watch.start_date)}
                  {watch.target_cents > 0
                    ? ` · cible ${formatMoney(watch.target_cents, CURRENCY)}`
                    : " · suivi simple"}
                </p>
                <p className="text-xs text-stone-400">
                  {watch.last_price_cents === null
                    ? "Jamais vérifiée"
                    : `Dernier prix ${formatMoney(watch.last_price_cents, CURRENCY)} · meilleur ${formatMoney(
                        watch.best_price_cents ?? watch.last_price_cents,
                        CURRENCY,
                      )}`}
                </p>
                {news[watch.id] && (
                  <p className="mt-1 text-xs font-medium text-brand-700">{news[watch.id]}</p>
                )}
              </div>
              <div className="shrink-0 space-y-1 text-right">
                <button
                  type="button"
                  onClick={() => void run(watch)}
                  disabled={busy !== null}
                  className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 active:bg-stone-100 disabled:opacity-60"
                >
                  {busy === watch.id ? "…" : "Vérifier"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    store.deleteWatch(watch.id);
                    refresh();
                  }}
                  className="block w-full text-xs text-stone-400"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {watches.length > 1 && (
        <div className="border-t border-stone-100 px-4 py-3">
          <button
            type="button"
            onClick={() => void runAll()}
            disabled={busy !== null}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100 disabled:opacity-60"
          >
            {busy === "all" ? "Vérification…" : "Tout vérifier"}
          </button>
        </div>
      )}
    </Card>
  );
}

function describeEvaluation(evaluation: {
  best_price_cents: number | null;
  dropped: boolean;
  drop_cents: number;
  target_reached: boolean;
}): string {
  if (evaluation.best_price_cents === null) return "Aucun prix exploitable pour l'instant.";

  const price = formatMoney(evaluation.best_price_cents, CURRENCY);
  if (evaluation.target_reached) return `🎯 ${price} — sous votre prix cible.`;
  if (evaluation.dropped) {
    return `↓ ${price} — ${formatMoney(evaluation.drop_cents, CURRENCY)} de moins qu'avant.`;
  }
  return `${price} — rien de neuf.`;
}

/* --------------------------------------------------- fiche destination */

/**
 * La fiche que remettrait une agence : où c'est, le temps qu'il y fait à ces
 * dates, ce que vaut l'euro sur place, ce qu'il y a à voir. Chargée à la
 * demande, parce que le forfait data du voyageur lui appartient — et gardée en
 * cache pour être encore lisible dans l'avion.
 */
function DossierCard({ trip }: { trip: Trip }) {
  const [busy, setBusy] = useState(false);
  const [dossier, setDossier] = useState<MobileDossier | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Une nouvelle destination, une nouvelle fiche.
  useEffect(() => {
    setDossier(null);
    setError(null);
  }, [trip.id]);

  async function load() {
    setBusy(true);
    setError(null);
    try {
      setDossier(await buildDossier(trip));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Fiche indisponible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Fiche destination">
      {!dossier ? (
        <div className="space-y-3 px-4 py-4 text-center">
          <p className="text-sm text-stone-500">
            Météo, taux de change, présentation et lieux à voir — depuis des services libres et
            gratuits (Open-Meteo, Frankfurter, Wikipédia, OpenStreetMap).
          </p>
          {error && <p className="text-sm text-rose-700">{error}</p>}
          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100 disabled:opacity-60"
          >
            {busy ? "Chargement…" : "Charger la fiche"}
          </button>
        </div>
      ) : (
        <div className="space-y-3 px-4 py-3 text-sm">
          {dossier.offline && (
            <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
              L'accès réseau est désactivé dans les réglages : seule la page pratique est
              disponible.
            </p>
          )}

          {dossier.place && (
            <p className="text-stone-600">
              {dossier.place.name}
              {dossier.place.country ? `, ${dossier.place.country}` : ""} ·{" "}
              {dossier.place.latitude.toFixed(2)}, {dossier.place.longitude.toFixed(2)}
            </p>
          )}

          {dossier.weather && (
            <div className="rounded-xl bg-stone-50 px-3 py-2.5">
              <p className="font-medium text-stone-900">
                {dossier.weather.average_min_c} – {dossier.weather.average_max_c} °C
              </p>
              <p className="text-xs text-stone-500">
                {dossier.weather.kind === "forecast"
                  ? "Prévisions pour vos dates"
                  : "Moyennes des années passées, à la même période"}{" "}
                · {dossier.weather.rainy_days} jour
                {dossier.weather.rainy_days > 1 ? "s" : ""} de pluie · {dossier.weather.source}
              </p>
            </div>
          )}

          {dossier.exchange && (
            <p className="text-stone-700">
              1 {CURRENCY} ≈ {dossier.exchange.rate.toFixed(2)} {dossier.exchange.local_currency}{" "}
              <span className="text-xs text-stone-400">(BCE, {dossier.exchange.date})</span>
            </p>
          )}

          {dossier.guide && (
            <div>
              <p className="leading-relaxed text-stone-700">{dossier.guide.extract}</p>
              <p className="mt-1 text-xs text-stone-400">{dossier.guide.attribution}</p>
            </div>
          )}

          {dossier.pois.length > 0 && (
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-stone-500">À voir</p>
              <ul className="mt-1 space-y-1">
                {dossier.pois.map((poi) => (
                  <li key={poi.id} className="text-stone-700">
                    <a
                      href={poi.website ?? poi.osm_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-brand-700 underline"
                    >
                      {poi.name}
                    </a>
                    <span className="text-xs text-stone-500"> · {poi.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {dossier.missing.length > 0 && (
            <p className="text-xs text-stone-500">
              Indisponible pour l'instant : {dossier.missing.join(", ").toLowerCase()}.
            </p>
          )}

          <button
            type="button"
            onClick={() => void load()}
            disabled={busy}
            className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100 disabled:opacity-60"
          >
            {busy ? "Actualisation…" : "Actualiser"}
          </button>
        </div>
      )}
    </Card>
  );
}

/* ----------------------------------------------------- carnet de voyage */

/**
 * Le carnet : le document qu'une agence imprime avant le départ. Une page, tout
 * ce qu'il faut sur place, et le bouton d'impression d'Android — qui sait aussi
 * enregistrer en PDF.
 */
function CarnetScreen({
  tripId,
  revision,
  onBack,
}: {
  tripId: number;
  revision: number;
  onBack: () => void;
}) {
  const trip = useMemo(() => store.getTrip(tripId), [tripId, revision]);
  if (!trip) return <Empty title="Ce voyage n'existe plus" />;

  const travellers = store.listTravellers(tripId);
  const bookings = store.listBookings(tripId);
  const expenses = store.listExpenses(tripId);
  const checklist = store.listChecklist(tripId);
  const budget = budgetStatus(trip, bookings, expenses);
  const itinerary = buildItinerary(trip, bookings, expenses);
  const transfers = settlementPlan(splitBalances(travellers, expenses));
  const practical = practicalFor(
    countryCodeFromName(trip.destination_country) ?? trip.destination_country,
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2 print:hidden">
        <button type="button" onClick={onBack} className="text-sm text-stone-500">
          ← Retour au voyage
        </button>
        <button
          type="button"
          onClick={() => printPage(`Carnet — ${trip.title}`)}
          className="rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white active:bg-brand-700"
        >
          Imprimer / PDF
        </button>
      </div>

      <header className="border-b border-stone-200 pb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
          Carnet de voyage
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-stone-900">{trip.title}</h1>
        <p className="mt-1 text-sm text-stone-600">
          {trip.destination_city}, {trip.destination_country} ·{" "}
          {formatDateRange(trip.start_date, trip.end_date)} · {formatNights(tripNights(trip))} ·{" "}
          {formatTravellers(travellers.length)}
        </p>
        <p className="text-sm text-stone-500">
          {STAGE_LABEL[trip.stage]} · {formatMoney(budget.committed_cents, CURRENCY)} engagés ·{" "}
          {formatMoney(budget.per_traveller_cents, CURRENCY)} par personne
        </p>
      </header>

      <CarnetSection title="Qui part">
        <p className="text-sm text-stone-700">
          {travellers.map((traveller) => traveller.name).join(", ")}
        </p>
      </CarnetSection>

      <CarnetSection title="Le programme">
        {itinerary.days.length === 0 ? (
          <p className="text-sm text-stone-500">Rien de planifié.</p>
        ) : (
          <ol className="space-y-2">
            {itinerary.days.map((day) => (
              <li key={day.date} className="text-sm">
                <p className="font-medium text-stone-900">
                  Jour {day.day_number}
                  <span className="ml-2 font-normal text-stone-500">{formatDate(day.date)}</span>
                </p>
                {day.starts.length === 0 && day.ongoing.length === 0 && day.returns.length === 0 ? (
                  <p className="text-stone-400">Libre.</p>
                ) : (
                  <>
                    <ul className="text-stone-700">
                      {day.starts.map((booking) => (
                        <li key={`s${booking.id}`}>
                          {booking.vendor}
                          {booking.description ? ` — ${booking.description}` : ""}
                        </li>
                      ))}
                    </ul>
                    {day.returns.length > 0 && (
                      <p className="text-stone-700">
                        Retour : {day.returns.map((booking) => booking.vendor).join(", ")}
                      </p>
                    )}
                    {/* Une ligne par prestation en cours remplirait la page de
                        répétitions : sur papier, une seule suffit. */}
                    {day.ongoing.length > 0 && (
                      <p className="text-stone-500">
                        En cours : {day.ongoing.map((booking) => booking.vendor).join(", ")}
                      </p>
                    )}
                  </>
                )}
              </li>
            ))}
          </ol>
        )}
      </CarnetSection>

      <CarnetSection title="Les réservations">
        {bookings.length === 0 ? (
          <p className="text-sm text-stone-500">Aucune réservation.</p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {bookings.map((booking) => (
              <li key={booking.id} className="flex justify-between gap-3">
                <span className="text-stone-700">
                  <strong className="font-medium text-stone-900">{booking.vendor}</strong> ·{" "}
                  {BOOKING_LABEL[booking.type]} · {formatDate(booking.start_at)}
                  {booking.description ? ` — ${booking.description}` : ""}
                </span>
                <span className="shrink-0 tabular-nums text-stone-700">
                  {formatMoney(booking.amount_cents, CURRENCY)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CarnetSection>

      {checklist.length > 0 && (
        <CarnetSection title="Avant de partir">
          <ul className="space-y-1 text-sm text-stone-700">
            {checklist.map((item) => (
              <li key={item.id}>
                {item.done ? "☑" : "☐"} {item.label}
              </li>
            ))}
          </ul>
        </CarnetSection>
      )}

      {practical && (
        <CarnetSection title="En cas de pépin">
          <ul className="space-y-1 text-sm text-stone-700">
            <li>Urgences : {practical.emergency}</li>
            <li>Monnaie : {practical.currency}</li>
            <li>
              Prises : {practical.plugs} · {practical.voltage}
            </li>
            <li>On roule à {practical.drive}</li>
            <li>Pourboire : {practical.tipping}</li>
            <li>Entrée : {practical.entry}</li>
          </ul>
          <p className="mt-2 text-xs text-stone-500">
            Vérifiez les conditions d'entrée sur France Diplomatie ({OFFICIAL_ADVICE_URL}).
          </p>
        </CarnetSection>
      )}

      {transfers.length > 0 && (
        <CarnetSection title="Pour être quittes">
          <ul className="space-y-1 text-sm text-stone-700">
            {transfers.map((transfer) => (
              <li key={`${transfer.from_user_id}-${transfer.to_user_id}`}>
                {transfer.from_name} → {transfer.to_name} :{" "}
                {formatMoney(transfer.amount_cents, CURRENCY)}
              </li>
            ))}
          </ul>
        </CarnetSection>
      )}

      <p className="text-xs text-stone-400">
        Journey Valley · carnet établi le {formatDate(store.today())}
      </p>
    </div>
  );
}

function CarnetSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-stone-500">
        {title}
      </h2>
      {children}
    </section>
  );
}

function ShareButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    // The Android shell offers a real share sheet; a browser falls back to the
    // clipboard.
    if (window.JVShare) {
      window.JVShare.text(text);
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="border-t border-stone-100 px-4 py-3">
      <button
        type="button"
        onClick={share}
        className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100"
      >
        {copied ? "Copié ✓" : "Partager le récap"}
      </button>
    </div>
  );
}

function NewTripScreen({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (id: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const read = (key: string) => String(data.get(key) ?? "").trim();

        const title = read("title");
        if (title.length < 3) return setError("Donnez-lui un nom que vous reconnaîtrez.");
        if (!read("destination_city")) return setError("Vous allez où ?");
        if (read("end_date") < read("start_date")) {
          return setError("Le retour ne peut pas précéder le départ.");
        }

        const budget = read("budget") === "" ? 0 : parseAmountToCents(read("budget"));
        if (budget === null) return setError("Le budget n'est pas un montant lisible.");
        const quote = read("agency_quote") === "" ? 0 : parseAmountToCents(read("agency_quote"));
        if (quote === null) return setError("Le devis n'est pas un montant lisible.");

        const trip = store.createTrip({
          title,
          summary: read("summary"),
          destination_city: read("destination_city"),
          destination_country: read("destination_country"),
          start_date: read("start_date"),
          end_date: read("end_date"),
          budget_cents: budget,
          agency_quote_cents: quote,
        });
        onCreated(trip.id);
      }}
    >
      <h1 className="text-xl font-semibold text-stone-900">Un nouveau voyage</h1>
      {error && (
        <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">
          {error}
        </p>
      )}

      <Field label="Nom">
        <input
          name="title"
          required
          placeholder="Road trip dans les fjords"
          className={inputClass}
        />
      </Field>
      <Field label="L'idée">
        <textarea name="summary" rows={2} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ville">
          <input name="destination_city" required placeholder="Bergen" className={inputClass} />
        </Field>
        <Field label="Pays">
          <input name="destination_country" placeholder="Norvège" className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Départ">
          <input
            name="start_date"
            type="date"
            required
            defaultValue={store.today()}
            className={inputClass}
          />
        </Field>
        <Field label="Retour">
          <input
            name="end_date"
            type="date"
            required
            defaultValue={store.today(3)}
            className={inputClass}
          />
        </Field>
      </div>
      <Field label={`Budget (${CURRENCY})`} hint="Facultatif.">
        <input name="budget" inputMode="decimal" placeholder="2 100" className={inputClass} />
      </Field>
      <Field
        label={`Devis agence (${CURRENCY})`}
        hint="Facultatif, et c'est tout l'intérêt : le prix du même voyage en formule."
      >
        <input name="agency_quote" inputMode="decimal" placeholder="2 890" className={inputClass} />
      </Field>

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-xl bg-brand-600 px-3 py-3 text-sm font-semibold text-white active:bg-brand-700"
        >
          Créer
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm font-semibold text-stone-700"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

function SavingsScreen({ revision, onOpen }: { revision: number; onOpen: (id: number) => void }) {
  const rows = useMemo(
    () =>
      store
        .listTrips()
        .filter((trip) => trip.stage !== "cancelled")
        .map((trip) => ({ trip, savings: savingsSummary(trip, store.listBookings(trip.id)) }))
        .filter((entry) => entry.savings.basis !== "none"),
    [revision],
  );

  const settled = rows.filter((entry) => !entry.savings.provisional);
  const pending = rows.filter((entry) => entry.savings.provisional);
  const agency = settled.reduce((sum, entry) => sum + entry.savings.agency_cents, 0);
  const yours = settled.reduce((sum, entry) => sum + entry.savings.your_cost_cents, 0);

  if (rows.length === 0) {
    return (
      <Empty
        title="Rien à comparer pour l'instant"
        hint="Notez un devis d'agence sur un voyage, ou sur une seule réservation, et l'écart apparaît ici."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-900 px-5 py-5 text-white">
        <p className="text-xs font-medium uppercase tracking-wide text-brand-100">
          Gardé dans votre poche
        </p>
        <p className="mt-1 text-3xl font-semibold">{formatMoney(agency - yours, CURRENCY)}</p>
        <p className="mt-1 text-sm text-brand-100">
          {settled.length > 0
            ? `Sur ${settled.length} voyage${settled.length > 1 ? "s" : ""} entièrement réservé${settled.length > 1 ? "s" : ""}, face à ${formatMoney(agency, CURRENCY)} de devis.`
            : "Aucun voyage entièrement réservé — les estimations sont plus bas."}
        </p>
      </div>

      {settled.length > 0 && (
        <Card title="Voyage par voyage">
          <ul className="divide-y divide-stone-100">
            {settled.map(({ trip, savings }) => (
              <li key={trip.id}>
                <button
                  type="button"
                  onClick={() => onOpen(trip.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-stone-50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-900">{trip.title}</p>
                    <p className="text-xs text-stone-500">
                      {formatMoney(savings.your_cost_cents, CURRENCY)} contre{" "}
                      {formatMoney(savings.agency_cents, CURRENCY)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 text-sm tabular-nums ${
                      savings.saved_cents >= 0 ? "text-emerald-700" : "text-rose-700"
                    }`}
                  >
                    {formatMoney(savings.saved_cents, CURRENCY)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {pending.length > 0 && (
        <Card title="Estimations en cours">
          <p className="px-4 pt-3 text-sm text-stone-500">
            Ces voyages ne sont pas entièrement réservés : l'écart n'est pas définitif et ne compte
            pas dans le total.
          </p>
          <ul className="mt-2 divide-y divide-stone-100">
            {pending.map(({ trip, savings }) => (
              <li key={trip.id}>
                <button
                  type="button"
                  onClick={() => onOpen(trip.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-stone-50"
                >
                  <span className="truncate font-medium text-stone-900">{trip.title}</span>
                  <span className="shrink-0 text-sm tabular-nums text-amber-700">
                    ≈ {formatMoney(savings.saved_cents, CURRENCY)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <p className="text-xs leading-relaxed text-stone-500">
        Ces chiffres ne comparent que ce que vous avez saisi comme devis. Un forfait peut inclure
        des extras — comparez ce qui est comparable.
      </p>
    </div>
  );
}

function SettingsScreen({ onChanged }: { onChanged: () => void }) {
  const db = store.getDb();
  const [network, setNetwork] = useState(networkAllowed());
  const cached = Object.keys(db.cache ?? {}).length;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-stone-900">Réglages</h1>

      <Card title="Réseau">
        <label className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm text-stone-800">Autoriser les services en ligne</span>
          <input
            type="checkbox"
            checked={network}
            onChange={(event) => {
              setNetworkAllowed(event.target.checked);
              setNetwork(event.target.checked);
            }}
            className="h-5 w-5 rounded border-stone-300"
          />
        </label>
        <p className="border-t border-stone-100 px-4 py-3 text-xs leading-relaxed text-stone-500">
          Décochez et l'application ne contacte plus rien : le reste continue de fonctionner, avec
          les dernières réponses gardées en mémoire. Quand c'est coché, elle ne parle qu'à six
          services libres — Nominatim, Overpass, Open-Meteo, Frankfurter et Wikipédia — pour situer
          une ville, chercher des activités, la météo, les taux et la présentation. Aucune donnée
          personnelle n'est envoyée : seulement le nom d'un lieu et des dates.
        </p>
        {cached > 0 && (
          <div className="border-t border-stone-100 px-4 py-3">
            <button
              type="button"
              onClick={() => {
                store.clearCache();
                onChanged();
              }}
              className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm font-semibold text-stone-700 active:bg-stone-100"
            >
              Vider le cache ({cached} réponse{cached > 1 ? "s" : ""})
            </button>
          </div>
        )}
      </Card>

      <Card title="Sur cet appareil">
        <dl className="divide-y divide-stone-100 text-sm">
          {[
            ["Voyages", db.trips.length],
            ["Réservations", db.bookings.length],
            ["Dépenses", db.expenses.length],
            ["Alertes prix", (db.watches ?? []).length],
            ["Stockage", window.JVStore ? "Mémoire de l'app" : "Navigateur"],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between px-4 py-2.5">
              <dt className="text-stone-600">{label}</dt>
              <dd className="font-medium text-stone-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            if (confirm("Remplacer tout par les voyages de démonstration ?")) {
              store.resetToDemo();
              onChanged();
            }
          }}
          className="w-full rounded-xl border border-stone-300 bg-white px-3 py-3 text-sm font-semibold text-stone-700 active:bg-stone-100"
        >
          Recharger la démonstration
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Supprimer tous les voyages de cet appareil ?")) {
              store.clearAll();
              onChanged();
            }
          }}
          className="w-full rounded-xl border border-rose-200 bg-white px-3 py-3 text-sm font-semibold text-rose-700 active:bg-rose-50"
        >
          Repartir de zéro
        </button>
      </div>

      <p className="text-xs leading-relaxed text-stone-500">
        Vos voyages restent sur le téléphone : pas de compte, pas de serveur Journey Valley, rien
        de ce que vous saisissez ne part ailleurs. Les compagnons sont des prénoms que vous tapez,
        pas des comptes ; le partage entre vraies personnes, c'est le site.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------- formulaires */

function BookingForm({
  tripId,
  defaultDate,
  onAdded,
}: {
  tripId: number;
  defaultDate: string;
  onAdded: () => void;
}) {
  const [type, setType] = useState<BookingType>("flight");
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-3 border-t border-stone-100 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const read = (key: string) => String(data.get(key) ?? "").trim();

        if (!read("vendor")) return setError("Réservé chez qui ?");
        const amount = parseAmountToCents(read("amount"));
        if (amount === null) return setError("Un montant comme 246 ou 245,90.");
        const quote = read("agency_quote") === "" ? 0 : parseAmountToCents(read("agency_quote"));
        if (quote === null) return setError("Le devis n'est pas un montant lisible.");

        store.addBooking({
          trip_id: tripId,
          type,
          vendor: read("vendor"),
          description: read("description"),
          start_at: read("start_at") || defaultDate,
          end_at: read("end_at") || null,
          amount_cents: amount,
          agency_quote_cents: quote,
          nights: type === "stay" ? Number(read("nights")) || null : null,
        });
        setError(null);
        form.reset();
        onAdded();
      }}
    >
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quoi">
          <select
            value={type}
            onChange={(event) => setType(event.target.value as BookingType)}
            className={inputClass}
          >
            {(Object.keys(BOOKING_LABEL) as BookingType[]).map((key) => (
              <option key={key} value={key}>
                {BOOKING_LABEL[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Chez">
          <input name="vendor" required placeholder="Norwegian" className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`Payé (${CURRENCY})`}>
          <input name="amount" required inputMode="decimal" placeholder="624" className={inputClass} />
        </Field>
        <Field label="Devis agence">
          <input name="agency_quote" inputMode="decimal" placeholder="790" className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="À partir du">
          <input name="start_at" type="date" defaultValue={defaultDate} className={inputClass} />
        </Field>
        {type === "stay" ? (
          <Field label="Nuits">
            <input name="nights" type="number" min={1} defaultValue={1} className={inputClass} />
          </Field>
        ) : (
          <Field label="Jusqu'au">
            <input name="end_at" type="date" className={inputClass} />
          </Field>
        )}
      </div>

      <Field label="Notes">
        <input name="description" placeholder="LYS → BGO aller-retour" className={inputClass} />
      </Field>

      <button
        type="submit"
        className="w-full rounded-xl bg-brand-600 px-3 py-3 text-sm font-semibold text-white active:bg-brand-700"
      >
        Ajouter au voyage
      </button>
    </form>
  );
}

function ExpenseForm({
  tripId,
  travellers,
  defaultDate,
  onAdded,
}: {
  tripId: number;
  travellers: store.LocalTraveller[];
  defaultDate: string;
  onAdded: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(true);
  const [participants, setParticipants] = useState<number[]>(() =>
    travellers.map((traveller) => traveller.user_id),
  );

  const toggle = (userId: number) =>
    setParticipants((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId],
    );

  return (
    <form
      className="space-y-3 border-t border-stone-100 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const read = (key: string) => String(data.get(key) ?? "").trim();

        if (!read("description")) return setError("C'était pour quoi ?");
        const amount = parseAmountToCents(read("amount"));
        if (amount === null) return setError("Un montant comme 24 ou 23,80.");

        const named =
          shared && participants.length > 0 && participants.length < travellers.length
            ? participants
            : null;

        store.addExpense({
          trip_id: tripId,
          paid_by: Number(read("paid_by")) || travellers[0].user_id,
          category: read("category") as ExpenseCategory,
          description: read("description"),
          spent_on: read("spent_on") || defaultDate,
          amount_cents: amount,
          shared,
          participant_ids: named,
        });
        setError(null);
        form.reset();
        setParticipants(travellers.map((traveller) => traveller.user_id));
        onAdded();
      }}
    >
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Catégorie">
          <select name="category" defaultValue="food" className={inputClass}>
            {(Object.keys(CATEGORY_LABEL) as ExpenseCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Montant (${CURRENCY})`}>
          <input name="amount" required inputMode="decimal" placeholder="42,50" className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Quand">
          <input name="spent_on" type="date" defaultValue={defaultDate} className={inputClass} />
        </Field>
        <Field label="Qui a payé">
          <select
            name="paid_by"
            defaultValue={String(travellers[0]?.user_id ?? "")}
            className={inputClass}
          >
            {travellers.map((traveller) => (
              <option key={traveller.user_id} value={traveller.user_id}>
                {traveller.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="C'était quoi">
        <input name="description" required placeholder="Dîner à Bergen" className={inputClass} />
      </Field>

      <div className="rounded-xl bg-stone-50 px-3.5 py-3">
        <label className="flex items-center gap-2.5 text-sm font-medium text-stone-800">
          <input
            type="checkbox"
            checked={shared}
            onChange={(event) => setShared(event.target.checked)}
            className="h-4 w-4 rounded border-stone-300"
          />
          Dépense partagée
        </label>

        {shared && travellers.length > 1 && (
          <div className="mt-3">
            <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
              Qui participe
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {travellers.map((traveller) => {
                const on = participants.includes(traveller.user_id);
                return (
                  <button
                    key={traveller.user_id}
                    type="button"
                    onClick={() => toggle(traveller.user_id)}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 ring-inset ${
                      on
                        ? "bg-brand-600 text-white ring-brand-600"
                        : "bg-white text-stone-600 ring-stone-300"
                    }`}
                  >
                    {traveller.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <button
        type="submit"
        className="w-full rounded-xl bg-brand-600 px-3 py-3 text-sm font-semibold text-white active:bg-brand-700"
      >
        Ajouter la dépense
      </button>
    </form>
  );
}

function TravellerForm({ tripId, onAdded }: { tripId: number; onAdded: () => void }) {
  return (
    <form
      className="flex gap-2 border-t border-stone-100 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const name = String(new FormData(form).get("name") ?? "").trim();
        if (!name) return;
        store.addTraveller(tripId, name);
        form.reset();
        onAdded();
      }}
    >
      <input name="name" placeholder="Ajouter quelqu'un" className={`${inputClass} flex-1`} />
      <button
        type="submit"
        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 active:bg-stone-100"
      >
        Ajouter
      </button>
    </form>
  );
}

/* -------------------------------------------------------------------- bits */

const inputClass =
  "w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 outline-none focus:border-brand-500";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs leading-relaxed text-stone-500">{hint}</p>}
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <h2 className="border-b border-stone-100 px-4 py-3 text-sm font-semibold text-stone-900">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tile({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "good" | "warn";
}) {
  const ring =
    tone === "good"
      ? "bg-emerald-50 ring-emerald-200"
      : tone === "warn"
        ? "bg-amber-50 ring-amber-200"
        : "bg-white ring-stone-200";
  return (
    <div className={`rounded-2xl px-3.5 py-3 shadow-sm ring-1 ring-inset ${ring}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-stone-900">{value}</p>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>{children}</span>
  );
}

function Meter({ percent, over }: { percent: number; over?: boolean }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-100">
      <div
        className={`h-full rounded-full ${over ? "bg-rose-500" : "bg-brand-600"}`}
        style={{ width: `${Math.max(percent, 2)}%` }}
      />
    </div>
  );
}

function CompareBar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="tabular-nums text-stone-600">{formatMoney(value, CURRENCY)}</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.max(percentOf(value, max), 2)}%` }}
        />
      </div>
    </div>
  );
}

function Expander({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-stone-100">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full px-4 py-3 text-left text-sm font-semibold text-brand-700"
      >
        {open ? "Fermer" : label}
      </button>
      {open && children}
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-4 py-10 text-center">
      <p className="font-medium text-stone-700">{title}</p>
      {hint && <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{hint}</p>}
    </div>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<App />);
