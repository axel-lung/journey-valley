import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  savingsFromTotals,
  savingsSummary,
  settlementPlan,
  splitBalances,
  tripNights,
  type MemberBalance,
} from "./budget";

describe("budgetStatus", () => {
  const trip = { budget_cents: 200_000, travellers: 2 };

  it("adds bookings and on-trip spending together", () => {
    const status = budgetStatus(
      trip,
      [{ amount_cents: 80_000 }, { amount_cents: 40_000 }],
      [{ amount_cents: 10_000 }],
    );
    expect(status.booked_cents).toBe(120_000);
    expect(status.spent_cents).toBe(10_000);
    expect(status.committed_cents).toBe(130_000);
    expect(status.remaining_cents).toBe(70_000);
    expect(status.percent_used).toBe(65);
    expect(status.over_budget).toBe(false);
  });

  it("reports going over budget with a negative remainder", () => {
    const status = budgetStatus(trip, [{ amount_cents: 250_000 }], []);
    expect(status.over_budget).toBe(true);
    expect(status.remaining_cents).toBe(-50_000);
    expect(status.percent_used).toBe(100);
  });

  it("treats a budget of zero as 'no budget set'", () => {
    const status = budgetStatus({ budget_cents: 0, travellers: 1 }, [{ amount_cents: 5_000 }], []);
    expect(status.over_budget).toBe(false);
    expect(status.percent_used).toBe(0);
  });

  it("divides by travellers, never by zero", () => {
    expect(budgetStatus(trip, [{ amount_cents: 100_000 }], []).per_traveller_cents).toBe(50_000);
    expect(
      budgetStatus({ budget_cents: 0, travellers: 0 }, [{ amount_cents: 9_000 }], [])
        .per_traveller_cents,
    ).toBe(9_000);
  });
});

describe("savingsSummary", () => {
  it("compares the whole package against a trip-level quote", () => {
    const summary = savingsSummary({ agency_quote_cents: 300_000 }, [
      { amount_cents: 120_000, agency_quote_cents: 0 },
      { amount_cents: 90_000, agency_quote_cents: 0 },
    ]);
    expect(summary.basis).toBe("trip_quote");
    expect(summary.your_cost_cents).toBe(210_000);
    expect(summary.saved_cents).toBe(90_000);
    expect(summary.saved_percent).toBe(30);
  });

  it("falls back to the lines that carry their own quote", () => {
    const summary = savingsSummary({ agency_quote_cents: 0 }, [
      { amount_cents: 40_000, agency_quote_cents: 52_000 },
      { amount_cents: 70_000, agency_quote_cents: 0 },
    ]);
    expect(summary.basis).toBe("line_quotes");
    expect(summary.compared_lines).toBe(1);
    // The un-quoted line is excluded from both sides of the comparison.
    expect(summary.your_cost_cents).toBe(40_000);
    expect(summary.agency_cents).toBe(52_000);
    expect(summary.saved_cents).toBe(12_000);
  });

  it("says nothing was compared when no quote exists", () => {
    const summary = savingsSummary({ agency_quote_cents: 0 }, [
      { amount_cents: 40_000, agency_quote_cents: 0 },
    ]);
    expect(summary.basis).toBe("none");
    expect(summary.saved_cents).toBe(0);
  });

  it("reports a negative saving honestly", () => {
    const summary = savingsSummary({ agency_quote_cents: 100_000 }, [
      { amount_cents: 130_000, agency_quote_cents: 0 },
    ]);
    expect(summary.saved_cents).toBe(-30_000);
    expect(summary.saved_percent).toBe(-30);
  });
});

describe("savingsFromTotals", () => {
  it("matches the trip-quote comparison from aggregates", () => {
    const summary = savingsFromTotals({
      agency_quote_cents: 300_000,
      booked_cents: 210_000,
      agency_total_cents: 0,
      quoted_paid_cents: 0,
    });
    expect(summary.basis).toBe("trip_quote");
    expect(summary.saved_cents).toBe(90_000);
  });

  it("only compares the quoted part when there is no trip quote", () => {
    const summary = savingsFromTotals({
      agency_quote_cents: 0,
      booked_cents: 110_000,
      agency_total_cents: 52_000,
      quoted_paid_cents: 40_000,
    });
    expect(summary.basis).toBe("line_quotes");
    expect(summary.your_cost_cents).toBe(40_000);
    expect(summary.saved_cents).toBe(12_000);
  });

  it("reports nothing to compare when no quote was recorded", () => {
    expect(
      savingsFromTotals({
        agency_quote_cents: 0,
        booked_cents: 80_000,
        agency_total_cents: 0,
        quoted_paid_cents: 0,
      }).basis,
    ).toBe("none");
  });
});

