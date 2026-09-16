/**
 * Journey Valley for Android — the offline build.
 *
 * Same product, one device: plan trips, record what you paid against what an
 * agency quoted, split costs with the people you travel with. The arithmetic
 * comes from the shared `budget.ts` and `stages.ts` modules, so the phone and
 * the web app can never disagree about a number.
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
import { formatMoney, parseAmountToCents, percentOf } from "../../src/lib/money";
import {
  availableStageActions,
  STAGE_ACTION_LABEL,
  STAGE_LABEL,
  type StageAction,
} from "../../src/lib/stages";
import { checkStageChange } from "../../src/lib/stages";
import type { BookingType, ExpenseCategory, Trip, TripStage } from "../../src/lib/types";
import * as store from "./store";

const CURRENCY = store.CURRENCY;

const STAGE_TONE: Record<TripStage, string> = {
  idea: "bg-slate-100 text-slate-700",
  planning: "bg-amber-100 text-amber-800",
  booked: "bg-blue-100 text-blue-800",
  travelling: "bg-emerald-100 text-emerald-800",
  completed: "bg-sky-100 text-sky-800",
  cancelled: "bg-slate-100 text-slate-500",
};

const BOOKING_LABEL: Record<BookingType, string> = {
  flight: "Flight",
  stay: "Stay",
  transport: "Transport",
  activity: "Activity",
  other: "Other",
};

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: "Food and drink",
  transport: "Getting around",
  lodging: "Stays",
  activities: "Things to do",
  shopping: "Shopping",
  other: "Other",
};

type Screen =
  | { name: "trips" }
  | { name: "trip"; id: number }
  | { name: "new" }
  | { name: "savings" }
  | { name: "settings" };

function App() {
  const [screen, setScreen] = useState<Screen>({ name: "trips" });
  // Bumped after every write so the screens re-read the store.
  const [revision, setRevision] = useState(0);
  const refresh = () => setRevision((value) => value + 1);

  // Android's back button: step back inside the app before leaving it. The
  // shell calls this and only closes the app when it answers false.
  useEffect(() => {
    window.JVBack = () => {
      if (screen.name === "trips") return false;
      setScreen({ name: "trips" });
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
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center gap-2 bg-brand-700 px-4 py-3 text-white shadow-sm">
        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-white/20 text-sm">
          ◇
        </span>
        <span className="text-base font-semibold">Journey Valley</span>
        {screen.name === "trips" && (
          <button
            type="button"
            onClick={() => setScreen({ name: "new" })}
            className="ml-auto rounded-lg bg-white/15 px-3 py-1.5 text-sm font-medium active:bg-white/25"
          >
            + Trip
          </button>
        )}
      </header>

      <main className="flex-1 px-4 pb-24 pt-4">{body}</main>

      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)]">
        {(
          [
            { key: "trips", label: "Trips", icon: "✈" },
            { key: "savings", label: "Savings", icon: "↓" },
            { key: "settings", label: "Settings", icon: "⚙" },
          ] as const
        ).map((tab) => {
          const active =
            screen.name === tab.key || (tab.key === "trips" && screen.name === "trip");
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setScreen({ name: tab.key } as Screen)}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 text-xs font-medium ${
                active ? "text-brand-700" : "text-slate-500"
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

/* ---------------------------------------------------------------- screens */

