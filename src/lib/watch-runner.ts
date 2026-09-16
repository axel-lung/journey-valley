import { getDb, recordActivity } from "./db";
import { runSearch } from "./search";
import { evaluateWatch, type PriceWatch, type WatchEvaluation } from "./watch";

/**
 * Runs one price watch: search, compare with the last check, store the new
 * point. Shared by the "check now" button and the scheduled endpoint, so a
 * manual check and a nightly one can never drift apart.
 */
export async function checkWatch(watch: PriceWatch): Promise<WatchEvaluation> {
  const outcome = await runSearch({
    kind: watch.kind,
    origin: watch.origin ?? undefined,
    destination: watch.destination,
    start_date: watch.start_date,
    end_date: watch.end_date ?? undefined,
    travellers: watch.travellers,
  });

  const evaluation = evaluateWatch(watch, outcome.results);
  if (evaluation.best_price_cents === null) return evaluation;

  const db = getDb();
  db.prepare(
    `UPDATE price_watches
        SET last_price_cents = ?,
            best_price_cents = CASE
              WHEN best_price_cents IS NULL OR ? < best_price_cents THEN ?
              ELSE best_price_cents END,
            last_checked_at = datetime('now')
      WHERE id = ?`,
  ).run(
    evaluation.best_price_cents,
    evaluation.best_price_cents,
    evaluation.best_price_cents,
    watch.id,
  );

  db.prepare(`INSERT INTO price_points (watch_id, price_cents, vendor) VALUES (?, ?, ?)`).run(
    watch.id,
    evaluation.best_price_cents,
    evaluation.best?.vendor ?? null,
  );

  // Only a drop or a target being hit is worth surfacing; a flat price is not.
  if (evaluation.notable) {
    recordActivity({
      tripId: watch.trip_id,
      actorId: null,
      action: evaluation.target_reached ? "watch.target" : "watch.drop",
      detail: `${watch.destination} · ${(evaluation.best_price_cents / 100).toFixed(0)} €`,
    });
  }

  return evaluation;
}

export interface SweepSummary {
  checked: number;
  notable: number;
  dropped: number;
  target_reached: number;
  failed: number;
}

/** Every watch in the database — what the scheduled run does. */
export async function checkAllWatches(): Promise<SweepSummary> {
  const watches = getDb()
    .prepare<[], PriceWatch>(`SELECT * FROM price_watches ORDER BY id`)
    .all();

  const summary: SweepSummary = {
    checked: 0,
    notable: 0,
    dropped: 0,
    target_reached: 0,
    failed: 0,
  };

  for (const watch of watches) {
    try {
      const evaluation = await checkWatch(watch);
      summary.checked += 1;
      if (evaluation.notable) summary.notable += 1;
      if (evaluation.dropped) summary.dropped += 1;
      if (evaluation.target_reached) summary.target_reached += 1;
    } catch {
      // One broken watch must not stop the sweep.
      summary.failed += 1;
    }
  }

  return summary;
}
