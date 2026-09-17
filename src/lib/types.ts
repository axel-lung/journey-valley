import type { Currency } from "./money";
import type { VatZone } from "./vat";

export type { VatZone };

/** What a subscriber gets. Limits live in `plans.ts`. */
export type Plan = "free" | "plus";

export type TripStage =
  | "idea"
  | "planning"
  | "booked"
  | "travelling"
  | "completed"
  | "cancelled";

export type MemberRole = "owner" | "companion";

/**
 * Who is looking. An advisor works for an agency and sees everything — what a
 * booking cost, what it sells for, the margin. A client is a traveller with an
 * account: they see their trip, never a cost and never a margin.
 */
export type UserRole = "advisor" | "client";

export type BookingType = "flight" | "stay" | "activity" | "transport" | "other";

export type ExpenseCategory =
  | "food"
  | "transport"
  | "lodging"
  | "activities"
  | "shopping"
  | "other";

export interface User {
  id: number;
  email: string;
  name: string;
  plan: Plan;
  home_city: string;
  currency: Currency;
  role: UserRole;
  /** The agency an advisor works for; null for a client's own account. */
  agency_id: number | null;
  created_at: string;
}

export interface Agency {
  id: number;
  name: string;
  legal_name: string;
  /** Immatriculation Atout France (IM0…), printed on every quote. */
  registration: string;
  email: string;
  phone: string;
  website: string;
  /** Used for the quote, the travel book and the traveller's app. */
  brand_colour: string;
  /** Taux de marque visé, in percent; what the sell-price assistant aims for. */
  target_margin_percent: number;
  /** Taux de TVA applicable à la marge, en points. */
  vat_rate: number;
  /** 0 for an agency outside the margin scheme (franchise en base). */
  vat_on_margin: number;
  /** Garant financier (APST, banque…), nommé sur le formulaire standardisé. */
  financial_guarantee: string;
  /** Assureur en responsabilité civile professionnelle et n° de contrat. */
  liability_insurance: string;
  /** Médiateur de la consommation dont l'agence relève. */
  mediator: string;
  /** Conditions particulières de vente, reprises sur chaque devis. */
  terms: string;
  currency: Currency;
  created_at: string;
}

/** Someone the agency sells to. They may or may not have a login. */
export interface Client {
  id: number;
  agency_id: number;
  name: string;
  email: string;
  phone: string;
  notes: string;
  /** Their account, once invited; null while the file is advisor-only. */
  user_id: number | null;
  created_at: string;
}

export interface ClientSummary extends Client {
  trips: number;
  /** Sold, across confirmed files. */
  sold_cents: number;
  margin_cents: number;
  last_departure: string | null;
}

export interface Trip {
  id: number;
  owner_id: number;
  /** The client this file is for; null on a file not yet attached to anyone. */
  client_id: number | null;
  title: string;
  summary: string;
  destination_city: string;
  destination_country: string;
  start_date: string;
  end_date: string;
  stage: TripStage;
  currency: Currency;
  budget_cents: number;
  /**
   * The price the file is sold at, as a package.
   *
   * The column is older than the pivot to agencies, where it held what a rival
   * agency quoted; it now holds what *this* agency charges, which is the same
   * number read from the other side of the desk. `margin.ts` speaks the
   * agency's vocabulary over it — see `dossierMargin`.
   */
  agency_quote_cents: number;
  travellers: number;
  created_at: string;
}

export interface TripMember {
  trip_id: number;
  user_id: number;
  role: MemberRole;
  joined_at: string;
  name: string;
  email: string;
}

export interface Booking {
  id: number;
  trip_id: number;
  type: BookingType;
  vendor: string;
  reference: string | null;
  description: string;
  start_at: string;
  end_at: string | null;
  amount_cents: number;
  /** What this line sells for; 0 when no sell price has been set. */
  agency_quote_cents: number;
  /** Where the service is performed — the key to the VAT-on-margin split. */
  zone: VatZone;
  nights: number | null;
  booked_by: number | null;
  created_at: string;
}

export interface Expense {
  id: number;
  trip_id: number;
  paid_by: number;
  category: ExpenseCategory;
  description: string;
  spent_on: string;
  amount_cents: number;
  /** 1 when the cost is split rather than carried by whoever paid. */
  shared: number;
  /**
   * The travellers this expense concerns. `null` means everyone on the trip —
   * the common case, so it stays the default rather than a stored list.
   */
  participant_ids: number[] | null;
  receipt_name: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: number;
  trip_id: number | null;
  actor_id: number | null;
  action: string;
  detail: string | null;
  created_at: string;
  actor_name: string | null;
}

/** A trip joined with the numbers every list view needs. */
export interface TripSummary extends Trip {
  owner_name: string;
  member_count: number;
  booked_cents: number;
  spent_cents: number;
  /** Sum of the agency quotes recorded on individual bookings. */
  agency_total_cents: number;
  /** What you paid for exactly those quoted bookings. */
  quoted_paid_cents: number;
  my_role: MemberRole;
}

export interface ChecklistItem {
  id: number;
  trip_id: number;
  label: string;
  done: number;
  /** Keeps a hand-sorted list stable; ties fall back to id. */
  position: number;
  created_at: string;
}