function TripsScreen({ revision, onOpen }: { revision: number; onOpen: (id: number) => void }) {
  const trips = useMemo(() => store.listTrips(), [revision]);

  if (trips.length === 0) {
    return (
      <Empty
        title="No trips yet"
        hint="Tap “+ Trip” to start one — a rough idea with no dates counts."
      />
    );
  }

  return (
    <ul className="space-y-3">
      {trips.map((trip) => {
        const bookings = store.listBookings(trip.id);
        const expenses = store.listExpenses(trip.id);
        const budget = budgetStatus(trip, bookings, expenses);
        const savings = savingsSummary(trip, bookings);

        return (
          <li key={trip.id}>
            <button
              type="button"
              onClick={() => onOpen(trip.id)}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm active:bg-slate-50"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-slate-900">{trip.title}</p>
                  <p className="mt-0.5 truncate text-sm text-slate-500">
                    {trip.destination_city}, {trip.destination_country}
                  </p>
                </div>
                <Pill className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Pill>
              </div>

              <div className="mt-3 flex items-baseline justify-between text-sm">
                <span className="text-slate-600">
                  {formatMoney(budget.committed_cents, CURRENCY)}
                  {trip.budget_cents > 0 && (
                    <span className="text-slate-400">
                      {" "}
                      of {formatMoney(trip.budget_cents, CURRENCY)}
                    </span>
                  )}
                </span>
                {savings.basis !== "none" && (
                  <span
                    className={savings.saved_cents >= 0 ? "text-emerald-700" : "text-rose-700"}
                  >
                    {savings.saved_cents >= 0 ? "saved " : "over by "}
                    {formatMoney(Math.abs(savings.saved_cents), CURRENCY)}
                  </span>
                )}
              </div>

              {trip.budget_cents > 0 && (
                <Meter percent={budget.percent_used} over={budget.over_budget} />
              )}
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
}: {
  tripId: number;
  revision: number;
  refresh: () => void;
  onBack: () => void;
}) {
  const trip = useMemo(() => store.getTrip(tripId), [tripId, revision]);
  const [error, setError] = useState<string | null>(null);

  if (!trip) {
    return <Empty title="This trip is gone" hint="It was deleted on this device." />;
  }

  const travellers = store.listTravellers(tripId);
  const bookings = store.listBookings(tripId);
  const expenses = store.listExpenses(tripId);
  const budget = budgetStatus(trip, bookings, expenses);
  const savings = savingsSummary(trip, bookings);
  const balances = splitBalances(travellers, expenses);
  const transfers = settlementPlan(balances);
  const actions = availableStageActions(trip, "owner");
  const nameById = new Map(travellers.map((traveller) => [traveller.user_id, traveller.name]));

  const runAction = (action: StageAction) => {
    const check = checkStageChange(trip, action, "owner");
    if (!check.allowed || !check.nextStage) {
      setError(check.reason ?? "That is not possible right now.");
      return;
    }
    setError(null);
    store.setStage(trip.id, check.nextStage);
    refresh();
  };

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-slate-500">
        ← All trips
      </button>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-lg font-semibold text-slate-900">{trip.title}</h1>
          <Pill className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Pill>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {trip.destination_city}, {trip.destination_country} · {trip.start_date} → {trip.end_date}{" "}
          · {tripNights(trip)} night{tripNights(trip) === 1 ? "" : "s"}
        </p>
        {trip.summary && <p className="mt-2 text-sm text-slate-700">{trip.summary}</p>}
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">
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
                  ? "rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white active:bg-brand-700"
                  : "rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 active:bg-slate-100"
              }
            >
              {STAGE_ACTION_LABEL[action]}
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Committed" value={formatMoney(budget.committed_cents, CURRENCY)} />
        <Tile
          label="Budget left"
          value={trip.budget_cents > 0 ? formatMoney(budget.remaining_cents, CURRENCY) : "—"}
          tone={budget.over_budget ? "warn" : "plain"}
        />
        <Tile label="Per traveller" value={formatMoney(budget.per_traveller_cents, CURRENCY)} />
        <Tile
          label="Saved vs. agency"
          value={savings.basis === "none" ? "—" : formatMoney(savings.saved_cents, CURRENCY)}
          tone={savings.basis !== "none" && savings.saved_cents > 0 ? "good" : "plain"}
        />
      </div>

      {trip.budget_cents > 0 && (
        <Card title="Budget">
          <div className="px-4 py-3">
            <div className="flex items-baseline justify-between text-sm text-slate-600">
              <span>
                {formatMoney(budget.committed_cents, CURRENCY)} of{" "}
                {formatMoney(trip.budget_cents, CURRENCY)}
              </span>
              <span>{budget.percent_used}%</span>
            </div>
            <Meter percent={budget.percent_used} over={budget.over_budget} />
            {budget.over_budget && (
              <p className="mt-2 text-xs text-rose-600">
                {formatMoney(-budget.remaining_cents, CURRENCY)} over what you set out to spend.
              </p>
            )}
          </div>
        </Card>
      )}

      {savings.basis !== "none" && (
        <Card
          title={savings.basis === "trip_quote" ? "Against the package price" : "Against your quotes"}
        >
          <div className="space-y-3 px-4 py-3">
            <CompareBar
              label="Agency quote"
              value={savings.agency_cents}
              max={Math.max(savings.agency_cents, savings.your_cost_cents)}
              color="bg-orange-500"
            />
            <CompareBar
              label="You paid"
              value={savings.your_cost_cents}
              max={Math.max(savings.agency_cents, savings.your_cost_cents)}
              color="bg-brand-600"
            />
            <p className="text-sm text-slate-600">
              {savings.saved_cents >= 0 ? (
                <>
                  Booking it yourself keeps{" "}
                  <strong className="text-emerald-700">
                    {formatMoney(savings.saved_cents, CURRENCY)}
                  </strong>{" "}
                  ({savings.saved_percent}%).
                </>
              ) : (
                <>
                  That is{" "}
                  <strong className="text-rose-700">
                    {formatMoney(-savings.saved_cents, CURRENCY)}
                  </strong>{" "}
                  more than the quote.
                </>
              )}
            </p>
          </div>
        </Card>
      )}

      <Card title={`Bookings (${bookings.length})`}>
        {bookings.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">Nothing booked yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {bookings.map((booking) => (
              <li key={booking.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{booking.vendor}</p>
                  <p className="truncate text-xs text-slate-500">
                    {BOOKING_LABEL[booking.type]}
                    {booking.description ? ` · ${booking.description}` : ""}
                    {booking.nights ? ` · ${booking.nights} nights` : ""}
                  </p>
                  {booking.agency_quote_cents > 0 && (
                    <p className="text-xs text-emerald-700">
                      agency {formatMoney(booking.agency_quote_cents, CURRENCY)} — you save{" "}
                      {formatMoney(booking.agency_quote_cents - booking.amount_cents, CURRENCY)}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums text-slate-700">
                    {formatMoney(booking.amount_cents, CURRENCY)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      store.deleteBooking(booking.id);
                      refresh();
                    }}
                    className="text-xs text-slate-400"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Expander label="Add a booking">
          <BookingForm
            tripId={trip.id}
            defaultDate={trip.start_date}
            onAdded={() => refresh()}
          />
        </Expander>
      </Card>

      <Card title={`Spending (${expenses.length})`}>
        {expenses.length === 0 ? (
          <p className="px-4 py-4 text-sm text-slate-500">Nothing logged yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {expenses.map((expense) => (
              <li key={expense.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{expense.description}</p>
                  <p className="truncate text-xs text-slate-500">
                    {CATEGORY_LABEL[expense.category]} · {expense.spent_on} ·{" "}
                    {nameById.get(expense.paid_by) ?? "someone"} ·{" "}
                    {expense.shared ? "split" : "personal"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums text-slate-700">
                    {formatMoney(expense.amount_cents, CURRENCY)}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      store.deleteExpense(expense.id);
                      refresh();
                    }}
                    className="text-xs text-slate-400"
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <Expander label="Log an expense">
          <ExpenseForm
            tripId={trip.id}
            travellers={travellers}
            defaultDate={trip.start_date}
            onAdded={() => refresh()}
          />
        </Expander>
      </Card>

      <Card title="Who's coming">
        <ul className="divide-y divide-slate-100">
          {travellers.map((traveller) => {
            const balance = balances.find((entry) => entry.user_id === traveller.user_id);
            return (
              <li
                key={traveller.user_id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-slate-900">
                    {traveller.name}
                    {traveller.is_me ? <span className="ml-1 text-xs text-slate-400">you</span> : null}
                  </p>
                  {balance && (
                    <p className="text-xs text-slate-500">
                      paid {formatMoney(balance.paid_cents, CURRENCY)} · share{" "}
                      {formatMoney(balance.share_cents, CURRENCY)}
                    </p>
                  )}
                </div>
                <div className="text-right">
                  {balance && (
                    <p
                      className={`text-sm tabular-nums ${
                        balance.net_cents > 0
                          ? "text-emerald-700"
                          : balance.net_cents < 0
                            ? "text-rose-700"
                            : "text-slate-500"
                      }`}
                    >
                      {balance.net_cents === 0
                        ? "square"
                        : balance.net_cents > 0
                          ? `is owed ${formatMoney(balance.net_cents, CURRENCY)}`
                          : `owes ${formatMoney(-balance.net_cents, CURRENCY)}`}
                    </p>
                  )}
                  {!traveller.is_me && (
                    <button
                      type="button"
                      onClick={() => {
                        store.removeTraveller(trip.id, traveller.user_id);
                        refresh();
                      }}
                      className="text-xs text-slate-400"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <TravellerForm tripId={trip.id} onAdded={() => refresh()} />

        {transfers.length > 0 && (
          <div className="border-t border-slate-100 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Fewest payments
            </p>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              {transfers.map((transfer) => (
                <li key={`${transfer.from_user_id}-${transfer.to_user_id}`}>
                  {transfer.from_name} → {transfer.to_name}:{" "}
                  <strong>{formatMoney(transfer.amount_cents, CURRENCY)}</strong>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <button
        type="button"
        onClick={() => {
          if (confirm(`Delete “${trip.title}” and everything on it?`)) {
            store.deleteTrip(trip.id);
            refresh();
            onBack();
          }
        }}
        className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2.5 text-sm font-medium text-rose-700 active:bg-rose-50"
      >
        Delete this trip
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
        if (title.length < 3) return setError("Give the trip a name you'll recognise.");
        if (!read("destination_city")) return setError("Where are you going?");
        if (read("end_date") < read("start_date")) {
          return setError("The return date cannot be before you leave.");
        }

        const budget = read("budget") === "" ? 0 : parseAmountToCents(read("budget"));
        if (budget === null) return setError("The budget is not an amount I can read.");
        const quote = read("agency_quote") === "" ? 0 : parseAmountToCents(read("agency_quote"));
        if (quote === null) return setError("The agency quote is not an amount I can read.");

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
      <h1 className="text-lg font-semibold text-slate-900">Plan a trip</h1>
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">
          {error}
        </p>
      )}

      <Field label="Name">
        <input name="title" required placeholder="Norway fjords road trip" className={inputClass} />
      </Field>
      <Field label="The idea">
        <textarea name="summary" rows={2} className={inputClass} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="City">
          <input name="destination_city" required placeholder="Bergen" className={inputClass} />
        </Field>
        <Field label="Country">
          <input name="destination_country" placeholder="Norway" className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Leaving">
          <input name="start_date" type="date" required defaultValue={store.today()} className={inputClass} />
        </Field>
        <Field label="Back">
          <input name="end_date" type="date" required defaultValue={store.today(3)} className={inputClass} />
        </Field>
      </div>
      <Field label={`Budget (${CURRENCY})`} hint="Optional.">
        <input name="budget" inputMode="decimal" placeholder="2 100" className={inputClass} />
      </Field>
      <Field
        label={`Agency quote (${CURRENCY})`}
        hint="Optional, and the point: what a packaged version was quoted at."
      >
        <input name="agency_quote" inputMode="decimal" placeholder="2 890" className={inputClass} />
      </Field>

      <div className="flex gap-2">
        <button
          type="submit"
          className="flex-1 rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-medium text-white active:bg-brand-700"
        >
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function SavingsScreen({
  revision,
  onOpen,
}: {
  revision: number;
  onOpen: (id: number) => void;
}) {
  const rows = useMemo(
    () =>
      store
        .listTrips()
        .filter((trip) => trip.stage !== "cancelled")
        .map((trip) => ({ trip, savings: savingsSummary(trip, store.listBookings(trip.id)) }))
        .filter((entry) => entry.savings.basis !== "none"),
    [revision],
  );

  const agency = rows.reduce((sum, entry) => sum + entry.savings.agency_cents, 0);
  const yours = rows.reduce((sum, entry) => sum + entry.savings.your_cost_cents, 0);

  if (rows.length === 0) {
    return (
      <Empty
        title="Nothing to compare yet"
        hint="Record an agency quote on a trip, or on a single booking, and it shows up here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-emerald-50 px-4 py-4 ring-1 ring-emerald-200 ring-inset">
        <p className="text-xs font-medium uppercase tracking-wide text-emerald-800">
          Kept in your pocket
        </p>
        <p className="mt-1 text-3xl font-semibold text-emerald-900">
          {formatMoney(agency - yours, CURRENCY)}
        </p>
        <p className="mt-1 text-sm text-emerald-800">
          Across {rows.length} compared trip{rows.length === 1 ? "" : "s"}, against{" "}
          {formatMoney(agency, CURRENCY)} of quotes.
        </p>
      </div>

      <Card title="Trip by trip">
        <ul className="divide-y divide-slate-100">
          {rows.map(({ trip, savings }) => (
            <li key={trip.id}>
              <button
                type="button"
                onClick={() => onOpen(trip.id)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left active:bg-slate-50"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{trip.title}</p>
                  <p className="text-xs text-slate-500">
                    {savings.basis === "trip_quote" ? "Whole package" : "Individual bookings"} ·{" "}
                    {formatMoney(savings.your_cost_cents, CURRENCY)} vs{" "}
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

      <p className="text-xs text-slate-500">
        These figures only compare what you recorded as an agency quote. A package may bundle
        extras, so put like against like.
      </p>
    </div>
  );
}

function SettingsScreen({ onChanged }: { onChanged: () => void }) {
  const db = store.getDb();

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-semibold text-slate-900">Settings</h1>

      <Card title="This device">
        <dl className="divide-y divide-slate-100 text-sm">
          {[
            ["Trips", db.trips.length],
            ["Bookings", db.bookings.length],
            ["Expenses", db.expenses.length],
            ["Storage", window.JVStore ? "App storage" : "Browser storage"],
          ].map(([label, value]) => (
            <div key={String(label)} className="flex justify-between px-4 py-2.5">
              <dt className="text-slate-600">{label}</dt>
              <dd className="font-medium text-slate-900">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => {
            if (confirm("Replace everything with the demo trips?")) {
              store.resetToDemo();
              onChanged();
            }
          }}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 active:bg-slate-100"
        >
          Reload the demo trips
        </button>
        <button
          type="button"
          onClick={() => {
            if (confirm("Delete every trip on this device?")) {
              store.clearAll();
              onChanged();
            }
          }}
          className="w-full rounded-lg border border-rose-200 bg-white px-3 py-2.5 text-sm font-medium text-rose-700 active:bg-rose-50"
        >
          Start from empty
        </button>
      </div>

      <p className="text-xs text-slate-500">
        This build keeps everything on the phone — no account, no server, nothing leaves the
        device. Companions are names you type, not people with logins; the web app is where trips
        are shared between real accounts.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ forms */

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
      className="space-y-3 border-t border-slate-100 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const read = (key: string) => String(data.get(key) ?? "").trim();

        if (!read("vendor")) return setError("Who did you book with?");
        const amount = parseAmountToCents(read("amount"));
        if (amount === null) return setError("Enter an amount such as 246 or 245,90.");
        const quote = read("agency_quote") === "" ? 0 : parseAmountToCents(read("agency_quote"));
        if (quote === null) return setError("The agency quote is not an amount I can read.");

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
        <Field label="What">
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
        <Field label="With">
          <input name="vendor" required placeholder="Norwegian" className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={`You paid (${CURRENCY})`}>
          <input name="amount" required inputMode="decimal" placeholder="624" className={inputClass} />
        </Field>
        <Field label="Agency quote">
          <input name="agency_quote" inputMode="decimal" placeholder="790" className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Starts">
          <input name="start_at" type="date" defaultValue={defaultDate} className={inputClass} />
        </Field>
        {type === "stay" ? (
          <Field label="Nights">
            <input name="nights" type="number" min={1} defaultValue={1} className={inputClass} />
          </Field>
        ) : (
          <Field label="Ends">
            <input name="end_at" type="date" className={inputClass} />
          </Field>
        )}
      </div>

      <Field label="Notes">
        <input name="description" placeholder="LYS → BGO return" className={inputClass} />
      </Field>

      <button
        type="submit"
        className="w-full rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-medium text-white active:bg-brand-700"
      >
        Add to the trip
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

  return (
    <form
      className="space-y-3 border-t border-slate-100 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const read = (key: string) => String(data.get(key) ?? "").trim();

        if (!read("description")) return setError("What was it for?");
        const amount = parseAmountToCents(read("amount"));
        if (amount === null) return setError("Enter an amount such as 24 or 23,80.");

        store.addExpense({
          trip_id: tripId,
          paid_by: Number(read("paid_by")) || travellers[0].user_id,
          category: read("category") as ExpenseCategory,
          description: read("description"),
          spent_on: read("spent_on") || defaultDate,
          amount_cents: amount,
          shared: data.get("shared") === "on",
        });
        setError(null);
        form.reset();
        onAdded();
      }}
    >
      {error && <p className="text-sm text-rose-700">{error}</p>}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Category">
          <select name="category" defaultValue="food" className={inputClass}>
            {(Object.keys(CATEGORY_LABEL) as ExpenseCategory[]).map((key) => (
              <option key={key} value={key}>
                {CATEGORY_LABEL[key]}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Amount (${CURRENCY})`}>
          <input name="amount" required inputMode="decimal" placeholder="42,50" className={inputClass} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="When">
          <input name="spent_on" type="date" defaultValue={defaultDate} className={inputClass} />
        </Field>
        <Field label="Who paid">
          <select name="paid_by" defaultValue={String(travellers[0]?.user_id ?? "")} className={inputClass}>
            {travellers.map((traveller) => (
              <option key={traveller.user_id} value={traveller.user_id}>
                {traveller.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="What was it">
        <input name="description" required placeholder="Dinner in Bergen" className={inputClass} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="shared" defaultChecked className="h-4 w-4 rounded border-slate-300" />
        Split between everyone on the trip
      </label>

      <button
        type="submit"
        className="w-full rounded-lg bg-brand-600 px-3 py-2.5 text-sm font-medium text-white active:bg-brand-700"
      >
        Log it
      </button>
    </form>
  );
}

function TravellerForm({ tripId, onAdded }: { tripId: number; onAdded: () => void }) {
  return (
    <form
      className="flex gap-2 border-t border-slate-100 px-4 py-3"
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
      <input name="name" placeholder="Add someone" className={`${inputClass} flex-1`} />
      <button
        type="submit"
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 active:bg-slate-100"
      >
        Add
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------- bits */

const inputClass =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 outline-none focus:border-brand-500";

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
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </label>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <h2 className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-900">
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
        : "bg-white ring-slate-200";
  return (
    <div className={`rounded-xl px-3 py-3 shadow-sm ring-1 ring-inset ${ring}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

function Pill({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{children}</span>
  );
}

function Meter({ percent, over }: { percent: number; over: boolean }) {
  return (
    <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
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
        <span className="font-medium text-slate-700">{label}</span>
        <span className="tabular-nums text-slate-600">{formatMoney(value, CURRENCY)}</span>
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-100">
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
    <div className="border-t border-slate-100">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="w-full px-4 py-2.5 text-left text-sm font-medium text-brand-700"
      >
        {open ? "Close" : label}
      </button>
      {open && children}
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<App />);
