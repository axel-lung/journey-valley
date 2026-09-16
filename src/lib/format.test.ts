import { describe, expect, it } from "vitest";
import {
  countdown,
  daysUntil,
  formatDate,
  formatDateRange,
  formatNights,
  formatTravellers,
  initials,
} from "./format";

/** French formatting uses no-break spaces; compare on plain ones. */
const plain = (value: string) => value.replace(/[  ]/g, " ");

describe("formatDate", () => {
  it("writes a date the way a French reader expects", () => {
    expect(plain(formatDate("2026-10-12"))).toBe("12 oct. 2026");
    expect(plain(formatDate("2026-01-01"))).toBe("1 janv. 2026");
  });

  it("gives back anything it cannot parse", () => {
    expect(formatDate("pas-une-date")).toBe("pas-une-date");
  });
});

describe("formatDateRange", () => {
  it("collapses a range inside one month", () => {
    expect(plain(formatDateRange("2026-10-12", "2026-10-21"))).toBe("12 – 21 oct. 2026");
  });

  it("keeps both months when they differ", () => {
    expect(plain(formatDateRange("2026-10-28", "2026-11-03"))).toBe("28 oct. – 3 nov. 2026");
  });

  it("keeps both years when they differ", () => {
    expect(plain(formatDateRange("2026-12-28", "2027-01-03"))).toBe("28 déc. 2026 – 3 janv. 2027");
  });

  it("shows a single date for a same-day trip", () => {
    expect(plain(formatDateRange("2026-10-12", "2026-10-12"))).toBe("12 oct. 2026");
  });
});

describe("daysUntil", () => {
  const today = new Date("2026-06-10T09:30:00Z");

  it("counts whole days ahead and behind", () => {
    expect(daysUntil("2026-06-20", today)).toBe(10);
    expect(daysUntil("2026-06-10", today)).toBe(0);
    expect(daysUntil("2026-06-01", today)).toBe(-9);
  });

  it("ignores the time of day", () => {
    expect(daysUntil("2026-06-11", new Date("2026-06-10T23:59:00Z"))).toBe(1);
  });
});

describe("countdown", () => {
  const today = new Date("2026-06-10T09:00:00Z");

  it("counts down to a departure", () => {
    expect(countdown("2026-06-22", "2026-06-29", today).label).toBe("J − 12");
    expect(countdown("2026-06-11", "2026-06-15", today).label).toBe("Départ demain");
    expect(countdown("2026-06-10", "2026-06-15", today).label).toBe("Départ aujourd'hui");
  });

  it("switches to months when the departure is far off", () => {
    expect(countdown("2026-12-10", "2026-12-20", today).label).toBe("Dans 6 mois");
  });

  it("knows when the trip is happening right now", () => {
    const result = countdown("2026-06-08", "2026-06-14", today);
    expect(result.label).toBe("En voyage");
    expect(result.upcoming).toBe(true);
  });

  it("looks back once the trip is over", () => {
    expect(countdown("2026-06-01", "2026-06-05", today).label).toBe("Rentré il y a 5 jours");
    expect(countdown("2026-06-05", "2026-06-09", today).label).toBe("Rentré hier");
    expect(countdown("2026-01-01", "2026-01-10", today).upcoming).toBe(false);
  });
});

describe("small words", () => {
  it("agrees nights and travellers in number", () => {
    expect(formatNights(0)).toBe("aller-retour dans la journée");
    expect(formatNights(1)).toBe("1 nuit");
    expect(formatNights(4)).toBe("4 nuits");
    expect(formatTravellers(1)).toBe("1 voyageur");
    expect(formatTravellers(3)).toBe("3 voyageurs");
  });

  it("builds initials from at most two words", () => {
    expect(initials("Camille Dupont")).toBe("CD");
    expect(initials("Sam")).toBe("S");
    expect(initials("Jean-Luc  Marie  Dupont")).toBe("JM");
  });
});
