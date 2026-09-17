import { randomUUID } from "node:crypto";
import { agencyTotals, getAgency, isAdvisor, listAgencyFiles } from "./agency";
import { authenticate } from "./auth";
import { budgetStatus } from "./budget";
import { getDb } from "./db";
import { countdown } from "./format";
import { buildItinerary } from "./itinerary";
import { dossierMargin } from "./margin";
import { listQuotes, QUOTE_STATUS_LABEL } from "./quotes";
import { STAGE_LABEL } from "./stages";
import { getTrip, getTripSummary, listBookings, listChecklist, listMembers } from "./trips";
import { costsByZone, vatOnMargin } from "./vat";
import type { User } from "./types";

/**
 * Ce que l'application mobile reçoit.
 *
 * Une règle domine : **la charge utile dépend du rôle**. Un conseiller reçoit
 * les coûts et les marges ; un client reçoit son programme et son prix, et les
 * montants d'achat ne sont pas seulement masqués — ils ne sont pas lus. Le
 * découpage vit ici, dans un seul fichier, pour qu'il n'y ait qu'un endroit à
 * relire avant de se demander « qu'est-ce qui sort de l'application ? ».
 *
 * L'authentification réutilise la table des sessions du site : le jeton du
 * téléphone est un identifiant de session, avec la même durée de vie et la même
 * révocation. Pas de second mécanisme à sécuriser.
 */

const TOKEN_TTL_DAYS = 90;

export interface MobileSession {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: "advisor" | "client";
    agency: { name: string; brand_colour: string } | null;
  };
}

export function signIn(email: string, password: string): MobileSession | null {
  const user = authenticate(email, password);
  if (!user) return null;

  const token = randomUUID();
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 86_400_000);
  getDb()
    .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
    .run(token, user.id, expires.toISOString());

  return { token, user: describeUser(user) };
}

export function signOut(token: string): void {
  getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(token);
}