describe("splitBalances", () => {
  const members = [
    { user_id: 1, name: "Ana" },
    { user_id: 2, name: "Ben" },
    { user_id: 3, name: "Chi" },
  ];

  it("splits a shared expense evenly", () => {
    const balances = splitBalances(members, [
      { id: 1, paid_by: 1, amount_cents: 30_000, shared: 1 },
    ]);
    expect(balances.map((b) => b.share_cents)).toEqual([10_000, 10_000, 10_000]);
    expect(balances.map((b) => b.net_cents)).toEqual([20_000, -10_000, -10_000]);
  });

  it("keeps rounding remainders in whole cents that still add up", () => {
    const balances = splitBalances(members, [
      { id: 1, paid_by: 1, amount_cents: 1_000, shared: 1 },
    ]);
    const total = balances.reduce((sum, balance) => sum + balance.share_cents, 0);
    expect(total).toBe(1_000);
    expect(balances.map((b) => b.share_cents).sort()).toEqual([333, 333, 334]);
  });

  it("moves the rounding cent around between expenses", () => {
    const first = splitBalances(members, [{ id: 1, paid_by: 1, amount_cents: 100, shared: 1 }]);
    const second = splitBalances(members, [{ id: 2, paid_by: 1, amount_cents: 100, shared: 1 }]);
    const favouredFirst = first.find((b) => b.share_cents === 34)?.user_id;
    const favouredSecond = second.find((b) => b.share_cents === 34)?.user_id;
    expect(favouredFirst).not.toBe(favouredSecond);
  });

  it("leaves a personal expense with its payer", () => {
    const balances = splitBalances(members, [
      { id: 1, paid_by: 2, amount_cents: 5_000, shared: 0 },
    ]);
    expect(balances.every((balance) => balance.net_cents === 0)).toBe(true);
    expect(balances[1].paid_cents).toBe(5_000);
    expect(balances[1].share_cents).toBe(5_000);
  });

  it("nets several expenses paid by different people", () => {
    const balances = splitBalances(members, [
      { id: 1, paid_by: 1, amount_cents: 30_000, shared: 1 },
      { id: 2, paid_by: 2, amount_cents: 15_000, shared: 1 },
      { id: 3, paid_by: 3, amount_cents: 6_000, shared: 0 },
    ]);
    expect(balances.reduce((sum, balance) => sum + balance.net_cents, 0)).toBe(0);
    expect(balances[0].net_cents).toBe(15_000);
    expect(balances[1].net_cents).toBe(0);
    expect(balances[2].net_cents).toBe(-15_000);
  });

  it("ignores an expense paid by someone who is no longer on the trip", () => {
    const balances = splitBalances(members, [
      { id: 1, paid_by: 99, amount_cents: 3_000, shared: 1 },
    ]);
    expect(balances.every((balance) => balance.paid_cents === 0)).toBe(true);
    expect(balances.reduce((sum, balance) => sum + balance.share_cents, 0)).toBe(3_000);
  });
});

describe("settlementPlan", () => {
  function balance(user_id: number, name: string, net_cents: number): MemberBalance {
    return { user_id, name, paid_cents: 0, share_cents: 0, net_cents };
  }

  it("settles a simple two-person debt with one payment", () => {
    const transfers = settlementPlan([
      balance(1, "Ana", 10_000),
      balance(2, "Ben", -10_000),
    ]);
    expect(transfers).toEqual([
      { from_user_id: 2, from_name: "Ben", to_user_id: 1, to_name: "Ana", amount_cents: 10_000 },
    ]);
  });

  it("uses at most one payment per person where it can", () => {
    const transfers = settlementPlan([
      balance(1, "Ana", 20_000),
      balance(2, "Ben", -5_000),
      balance(3, "Chi", -15_000),
    ]);
    expect(transfers).toHaveLength(2);
    expect(transfers.reduce((sum, transfer) => sum + transfer.amount_cents, 0)).toBe(20_000);
  });

  it("splits a debt across creditors when it has to", () => {
    const transfers = settlementPlan([
      balance(1, "Ana", 12_000),
      balance(2, "Ben", 8_000),
      balance(3, "Chi", -20_000),
    ]);
    expect(transfers).toHaveLength(2);
    expect(transfers.every((transfer) => transfer.from_user_id === 3)).toBe(true);
    expect(transfers.reduce((sum, transfer) => sum + transfer.amount_cents, 0)).toBe(20_000);
  });

  it("returns nothing when everyone is square", () => {
    expect(settlementPlan([balance(1, "Ana", 0), balance(2, "Ben", 0)])).toEqual([]);
  });
});

describe("tripNights", () => {
  it("counts nights, with a same-day trip at zero", () => {
    expect(tripNights({ start_date: "2026-06-01", end_date: "2026-06-05" })).toBe(4);
    expect(tripNights({ start_date: "2026-06-01", end_date: "2026-06-01" })).toBe(0);
    expect(tripNights({ start_date: "2026-06-05", end_date: "2026-06-01" })).toBe(0);
  });
});
