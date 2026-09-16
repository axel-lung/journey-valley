import { percentOf } from "./money";
import type { Booking, Expense, Trip, TripMember } from "./types";

export interface BudgetStatus {
  budget_cents: number;
  booked_cents: number;
  spent_cents: number;
  committed_cents: number;
  remaining_cents: number;
  percent_used: number;
  over_budget: boolean;
  /** Committed spend per traveller — the number people actually compare. */
  per_traveller_cents: number;
}

export function budgetStatus(
  trip: Pick<Trip, "budget_cents" | "travellers">,
  bookings: Array<Pick<Booking, "amount_cents">>,
  expenses: Array<Pick<Expense, "amount_cents">>,
): BudgetStatus {
  const booked = bookings.reduce((sum, booking) => sum + booking.amount_cents, 0);
  const spent = expenses.reduce((sum, expense) => sum + expense.amount_cents, 0);
  const committed = booked + spent;
  const travellers = Math.max(1, trip.travellers);

  return {
    budget_cents: trip.budget_cents,
    booked_cents: booked,
    spent_cents: spent,
    committed_cents: committed,
    remaining_cents: trip.budget_cents - committed,
    percent_used: percentOf(committed, trip.budget_cents),
    over_budget: trip.budget_cents > 0 && committed > trip.budget_cents,
    per_traveller_cents: Math.round(committed / travellers),
  };
}

export type SavingsBasis = "trip_quote" | "line_quotes" | "none";

export interface SavingsSummary {
  basis: SavingsBasis;
  /**
   * True when a whole-package quote is being compared against a trip that is
   * still being booked: the quote covers everything, the bookings do not yet,
   * so the difference flatters you. The UI must say so, and totals must leave
   * these out.
   */
  provisional: boolean;
  /** What you are paying for the scope that was compared. */
  your_cost_cents: number;
  /** What the agency or package would have cost for that same scope. */
  agency_cents: number;
  saved_cents: number;
  saved_percent: number;
  compared_lines: number;
}

const NO_SAVINGS: SavingsSummary = {
  basis: "none",
  provisional: false,
  your_cost_cents: 0,
  agency_cents: 0,
  saved_cents: 0,
  saved_percent: 0,
  compared_lines: 0,
};

/**
 * The product's whole point: show what booking it yourself saved against a
 * travel agency quote. A quote on the trip covers the package as a whole and
 * wins; otherwise only the individual lines that carry a quote are compared,
 * so the figure is never inflated by lines nobody priced.
 */
export function savingsSummary(
  trip: Pick<Trip, "agency_quote_cents"> & Partial<Pick<Trip, "stage">>,
  bookings: Array<Pick<Booking, "amount_cents" | "agency_quote_cents">>,
): SavingsSummary {
  if (trip.agency_quote_cents > 0) {
    const yourCost = bookings.reduce((sum, booking) => sum + booking.amount_cents, 0);
    return summarise(
      "trip_quote",
      yourCost,
      trip.agency_quote_cents,
      bookings.length,
      isStillBooking(trip.stage),
    );
  }

  const compared = bookings.filter((booking) => booking.agency_quote_cents > 0);
  if (compared.length === 0) return NO_SAVINGS;

  const yourCost = compared.reduce((sum, booking) => sum + booking.amount_cents, 0);
  const agency = compared.reduce((sum, booking) => sum + booking.agency_quote_cents, 0);
  return summarise("line_quotes", yourCost, agency, compared.length);
}

/** Stages where the bookings are, by definition, not all in yet. */
function isStillBooking(stage: Trip["stage"] | undefined): boolean {
  return stage === "idea" || stage === "planning";
}

function summarise(
  basis: SavingsBasis,
  yourCost: number,
  agency: number,
  comparedLines: number,
  provisional = false,
): SavingsSummary {
  const saved = agency - yourCost;
  return {
    basis,
    provisional,
    your_cost_cents: yourCost,
    agency_cents: agency,
    saved_cents: saved,
    // A negative saving is a real answer: you paid more than the quote.
    saved_percent: agency > 0 ? Math.round((saved / agency) * 100) : 0,
    compared_lines: comparedLines,
  };
}

/**
 * The same comparison from pre-aggregated list totals, so a trips table does
 * not have to load every booking. `compared_lines` is not meaningful here —
 * the rows are synthetic — but the amounts match `savingsSummary` exactly.
 */
export function savingsFromTotals(totals: {
  agency_quote_cents: number;
  booked_cents: number;
  agency_total_cents: number;
  quoted_paid_cents: number;
  stage?: Trip["stage"];
}): SavingsSummary {
  return savingsSummary(totals, [
    { amount_cents: totals.quoted_paid_cents, agency_quote_cents: totals.agency_total_cents },
    {
      amount_cents: totals.booked_cents - totals.quoted_paid_cents,
      agency_quote_cents: 0,
    },
  ]);
}

