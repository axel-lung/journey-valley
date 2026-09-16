import { savingsFromTotals } from "./budget";
import { getDb } from "./db";
import { ACTIVE_STAGES } from "./plans";
import { LOCALE } from "./money";
import { listTrips } from "./trips";
import type { ActivityEntry, ExpenseCategory } from "./types";

export interface SpendPoint {
  /** `YYYY-MM` */
  month: string;
  label: string;
  booked_cents: number;
  spent_cents: number;
}

export interface CategorySpend {
  category: ExpenseCategory;
  total_cents: number;
}

export interface HomeStats {
  trips_total: number;
  trips_active: number;
  trips_completed: number;
  upcoming_count: number;
  nights_away: number;
  committed_cents: number;
  /** Saved against agency quotes, across trips whose booking is finished. */
  saved_cents: number;
  agency_cents: number;
  compared_trips: number;
}

/** Every trip the user is on, whether they created it or were invited. */
const MEMBER_TRIPS = `SELECT trip_id FROM trip_members WHERE user_id = ?`;

export function homeStats(userId: number): HomeStats {
  const db = getDb();
  const today = new Date().toISOString().slice(0, 10);

  const trips = db
    .prepare<[number], { stage: string; count: number }>(
      `SELECT t.stage, COUNT(*) AS count
         FROM trips t WHERE t.id IN (${MEMBER_TRIPS}) GROUP BY t.stage`,
    )
    .all(userId);

  const byStage = new Map(trips.map((row) => [row.stage, row.count]));
  const tripsTotal = trips.reduce((sum, row) => sum + row.count, 0);
  const active = ACTIVE_STAGES.reduce((sum, stage) => sum + (byStage.get(stage) ?? 0), 0);

  const upcoming = db
    .prepare<[number, string], { count: number }>(
      `SELECT COUNT(*) AS count FROM trips
        WHERE id IN (${MEMBER_TRIPS}) AND start_date >= ?
          AND stage IN ('planning','booked')`,
    )
    .get(userId, today)!.count;

  const nights = db
    .prepare<[number], { nights: number }>(
      `SELECT COALESCE(SUM(julianday(end_date) - julianday(start_date)), 0) AS nights
         FROM trips WHERE id IN (${MEMBER_TRIPS}) AND stage = 'completed'`,
    )
    .get(userId)!.nights;

  const committed = db
    .prepare<[number, number], { total: number }>(
      `SELECT COALESCE((SELECT SUM(amount_cents) FROM bookings WHERE trip_id IN (${MEMBER_TRIPS})), 0)
            + COALESCE((SELECT SUM(amount_cents) FROM expenses WHERE trip_id IN (${MEMBER_TRIPS})), 0)
            AS total`,
    )
    .get(userId, userId)!.total;

  // Savings run through the same function the trip pages use, rather than a
  // second copy of the rule in SQL. Trips still being booked are left out: a
  // package quote compared against half the bookings is not a saving yet.
  const comparable = listTrips({ userId })
    .filter((trip) => trip.stage !== "cancelled")
    .map((trip) => savingsFromTotals(trip))
    .filter((savings) => savings.basis !== "none" && !savings.provisional);

  const agencyTotal = comparable.reduce((sum, savings) => sum + savings.agency_cents, 0);
  const savedTotal = comparable.reduce((sum, savings) => sum + savings.saved_cents, 0);

  return {
    trips_total: tripsTotal,
    trips_active: active,
    trips_completed: byStage.get("completed") ?? 0,
    upcoming_count: upcoming,
    nights_away: Math.round(nights),
    committed_cents: committed,
    agency_cents: agencyTotal,
    saved_cents: savedTotal,
    compared_trips: comparable.length,
  };
}

/** Booked vs. on-trip spending per month, for the last `months` months. */
export function monthlySpend(userId: number, months = 6): SpendPoint[] {
  const db = getDb();

  const booked = db
    .prepare<[number], { month: string; total: number }>(
      `SELECT strftime('%Y-%m', start_at) AS month, SUM(amount_cents) AS total
         FROM bookings WHERE trip_id IN (${MEMBER_TRIPS}) GROUP BY month`,
    )
    .all(userId);

  const spent = db
    .prepare<[number], { month: string; total: number }>(
      `SELECT strftime('%Y-%m', spent_on) AS month, SUM(amount_cents) AS total
         FROM expenses WHERE trip_id IN (${MEMBER_TRIPS}) GROUP BY month`,
    )
    .all(userId);

  const bookedByMonth = new Map(booked.map((row) => [row.month, row.total]));
  const spentByMonth = new Map(spent.map((row) => [row.month, row.total]));

  const points: SpendPoint[] = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() - (months - 1));

  for (let index = 0; index < months; index += 1) {
    const month = cursor.toISOString().slice(0, 7);
    points.push({
      month,
      label: cursor.toLocaleString(LOCALE, { month: "short", timeZone: "UTC" }),
      booked_cents: bookedByMonth.get(month) ?? 0,
      spent_cents: spentByMonth.get(month) ?? 0,
    });
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }

  return points;
}

export function spendByCategory(userId: number): CategorySpend[] {
  return getDb()
    .prepare<[number], CategorySpend>(
      `SELECT category, SUM(amount_cents) AS total_cents
         FROM expenses WHERE trip_id IN (${MEMBER_TRIPS})
        GROUP BY category ORDER BY total_cents DESC`,
    )
    .all(userId);
}

export function recentActivity(userId: number, limit = 10): ActivityEntry[] {
  return getDb()
    .prepare<[number, number], ActivityEntry>(
      `SELECT a.id, a.trip_id, a.actor_id, a.action, a.detail, a.created_at, u.name AS actor_name
         FROM activity_log a
         LEFT JOIN users u ON u.id = a.actor_id
        WHERE a.trip_id IN (${MEMBER_TRIPS})
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ?`,
    )
    .all(userId, limit);
}
