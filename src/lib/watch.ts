import type { SearchResult } from "./search/types";

export interface PriceWatch {
  id: number;
  trip_id: number;
  kind: "flight" | "stay" | "activity";
  origin: string | null;
  destination: string;
  start_date: string;
  end_date: string | null;
  travellers: number;
  /** Tell me when it goes at or below this. 0 means "just track it". */
  target_cents: number;
  /** Cheapest seen at the last check, or null before the first one. */
  last_price_cents: number | null;
  /** Cheapest ever seen, so a rebound is still measured against the floor. */
  best_price_cents: number | null;
  last_checked_at: string | null;
  created_at: string;
}

export interface WatchEvaluation {
  best: SearchResult | null;
  best_price_cents: number | null;
  /** Cheaper than the previous check. */
  dropped: boolean;
  /** How much cheaper, in cents; zero when it did not drop. */
  drop_cents: number;
  /** At or below the price the traveller asked to be told about. */
  target_reached: boolean;
  /** Worth telling someone about: a drop, or the target being hit. */
  notable: boolean;
}

/**
 * Compares a fresh set of results against what a watch saw last time.
 *
 * Pure on purpose: the scheduled checker, the "check now" button and the tests
 * all decide "is this worth a notification?" the same way.
 */
export function evaluateWatch(
  watch: Pick<PriceWatch, "target_cents" | "last_price_cents">,
  results: SearchResult[],
): WatchEvaluation {
  const priced = results.filter((result) => result.price_cents > 0);
  if (priced.length === 0) {
    return {
      best: null,
      best_price_cents: null,
      dropped: false,
      drop_cents: 0,
      target_reached: false,
      notable: false,
    };
  }

  const best = priced.reduce((cheapest, result) =>
    result.price_cents < cheapest.price_cents ? result : cheapest,
  );

  const previous = watch.last_price_cents;
  const dropped = previous !== null && best.price_cents < previous;
  const targetReached = watch.target_cents > 0 && best.price_cents <= watch.target_cents;

  return {
    best,
    best_price_cents: best.price_cents,
    dropped,
    drop_cents: dropped ? previous - best.price_cents : 0,
    target_reached: targetReached,
    // The first check has nothing to compare against, so it is never "news"
    // unless the price is already under the target.
    notable: targetReached || dropped,
  };
}

/** A one-line summary for the watch list, in French. */
export function describeWatch(watch: PriceWatch): string {
  const what =
    watch.kind === "flight"
      ? `Vol ${watch.origin ? `${watch.origin} → ` : ""}${watch.destination}`
      : watch.kind === "stay"
        ? `Logement à ${watch.destination}`
        : `Activité à ${watch.destination}`;

  return `${what} · ${watch.travellers} voyageur${watch.travellers > 1 ? "s" : ""}`;
}
