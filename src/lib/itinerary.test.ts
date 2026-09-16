import { describe, expect, it } from "vitest";
import { buildItinerary, emptyDays } from "./itinerary";
import { countryCodeFromName, practicalFor } from "./practical";
import type { Booking, Expense } from "./types";

const trip = { start_date: "2026-10-12", end_date: "2026-10-16" };

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: 1,
    trip_id: 1,
    type: "flight",
    vendor: "Test Air",
    reference: null,
    description: "",
    start_at: "2026-10-12",
    end_at: null,
    amount_cents: 10_000,
    agency_quote_cents: 0,
    nights: null,
    booked_by: null,
    created_at: "2026-01-01",
    ...overrides,
  };
}

function expense(overrides: Partial<Expense>): Expense {
  return {
    id: 1,
    trip_id: 1,
    paid_by: 1,
    category: "food",
    description: "Dîner",
    spent_on: "2026-10-13",
    amount_cents: 4_000,
    shared: 1,
    participant_ids: null,
    receipt_name: null,
    created_at: "2026-01-01",
    ...overrides,
  };
}

describe("buildItinerary", () => {
  it("makes one day per date, departure day first", () => {
    const itinerary = buildItinerary(trip, [], []);
    expect(itinerary.days).toHaveLength(5);
    expect(itinerary.days[0]).toMatchObject({ date: "2026-10-12", day_number: 1 });
    expect(itinerary.days[4]).toMatchObject({ date: "2026-10-16", day_number: 5 });
  });

  it("puts a booking on the day it starts, and counts it once", () => {
    const itinerary = buildItinerary(trip, [booking({ amount_cents: 24_000 })], []);
    expect(itinerary.days[0].starts).toHaveLength(1);
    expect(itinerary.days[0].total_cents).toBe(24_000);
    expect(itinerary.days[1].starts).toHaveLength(0);
  });

  it("carries a stay across the days it covers, without recounting its price", () => {
    const itinerary = buildItinerary(
      trip,
      [booking({ type: "stay", start_at: "2026-10-12", end_at: "2026-10-15", amount_cents: 60_000 })],
      [],
    );
    expect(itinerary.days[0].starts).toHaveLength(1);
    expect(itinerary.days[1].ongoing).toHaveLength(1);
    expect(itinerary.days[2].ongoing).toHaveLength(1);
    // Check-out day is not a night spent there.
    expect(itinerary.days[3].ongoing).toHaveLength(0);
    const total = itinerary.days.reduce((sum, day) => sum + day.total_cents, 0);
    expect(total).toBe(60_000);
  });

  it("files expenses on the day they were spent", () => {
    const itinerary = buildItinerary(trip, [], [expense({ spent_on: "2026-10-14" })]);
    expect(itinerary.days[2].expenses).toHaveLength(1);
    expect(itinerary.days[2].total_cents).toBe(4_000);
  });

  it("surfaces rows dated outside the trip instead of dropping them", () => {
    const itinerary = buildItinerary(
      trip,
      [booking({ start_at: "2025-01-01" })],
      [expense({ spent_on: "2027-05-05" })],
    );
    expect(itinerary.outside.bookings).toHaveLength(1);
    expect(itinerary.outside.expenses).toHaveLength(1);
    expect(itinerary.days.every((day) => day.total_cents === 0)).toBe(true);
  });

  it("copes with a same-day trip and with reversed dates", () => {
    expect(buildItinerary({ start_date: "2026-10-12", end_date: "2026-10-12" }, [], []).days)
      .toHaveLength(1);
    expect(buildItinerary({ start_date: "2026-10-12", end_date: "2026-10-01" }, [], []).days)
      .toHaveLength(1);
  });

  it("refuses to render an absurdly long trip day by day", () => {
    const itinerary = buildItinerary({ start_date: "2020-01-01", end_date: "2030-01-01" }, [], []);
    expect(itinerary.days.length).toBeLessThanOrEqual(366);
  });
});

describe("emptyDays", () => {
  it("finds the days with nothing planned", () => {
    const itinerary = buildItinerary(
      trip,
      [booking({ start_at: "2026-10-12" })],
      [expense({ spent_on: "2026-10-13" })],
    );
    expect(emptyDays(itinerary).map((day) => day.date)).toEqual([
      "2026-10-14",
      "2026-10-15",
      "2026-10-16",
    ]);
  });
});

describe("countryCodeFromName", () => {
  it("recognises French and English spellings, and the code itself", () => {
    expect(countryCodeFromName("Norvège")).toBe("NO");
    expect(countryCodeFromName("Norway")).toBe("NO");
    expect(countryCodeFromName(" no ")).toBe("NO");
    expect(countryCodeFromName("Japon")).toBe("JP");
    expect(countryCodeFromName("Japan")).toBe("JP");
  });

  it("returns null rather than guessing", () => {
    expect(countryCodeFromName("Wakanda")).toBeNull();
    expect(countryCodeFromName("")).toBeNull();
  });

  it("only gives a practical sheet for a country it actually knows", () => {
    expect(practicalFor("NO")?.currency).toBe("NOK");
    expect(practicalFor("XX")).toBeNull();
  });
});
