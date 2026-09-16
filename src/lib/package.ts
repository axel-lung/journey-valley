import type { BookingType } from "./types";

/**
 * What a travel agency adds on top of each kind of component when it sells the
 * same trip as a package. Flights are often near cost — they are the bait —
 * while excursions and hotel nights carry the margin.
 *
 * These are published industry ranges, not a quote: everything derived from
 * them is an estimate and the UI must say so. The savings figures that people
 * actually rely on still come from a quote they typed in themselves.
 */
const MARKUP: Record<BookingType, { low: number; mid: number; high: number }> = {
  flight: { low: 0.04, mid: 0.1, high: 0.16 },
  stay: { low: 0.1, mid: 0.18, high: 0.28 },
  activity: { low: 0.15, mid: 0.25, high: 0.35 },
  transport: { low: 0.08, mid: 0.15, high: 0.22 },
  other: { low: 0.08, mid: 0.15, high: 0.22 },
};

export interface PackageEstimate {
  /** What the components cost you. */
  your_cost_cents: number;
  low_cents: number;
  mid_cents: number;
  high_cents: number;
  /** The mid-range difference — the number worth showing. */
  mid_difference_cents: number;
  /** How many components fed the estimate; zero means there is nothing to say. */
  components: number;
}

const EMPTY: PackageEstimate = {
  your_cost_cents: 0,
  low_cents: 0,
  mid_cents: 0,
  high_cents: 0,
  mid_difference_cents: 0,
  components: 0,
};

/**
 * Estimates what the same components would cost inside a package, so a trip
 * says something useful before anyone has asked an agency for a quote.
 */
export function estimatePackagePrice(
  components: Array<{ type: BookingType; amount_cents: number }>,
): PackageEstimate {
  const priced = components.filter((component) => component.amount_cents > 0);
  if (priced.length === 0) return EMPTY;

  let yourCost = 0;
  let low = 0;
  let mid = 0;
  let high = 0;

  for (const component of priced) {
    const markup = MARKUP[component.type] ?? MARKUP.other;
    yourCost += component.amount_cents;
    low += Math.round(component.amount_cents * (1 + markup.low));
    mid += Math.round(component.amount_cents * (1 + markup.mid));
    high += Math.round(component.amount_cents * (1 + markup.high));
  }

  return {
    your_cost_cents: yourCost,
    low_cents: low,
    mid_cents: mid,
    high_cents: high,
    mid_difference_cents: mid - yourCost,
    components: priced.length,
  };
}

/** The markup band for one component, for a per-line hint in a search result. */
export function estimateComponentPackagePrice(type: BookingType, amountCents: number): number {
  const markup = MARKUP[type] ?? MARKUP.other;
  return Math.round(amountCents * (1 + markup.mid));
}
