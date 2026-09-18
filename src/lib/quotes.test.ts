import { describe, expect, it } from "vitest";
import { depositCents, draftLinesFor, isDecidable, isExpired } from "./quotes";
import type { Booking, Trip } from "./types";

const trip = {
  title: "Kyoto en automne",
  agency_quote_cents: 0,
  start_date: "2026-10-12",
  end_date: "2026-10-26",
} satisfies Pick<Trip, "title" | "agency_quote_cents" | "start_date" | "end_date">;

function booking(overrides: Partial<Booking>): Booking {
  return {
    id: 1,
    trip_id: 1,
    type: "flight",
    vendor: "ANA",
    reference: null,
    description: "CDG → KIX",
    start_at: "2026-10-12",
    end_at: null,
    amount_cents: 100_000,
    agency_quote_cents: 120_000,
    zone: "non_eu",
    nights: null,
    booked_by: null,
    created_at: "2026-01-01",
    ...overrides,
  };
}

describe("draftLinesFor", () => {
  it("sells the package as one line when the file carries a package price", () => {
    const lines = draftLinesFor({ ...trip, agency_quote_cents: 398_000 }, [booking({})]);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ label: "Kyoto en automne", price_cents: 398_000 });
  });

  it("bills each priced line when there is no package price", () => {
    const lines = draftLinesFor(trip, [
      booking({ id: 1, vendor: "ANA", agency_quote_cents: 120_000 }),
      booking({ id: 2, vendor: "Ryokan Gion", agency_quote_cents: 90_000 }),
    ]);
    expect(lines.map((line) => line.label)).toEqual(["ANA", "Ryokan Gion"]);
    expect(lines.reduce((total, line) => total + line.price_cents, 0)).toBe(210_000);
  });

  it("leaves out a line with no sell price rather than billing it at zero", () => {
    const lines = draftLinesFor(trip, [
      booking({ id: 1, agency_quote_cents: 120_000 }),
      booking({ id: 2, vendor: "Transfert", agency_quote_cents: 0 }),
    ]);
    expect(lines).toHaveLength(1);
  });
});

describe("depositCents", () => {
  it("takes the percentage of the total", () => {
    expect(depositCents({ total_cents: 398_000, deposit_percent: 30 })).toBe(119_400);
  });

  it("copes with a zero deposit", () => {
    expect(depositCents({ total_cents: 398_000, deposit_percent: 0 })).toBe(0);
  });
});

describe("isExpired / isDecidable", () => {
  const on = (date: string) => new Date(`${date}T12:00:00Z`);

  it("is not expired on the last valid day", () => {
    expect(isExpired({ valid_until: "2026-06-30" }, on("2026-06-30"))).toBe(false);
  });

  it("is expired the day after", () => {
    expect(isExpired({ valid_until: "2026-06-30" }, on("2026-07-01"))).toBe(true);
  });

  it("never expires without a date", () => {
    expect(isExpired({ valid_until: null }, on("2030-01-01"))).toBe(false);
  });

  it("only lets a sent, unexpired quote be decided", () => {
    const base = {
      id: 1,
      trip_id: 1,
      agency_id: 1,
      reference: "DEV-2026-0001",
      token: "t",
      title: "t",
      intro: "",
      terms: "",
      total_cents: 1,
      deposit_percent: 30,
      sent_at: null,
      opened_at: null,
      decided_at: null,
      decided_by_name: null,
      decided_ip: null,
      decided_note: null,
      created_at: "",
    };

    expect(isDecidable({ ...base, status: "sent", valid_until: "2026-06-30" }, on("2026-06-01"))).toBe(true);
    expect(isDecidable({ ...base, status: "sent", valid_until: "2026-06-30" }, on("2026-07-01"))).toBe(false);
    expect(isDecidable({ ...base, status: "draft", valid_until: null }, on("2026-06-01"))).toBe(false);
    expect(isDecidable({ ...base, status: "accepted", valid_until: null }, on("2026-06-01"))).toBe(false);
  });
});
