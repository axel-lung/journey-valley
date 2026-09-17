import { getDb } from "./db";
import { ACTIVE_STAGES } from "./plans";
import type { PriceWatch } from "./watch";
import type {
  Booking,
  ChecklistItem,
  Expense,
  MemberRole,
  Trip,
  TripMember,
  TripStage,
  TripSummary,
  User,
} from "./types";

/**
 * Every trip query is scoped by membership: a trip is visible to the person who
 * created it and to the companions they added, and to nobody else.
 */
const SUMMARY_SELECT = `
  SELECT t.*,
         o.name AS owner_name,
         m.role AS my_role,
         (SELECT COUNT(*) FROM trip_members mm WHERE mm.trip_id = t.id) AS member_count,
         COALESCE((SELECT SUM(amount_cents) FROM bookings b WHERE b.trip_id = t.id), 0) AS booked_cents,
         COALESCE((SELECT SUM(agency_quote_cents) FROM bookings b WHERE b.trip_id = t.id), 0) AS agency_total_cents,
         COALESCE((SELECT SUM(CASE WHEN agency_quote_cents > 0 THEN amount_cents ELSE 0 END)
                     FROM bookings b WHERE b.trip_id = t.id), 0) AS quoted_paid_cents,
         COALESCE((SELECT SUM(amount_cents) FROM expenses e WHERE e.trip_id = t.id), 0) AS spent_cents
    FROM trips t
    JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ?
    JOIN users o ON o.id = t.owner_id
`;

export interface TripFilter {
  userId: number;
  stages?: TripStage[];
  search?: string;
  limit?: number;
}

export function listTrips(filter: TripFilter): TripSummary[] {
  const where: string[] = [];
  const params: Array<string | number> = [filter.userId];

  if (filter.stages?.length) {
    where.push(`t.stage IN (${filter.stages.map(() => "?").join(", ")})`);
    params.push(...filter.stages);
  }
  if (filter.search) {
    where.push("(t.title LIKE ? OR t.destination_city LIKE ? OR t.destination_country LIKE ?)");
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }

  const limit = filter.limit ?? 200;
  return getDb()
    .prepare<typeof params, TripSummary>(
      `${SUMMARY_SELECT}
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY t.start_date DESC
       LIMIT ${limit}`,
    )
    .all(...params);
}

export function getTripSummary(userId: number, tripId: number): TripSummary | null {
  return (
    getDb()
      .prepare<[number, number], TripSummary>(`${SUMMARY_SELECT} WHERE t.id = ?`)
      .get(userId, tripId) ?? null
  );
}

/** The caller's role on a trip, or null when they are not on it. */
export function membershipRole(userId: number, tripId: number): MemberRole | null {
  const row = getDb()
    .prepare<[number, number], { role: MemberRole }>(
      `SELECT role FROM trip_members WHERE user_id = ? AND trip_id = ?`,
    )
    .get(userId, tripId);
  return row?.role ?? null;
}

export function getTrip(tripId: number): Trip | null {
  return (
    getDb().prepare<[number], Trip>(`SELECT * FROM trips WHERE id = ?`).get(tripId) ?? null
  );
}

export function listMembers(tripId: number): TripMember[] {
  return getDb()
    .prepare<[number], TripMember>(
      `SELECT m.trip_id, m.user_id, m.role, m.joined_at, u.name, u.email
         FROM trip_members m JOIN users u ON u.id = m.user_id
        WHERE m.trip_id = ?
        ORDER BY CASE m.role WHEN 'owner' THEN 0 ELSE 1 END, u.name`,
    )
    .all(tripId);
}

export function listBookings(tripId: number): Booking[] {
  return getDb()
    .prepare<[number], Booking>(`SELECT * FROM bookings WHERE trip_id = ? ORDER BY start_at, id`)
    .all(tripId);
}

export function listExpenses(tripId: number): Expense[] {
  const rows = getDb()
    .prepare<[number], Omit<Expense, "participant_ids"> & { participant_ids: string | null }>(
      `SELECT * FROM expenses WHERE trip_id = ? ORDER BY spent_on DESC, id DESC`,
    )
    .all(tripId);

  return rows.map((row) => ({ ...row, participant_ids: parseParticipants(row.participant_ids) }));
}

/** SQLite has no array type, so the participants ride as a JSON list. */
function parseParticipants(raw: string | null): number[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    const ids = parsed.filter((value): value is number => Number.isInteger(value));
    return ids.length > 0 ? ids : null;
  } catch {
    return null;
  }
}

export function serialiseParticipants(ids: number[] | null): string | null {
  return ids && ids.length > 0 ? JSON.stringify(ids) : null;
}

export function listChecklist(tripId: number): ChecklistItem[] {
  return getDb()
    .prepare<[number], ChecklistItem>(
      `SELECT * FROM checklist_items WHERE trip_id = ? ORDER BY done, position, id`,
    )
    .all(tripId);
}

export function listWatches(tripId: number): PriceWatch[] {
  return getDb()
    .prepare<[number], PriceWatch>(
      `SELECT * FROM price_watches WHERE trip_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .all(tripId);
}

export interface PricePoint {
  price_cents: number;
  vendor: string | null;
  checked_at: string;
}

export function listPricePoints(watchId: number, limit = 12): PricePoint[] {
  return getDb()
    .prepare<[number, number], PricePoint>(
      `SELECT price_cents, vendor, checked_at FROM price_points
        WHERE watch_id = ? ORDER BY checked_at DESC, id DESC LIMIT ?`,
    )
    .all(watchId, limit);
}

/** Only trips you created count against your plan's allowance. */
export function countActiveTrips(userId: number): number {
  return getDb()
    .prepare<[number, ...string[]], { count: number }>(
      `SELECT COUNT(*) AS count FROM trips
        WHERE owner_id = ? AND stage IN (${ACTIVE_STAGES.map(() => "?").join(", ")})`,
    )
    .get(userId, ...ACTIVE_STAGES)!.count;
}

export function findUserByEmail(email: string): User | null {
  return (
    getDb()
      .prepare<[string], User>(
        `SELECT id, email, name, plan, home_city, currency, role, agency_id, created_at
           FROM users WHERE email = ? COLLATE NOCASE`,
      )
      .get(email.trim().toLowerCase()) ?? null
  );
}