/** Le porteur du jeton, ou null : expiré, révoqué, ou jamais valide. */
export function userForToken(token: string): User | null {
  const row = getDb()
    .prepare<[string], User & { expires_at: string }>(
      `SELECT u.id, u.email, u.name, u.plan, u.home_city, u.currency, u.role, u.agency_id,
              u.created_at, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(token);

  if (!row) return null;
  if (Date.parse(row.expires_at) < Date.now()) {
    getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(token);
    return null;
  }

  const { expires_at: _expires, ...user } = row;
  return user;
}

export function describeUser(user: User): MobileSession["user"] {
  const agency = getAgency(user.agency_id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: isAdvisor(user) ? "advisor" : "client",
    agency: agency ? { name: agency.name, brand_colour: agency.brand_colour } : null,
  };
}

/* ------------------------------------------------------------- le portefeuille */

export interface MobileFileSummary {
  id: number;
  title: string;
  city: string;
  country: string;
  start_date: string;
  end_date: string;
  stage: string;
  stage_label: string;
  countdown: string;
  upcoming: boolean;
  client_name: string | null;
  /** Conseiller seulement. */
  sell_cents?: number;
  cost_cents?: number;
  margin_net_cents?: number;
  margin_percent?: number;
  margin_firm?: boolean;
  /** Client seulement : ce qu'il paie. */
  price_cents?: number;
}

export interface MobileHome {
  user: MobileSession["user"];
  files: MobileFileSummary[];
  /** Conseiller seulement : le chiffre du portefeuille. */
  totals?: {
    files: number;
    sell_cents: number;
    margin_net_cents: number;
    margin_percent: number;
    vat_cents: number;
  };
}

export function home(user: User): MobileHome {
  if (isAdvisor(user)) {
    const files = user.agency_id ? listAgencyFiles(user.agency_id) : [];
    const totals = agencyTotals(files);
    const db = getDb();
    const clientName = db.prepare<[number], { name: string }>(
      `SELECT name FROM clients WHERE id = ?`,
    );

    return {
      user: describeUser(user),
      totals: {
        files: totals.files,
        sell_cents: totals.sell_cents,
        margin_net_cents: totals.margin_net_cents,
        margin_percent: totals.margin_percent,
        vat_cents: totals.vat_cents,
      },
      files: files.map(({ trip, margin, vat }) => ({
        ...common(trip),
        client_name: trip.client_id ? (clientName.get(trip.client_id)?.name ?? null) : null,
        sell_cents: margin.sell_cents,
        cost_cents: margin.cost_cents,
        margin_net_cents: vat.margin_net_cents,
        margin_percent: margin.margin_percent,
        margin_firm: !margin.partial,
      })),
    };
  }

  // Côté client, on ne passe jamais par les dossiers de l'agence : seulement
  // par ceux dont il est membre, et sans un seul montant d'achat.
  const trips = getDb()
    .prepare<[number], { id: number }>(
      `SELECT t.id FROM trips t
         JOIN trip_members m ON m.trip_id = t.id AND m.user_id = ?
        ORDER BY t.start_date DESC`,
    )
    .all(user.id)
    .map((row) => getTrip(row.id))
    .filter((trip): trip is NonNullable<typeof trip> => trip !== null);

  return {
    user: describeUser(user),
    files: trips.map((trip) => ({
      ...common(trip),
      client_name: null,
      price_cents: clientPrice(trip.id, trip.agency_quote_cents),
    })),
  };
}

function common(trip: {
  id: number;
  title: string;
  destination_city: string;
  destination_country: string;
  start_date: string;
  end_date: string;
  stage: keyof typeof STAGE_LABEL;
}): Omit<MobileFileSummary, "client_name"> {
  const when = countdown(trip.start_date, trip.end_date);
  return {
    id: trip.id,
    title: trip.title,
    city: trip.destination_city,
    country: trip.destination_country,
    start_date: trip.start_date,
    end_date: trip.end_date,
    stage: trip.stage,
    stage_label: STAGE_LABEL[trip.stage],
    countdown: when.label,
    upcoming: when.upcoming,
  };
}

/** Le prix que paie le client : le forfait, sinon la somme des lignes vendues. */
function clientPrice(tripId: number, packageCents: number): number {
  if (packageCents > 0) return packageCents;
  const row = getDb()
    .prepare<[number], { total: number }>(
      `SELECT COALESCE(SUM(agency_quote_cents), 0) AS total FROM bookings WHERE trip_id = ?`,
    )
    .get(tripId);
  return row?.total ?? 0;
}

/* ------------------------------------------------------------------ un dossier */

export interface MobileDay {
  date: string;
  day_number: number;
  entries: Array<{ label: string; detail: string; kind: "start" | "return" | "ongoing" }>;
}

export interface MobileFileDetail extends MobileFileSummary {
  summary: string;
  travellers: string[];
  days: MobileDay[];
  bookings: Array<{
    id: number;
    label: string;
    detail: string;
    date: string;
    reference: string | null;
    /** Conseiller seulement. */
    cost_cents?: number;
    sell_cents?: number;
    zone?: string;
  }>;
  checklist: Array<{ id: number; label: string; done: boolean }>;
  quotes?: Array<{
    reference: string;
    status: string;
    status_label: string;
    total_cents: number;
    token: string;
  }>;
  budget?: { committed_cents: number; budget_cents: number; percent_used: number };
}

export function file(user: User, tripId: number): MobileFileDetail | null {
  const trip = getTripSummary(user.id, tripId);
  if (!trip) return null;

  const advisor = isAdvisor(user);
  const bookings = listBookings(trip.id);
  const members = listMembers(trip.id);
  const itinerary = buildItinerary(trip, bookings, []);

  const days: MobileDay[] = itinerary.days.map((day) => ({
    date: day.date,
    day_number: day.day_number,
    entries: [
      ...day.starts.map((booking) => ({
        label: booking.vendor,
        detail: booking.description,
        kind: "start" as const,
      })),
      ...day.returns.map((booking) => ({
        label: booking.vendor,
        detail: "retour",
        kind: "return" as const,
      })),
      ...day.ongoing.map((booking) => ({
        label: booking.vendor,
        detail: "en cours",
        kind: "ongoing" as const,
      })),
    ],
  }));

  const base: MobileFileDetail = {
    ...common(trip),
    client_name: null,
    summary: trip.summary,
    travellers: members.map((member) => member.name),
    days,
    bookings: bookings.map((booking) => ({
      id: booking.id,
      label: booking.vendor,
      detail: booking.description,
      date: booking.start_at.slice(0, 10),
      reference: booking.reference,
    })),
    checklist: listChecklist(trip.id).map((item) => ({
      id: item.id,
      label: item.label,
      done: item.done === 1,
    })),
  };

  if (!advisor) return { ...base, price_cents: clientPrice(trip.id, trip.agency_quote_cents) };

  const margin = dossierMargin(trip, bookings);
  const agency = getAgency(user.agency_id);
  const vat = vatOnMargin({
    marginGrossCents: margin.margin_cents,
    costs: costsByZone(bookings),
    ratePercent: agency?.vat_rate,
    subjectToVat: agency ? agency.vat_on_margin === 1 : true,
  });
  const budget = budgetStatus(trip, bookings, []);

  return {
    ...base,
    sell_cents: margin.sell_cents,
    cost_cents: margin.cost_cents,
    margin_net_cents: vat.margin_net_cents,
    margin_percent: margin.margin_percent,
    margin_firm: !margin.partial,
    bookings: bookings.map((booking) => ({
      id: booking.id,
      label: booking.vendor,
      detail: booking.description,
      date: booking.start_at.slice(0, 10),
      reference: booking.reference,
      cost_cents: booking.amount_cents,
      sell_cents: booking.agency_quote_cents,
      zone: booking.zone,
    })),
    quotes: listQuotes(trip.id).map((quote) => ({
      reference: quote.reference,
      status: quote.status,
      status_label: QUOTE_STATUS_LABEL[quote.status],
      total_cents: quote.total_cents,
      token: quote.token,
    })),
    budget: {
      committed_cents: budget.committed_cents,
      budget_cents: trip.budget_cents,
      percent_used: budget.percent_used,
    },
  };
}