export interface MemberBalance {
  user_id: number;
  name: string;
  /** What this person actually paid out. */
  paid_cents: number;
  /** This person's share of the shared costs. */
  share_cents: number;
  /** Positive: the group owes them. Negative: they owe the group. */
  net_cents: number;
}

/**
 * Splits shared expenses across the people they concern: everyone on the trip
 * by default, or only `participant_ids` when the expense names a subset (the
 * taxi three of you took, the museum two of you skipped). Rounding remainders
 * are handed out one cent at a time, starting at a different person for each
 * expense, so shares stay whole cents and always add back up to the exact
 * total.
 */
export function splitBalances(
  members: Array<Pick<TripMember, "user_id" | "name">>,
  expenses: Array<
    Pick<Expense, "id" | "paid_by" | "amount_cents" | "shared"> &
      Partial<Pick<Expense, "participant_ids">>
  >,
): MemberBalance[] {
  const ordered = [...members].sort((a, b) => a.user_id - b.user_id);
  const paid = new Map<number, number>();
  const share = new Map<number, number>();
  for (const member of ordered) {
    paid.set(member.user_id, 0);
    share.set(member.user_id, 0);
  }

  for (const expense of expenses) {
    if (paid.has(expense.paid_by)) {
      paid.set(expense.paid_by, (paid.get(expense.paid_by) ?? 0) + expense.amount_cents);
    }

    if (!expense.shared) {
      // A personal cost is owed entirely by whoever paid it.
      if (share.has(expense.paid_by)) {
        share.set(expense.paid_by, (share.get(expense.paid_by) ?? 0) + expense.amount_cents);
      }
      continue;
    }

    // An expense may name the people it concerns; an empty or unknown list
    // falls back to the whole trip rather than silently charging nobody.
    const named = expense.participant_ids ?? null;
    const sharers = named?.length
      ? ordered.filter((member) => named.includes(member.user_id))
      : ordered;
    const participants = sharers.length > 0 ? sharers : ordered;

    const count = participants.length;
    if (count === 0) continue;

    const base = Math.floor(expense.amount_cents / count);
    let remainder = expense.amount_cents - base * count;
    const offset = ((expense.id % count) + count) % count;

    for (let index = 0; index < count; index += 1) {
      const member = participants[(offset + index) % count];
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      share.set(member.user_id, (share.get(member.user_id) ?? 0) + base + extra);
    }
  }

  return ordered.map((member) => {
    const paidCents = paid.get(member.user_id) ?? 0;
    const shareCents = share.get(member.user_id) ?? 0;
    return {
      user_id: member.user_id,
      name: member.name,
      paid_cents: paidCents,
      share_cents: shareCents,
      net_cents: paidCents - shareCents,
    };
  });
}

export interface Transfer {
  from_user_id: number;
  from_name: string;
  to_user_id: number;
  to_name: string;
  amount_cents: number;
}

/**
 * Turns balances into the shortest list of payments that settles the trip:
 * biggest debtor pays the biggest creditor until everyone is square.
 */
export function settlementPlan(balances: MemberBalance[]): Transfer[] {
  const debtors = balances
    .filter((balance) => balance.net_cents < 0)
    .map((balance) => ({ ...balance, remaining: -balance.net_cents }))
    .sort((a, b) => b.remaining - a.remaining || a.user_id - b.user_id);

  const creditors = balances
    .filter((balance) => balance.net_cents > 0)
    .map((balance) => ({ ...balance, remaining: balance.net_cents }))
    .sort((a, b) => b.remaining - a.remaining || a.user_id - b.user_id);

  const transfers: Transfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.remaining, creditor.remaining);

    if (amount > 0) {
      transfers.push({
        from_user_id: debtor.user_id,
        from_name: debtor.name,
        to_user_id: creditor.user_id,
        to_name: creditor.name,
        amount_cents: amount,
      });
      debtor.remaining -= amount;
      creditor.remaining -= amount;
    }

    if (debtor.remaining === 0) debtorIndex += 1;
    if (creditor.remaining === 0) creditorIndex += 1;
  }

  return transfers;
}

/** Whole nights between the two dates of a trip. */
export function tripNights(trip: Pick<Trip, "start_date" | "end_date">): number {
  const from = Date.parse(`${trip.start_date.slice(0, 10)}T00:00:00Z`);
  const to = Date.parse(`${trip.end_date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.max(0, Math.round((to - from) / 86_400_000));
}
