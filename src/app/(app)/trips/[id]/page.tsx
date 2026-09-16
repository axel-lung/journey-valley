import Link from "next/link";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { SavingsBars } from "@/components/spend-chart";
import {
  Badge,
  Card,
  EmptyState,
  ErrorNotice,
  StatTile,
  TableShell,
  buttonClass,
  secondaryButtonClass,
} from "@/components/ui";
import { requireUser } from "@/lib/auth";
import {
  budgetStatus,
  savingsSummary,
  settlementPlan,
  splitBalances,
  tripNights,
} from "@/lib/budget";
import { formatMoney } from "@/lib/money";
import { getTripSummary, listBookings, listExpenses, listMembers } from "@/lib/trips";
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
import { CompanionForm } from "./companion-form";
import { ExpenseForm } from "./expense-form";

const BOOKING_ICON: Record<BookingType, string> = {
  flight: "✈",
  stay: "⌂",
  transport: "▤",
  activity: "◈",
  other: "•",
};

const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  food: "Food and drink",
  transport: "Getting around",
  lodging: "Stays",
  activities: "Things to do",
  shopping: "Shopping",
  other: "Other",
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

  const trip = getTripSummary(user.id, Number(id));
  if (!trip) notFound();

  const currency = trip.currency;
  const members = listMembers(trip.id);
  const bookings = listBookings(trip.id);
  const expenses = listExpenses(trip.id);

  const budget = budgetStatus(trip, bookings, expenses);
  const savings = savingsSummary(trip, bookings);
  const balances = splitBalances(members, expenses);
  const transfers = settlementPlan(balances);
  const actions = availableStageActions(trip, trip.my_role);
  const isOwner = trip.my_role === "owner";
  const editable = trip.stage !== "cancelled";

  const nameById = new Map(members.map((member) => [member.user_id, member.name]));

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <Link href="/trips" className="text-sm text-slate-500 hover:text-slate-900">
          ← Back to trips
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-xl font-semibold text-slate-900">{trip.title}</h1>
              <Badge className={STAGE_TONE[trip.stage]}>{STAGE_LABEL[trip.stage]}</Badge>
              {budget.over_budget && (
                <Badge className="bg-rose-50 text-rose-700 ring-rose-200">Over budget</Badge>
              )}
            </div>
            <p className="mt-1.5 text-sm text-slate-500">
              {trip.destination_city}, {trip.destination_country} · {trip.start_date} →{" "}
              {trip.end_date} · {tripNights(trip)} night{tripNights(trip) === 1 ? "" : "s"} ·{" "}
              {members.length} traveller{members.length === 1 ? "" : "s"}
              {!isOwner ? ` · organised by ${trip.owner_name}` : ""}
            </p>
          </div>

          {actions.length > 0 && (
            <form action={changeStageAction} className="flex flex-wrap justify-end gap-2">
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
        </div>

        <ErrorNotice message={error} />
      </header>

      {trip.summary && (
        <p className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-700">
          {trip.summary}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Committed"
          value={formatMoney(budget.committed_cents, currency)}
          hint={`${formatMoney(budget.booked_cents, currency)} booked · ${formatMoney(budget.spent_cents, currency)} on the road`}
        />
        <StatTile
          label="Budget left"
          value={
            trip.budget_cents > 0 ? formatMoney(budget.remaining_cents, currency) : "No budget set"
          }
          hint={trip.budget_cents > 0 ? `${budget.percent_used}% of ${formatMoney(trip.budget_cents, currency)}` : undefined}
          tone={budget.over_budget ? "warning" : "default"}
        />
        <StatTile
          label="Per traveller"
          value={formatMoney(budget.per_traveller_cents, currency)}
          hint={`Split ${members.length} way${members.length === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Saved vs. agency"
          value={savings.basis === "none" ? "—" : formatMoney(savings.saved_cents, currency)}
          hint={
            savings.basis === "none"
              ? "Add a quote to compare"
              : savings.basis === "trip_quote"
                ? "Against the package quote"
                : `Across ${savings.compared_lines} compared booking${savings.compared_lines === 1 ? "" : "s"}`
          }
          tone={savings.basis !== "none" && savings.saved_cents > 0 ? "positive" : "default"}
        />
      </div>

      {trip.budget_cents > 0 && (
        <Card title="Budget">
          <div className="px-5 py-4">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-600">
                {formatMoney(budget.committed_cents, currency)} of{" "}
                {formatMoney(trip.budget_cents, currency)}
              </span>
              <span className="tabular-nums text-slate-500">{budget.percent_used}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${budget.over_budget ? "bg-rose-500" : "bg-brand-600"}`}
                style={{ width: `${Math.max(budget.percent_used, 2)}%` }}
              />
            </div>
            {budget.over_budget && (
              <p className="mt-2 text-xs text-rose-600">
                {formatMoney(-budget.remaining_cents, currency)} over what you set out to spend.
              </p>
            )}
          </div>
        </Card>
      )}

      {savings.basis !== "none" && (
        <Card
          title={
            savings.basis === "trip_quote"
              ? "Against the agency's package price"
              : "Against the quotes you recorded"
          }
        >
          <SavingsBars
            agencyCents={savings.agency_cents}
            yourCents={savings.your_cost_cents}
            currency={currency}
          />
          <p className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
            {savings.saved_cents >= 0 ? (
              <>
                Booking it yourself keeps{" "}
                <strong className="text-emerald-700">
                  {formatMoney(savings.saved_cents, currency)}
                </strong>{" "}
                ({savings.saved_percent}%) that the agency would have taken.
              </>
            ) : (
              <>
                This is{" "}
                <strong className="text-rose-700">
                  {formatMoney(-savings.saved_cents, currency)}
                </strong>{" "}
                more than the quote — worth checking what the package included.
              </>
            )}
          </p>
        </Card>
      )}

      <Card title="Bookings">
        {bookings.length === 0 ? (
          <EmptyState
            title="Nothing booked yet"
            hint="Flights, stays, car hire, that one activity you have to book ahead."
          />
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-5 py-2.5">Booking</th>
                <th className="px-5 py-2.5">When</th>
                <th className="px-5 py-2.5 text-right">You paid</th>
                <th className="px-5 py-2.5 text-right">Agency</th>
                <th className="px-5 py-2.5" />
              </tr>
            }
          >
            {bookings.map((booking) => (
              <tr key={booking.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <span className="font-medium text-slate-900">
                    <span aria-hidden className="mr-1.5 text-slate-400">
                      {BOOKING_ICON[booking.type]}
                    </span>
                    {booking.vendor}
                  </span>
                  <p className="text-xs text-slate-500">
                    {booking.description || booking.type}
                    {booking.reference ? ` · ${booking.reference}` : ""}
                    {booking.nights
                      ? ` · ${booking.nights} nights (${formatMoney(Math.round(booking.amount_cents / booking.nights), currency)}/night)`
                      : ""}
                  </p>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {booking.start_at.slice(0, 10)}
                  {booking.end_at && (
                    <p className="text-xs text-slate-400">→ {booking.end_at.slice(0, 10)}</p>
                  )}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                  {formatMoney(booking.amount_cents, currency)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {booking.agency_quote_cents > 0 ? (
                    <>
                      <span className="text-slate-500">
                        {formatMoney(booking.agency_quote_cents, currency)}
                      </span>
                      <p className="text-xs text-emerald-700">
                        −{formatMoney(booking.agency_quote_cents - booking.amount_cents, currency)}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  {editable && (
                    <form action={deleteBookingAction}>
                      <input type="hidden" name="booking_id" value={booking.id} />
                      <button
                        type="submit"
                        className="text-xs text-slate-400 hover:text-rose-600"
                        aria-label={`Remove the booking with ${booking.vendor}`}
                      >
                        Remove
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        {editable && (
          <details className="border-t border-slate-100">
            <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-brand-600 hover:text-brand-700">
              Add a booking
            </summary>
            <BookingForm tripId={trip.id} currency={currency} defaultDate={trip.start_date} />
          </details>
        )}
      </Card>

      <Card title="Spending on the trip">
        {expenses.length === 0 ? (
          <EmptyState title="Nothing logged yet" hint="Meals, taxis, tickets — split or personal." />
        ) : (
          <TableShell
            head={
              <tr>
                <th className="px-5 py-2.5">Expense</th>
                <th className="px-5 py-2.5">Paid by</th>
                <th className="px-5 py-2.5">When</th>
                <th className="px-5 py-2.5 text-right">Amount</th>
                <th className="px-5 py-2.5" />
              </tr>
            }
          >
            {expenses.map((expense) => (
              <tr key={expense.id} className="hover:bg-slate-50">
                <td className="px-5 py-3">
                  <span className="font-medium text-slate-900">{expense.description}</span>
                  <p className="text-xs text-slate-500">
                    {CATEGORY_LABEL[expense.category]}
                    {expense.receipt_name ? ` · ${expense.receipt_name}` : ""}
                  </p>
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {nameById.get(expense.paid_by) ?? "Someone"}
                  <p className="text-xs text-slate-400">
                    {expense.shared ? "split" : "personal"}
                  </p>
                </td>
                <td className="px-5 py-3 text-slate-600">{expense.spent_on}</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                  {formatMoney(expense.amount_cents, currency)}
                </td>
                <td className="px-5 py-3 text-right">
                  {editable && (
                    <form action={deleteExpenseAction}>
                      <input type="hidden" name="expense_id" value={expense.id} />
                      <button
                        type="submit"
                        className="text-xs text-slate-400 hover:text-rose-600"
                        aria-label={`Delete ${expense.description}`}
                      >
                        Delete
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </TableShell>
        )}

        {editable && (
          <details className="border-t border-slate-100">
            <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-brand-600 hover:text-brand-700">
              Log an expense
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
        <Card title="Who's coming">
          <ul className="divide-y divide-slate-100">
            {members.map((member) => (
              <li key={member.user_id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {member.name}
                    {member.user_id === user.id && (
                      <span className="ml-1.5 text-xs text-slate-400">you</span>
                    )}
                  </p>
                  <p className="truncate text-xs text-slate-500">{member.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge
                    className={
                      member.role === "owner"
                        ? "bg-brand-50 text-brand-700 ring-brand-200"
                        : "bg-slate-100 text-slate-600 ring-slate-200"
                    }
                  >
                    {member.role === "owner" ? "organiser" : "companion"}
                  </Badge>
                  {isOwner && member.role !== "owner" && (
                    <form action={removeCompanionAction}>
                      <input type="hidden" name="trip_id" value={trip.id} />
                      <input type="hidden" name="user_id" value={member.user_id} />
                      <button type="submit" className="text-xs text-slate-400 hover:text-rose-600">
                        Remove
                      </button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {isOwner && editable && <CompanionForm tripId={trip.id} />}
        </Card>

        <Card title="Settling up">
          {expenses.length === 0 || members.length < 2 ? (
            <EmptyState
              title="Nothing to settle"
              hint="Once shared expenses are logged, the fewest payments to square up show here."
            />
          ) : (
            <>
              <ul className="divide-y divide-slate-100">
                {balances.map((balance) => (
                  <li
                    key={balance.user_id}
                    className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm"
                  >
                    <span className="text-slate-700">{balance.name}</span>
                    <span className="text-right">
                      <span
                        className={`tabular-nums ${
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
                            ? `is owed ${formatMoney(balance.net_cents, currency)}`
                            : `owes ${formatMoney(-balance.net_cents, currency)}`}
                      </span>
                      <p className="text-xs text-slate-400">
                        paid {formatMoney(balance.paid_cents, currency)} · share{" "}
                        {formatMoney(balance.share_cents, currency)}
                      </p>
                    </span>
                  </li>
                ))}
              </ul>

              {transfers.length > 0 && (
                <div className="border-t border-slate-100 px-5 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Fewest payments
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-slate-700">
                    {transfers.map((transfer) => (
                      <li key={`${transfer.from_user_id}-${transfer.to_user_id}`}>
                        {transfer.from_name} → {transfer.to_name}:{" "}
                        <strong>{formatMoney(transfer.amount_cents, currency)}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
