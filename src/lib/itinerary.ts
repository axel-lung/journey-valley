import type { Booking, Expense, Trip } from "./types";

/**
 * The day-by-day programme — the page an agency prints and staples to the
 * front of your file.
 *
 * Pure, so the trip page, the printable travel book and the tests all build the
 * same days from the same rows.
 */

export interface ItineraryDay {
  date: string;
  /** 1 for the departure day. */
  day_number: number;
  /** Bookings that begin on this day. */
  starts: Booking[];
  /** Stays and hires that merely cover it, so a hotel is not repeated daily. */
  ongoing: Booking[];
  /**
   * Prestations qui *se terminent* ce jour-là et qu'il faut annoncer : le vol
   * retour, la restitution de la voiture. Sans cela, un aller-retour sur deux
   * semaines s'affichait « en cours » quinze jours de suite — vrai au sens des
   * dates, absurde sur un programme.
   */
  returns: Booking[];
  expenses: Expense[];
  /** What this day costs: the bookings that start, plus the spending. */
  total_cents: number;
}

export interface Itinerary {
  days: ItineraryDay[];
  /**
   * Anything dated outside the trip: a flight booked for the wrong month, an
   * expense typed with last year's date. Surfaced rather than dropped.
   */
  outside: { bookings: Booking[]; expenses: Expense[] };
}

function dayList(startIso: string, endIso: string): string[] {
  const start = Date.parse(`${startIso.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${endIso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return Number.isNaN(start) ? [] : [startIso.slice(0, 10)];
  }

  // A trip of a year is a data-entry mistake, not an itinerary to render.
  const count = Math.min(366, Math.round((end - start) / 86_400_000) + 1);
  return Array.from({ length: count }, (_, index) =>
    new Date(start + index * 86_400_000).toISOString().slice(0, 10),
  );
}

export function buildItinerary(
  trip: Pick<Trip, "start_date" | "end_date">,
  bookings: Booking[],
  expenses: Expense[],
): Itinerary {
  const dates = dayList(trip.start_date, trip.end_date);
  const index = new Map<string, ItineraryDay>();

  dates.forEach((date, position) => {
    index.set(date, {
      date,
      day_number: position + 1,
      starts: [],
      ongoing: [],
      returns: [],
      expenses: [],
      total_cents: 0,
    });
  });

  const outside: Itinerary["outside"] = { bookings: [], expenses: [] };

  for (const booking of bookings) {
    const start = booking.start_at.slice(0, 10);
    const day = index.get(start);

    if (day) {
      day.starts.push(booking);
      day.total_cents += booking.amount_cents;
    } else {
      outside.bookings.push(booking);
    }

    const end = booking.end_at?.slice(0, 10);
    if (!end || end <= start) continue;

    // Un déplacement n'occupe pas les jours qu'il enjambe : sa date de fin est
    // le retour, un événement en soi. Un logement ou une location, si : ils
    // couvrent les jours intermédiaires, et se terminent sans cérémonie.
    if (booking.type === "flight" || booking.type === "transport") {
      index.get(end)?.returns.push(booking);
      continue;
    }

    for (const date of dates) {
      if (date > start && date < end) index.get(date)?.ongoing.push(booking);
    }
  }

  for (const expense of expenses) {
    const day = index.get(expense.spent_on.slice(0, 10));
    if (day) {
      day.expenses.push(expense);
      day.total_cents += expense.amount_cents;
    } else {
      outside.expenses.push(expense);
    }
  }

  return { days: [...index.values()], outside };
}

/** Days that have nothing on them at all — the gaps worth filling. */
export function emptyDays(itinerary: Itinerary): ItineraryDay[] {
  return itinerary.days.filter(
    (day) =>
      day.starts.length === 0 &&
      day.ongoing.length === 0 &&
      day.returns.length === 0 &&
      day.expenses.length === 0,
  );
}
