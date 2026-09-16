import type { Currency } from "./money";

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
  created_at: string;
}

export interface Trip {
  id: number;
  owner_id: number;
  title: string;
  summary: string;
  destination_city: string;
  destination_country: string;
  start_date: string;
  end_date: string;
  stage: TripStage;
  currency: Currency;
  budget_cents: number;
  /** What a travel agency or packaged tour quoted for the same trip, if known. */
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
  /** Comparable agency/package price for this line, 0 when not compared. */
  agency_quote_cents: number;
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
  /** 1 when the cost is split across everyone on the trip. */
  shared: number;
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
