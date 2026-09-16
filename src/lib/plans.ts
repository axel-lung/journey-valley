import type { Plan } from "./types";

export interface PlanDefinition {
  id: Plan;
  name: string;
  /** Monthly price in cents; 0 for the free tier. */
  price_cents: number;
  tagline: string;
  /** `null` means unlimited. */
  max_active_trips: number | null;
  max_companions_per_trip: number | null;
  features: string[];
}

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    price_cents: 0,
    tagline: "Plan your next trip and see what you saved.",
    max_active_trips: 2,
    max_companions_per_trip: 1,
    features: [
      "2 active trips",
      "1 travel companion per trip",
      "Budget tracking and shared costs",
      "Savings against an agency quote",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    price_cents: 500,
    tagline: "For people who travel more than twice a year.",
    max_active_trips: null,
    max_companions_per_trip: null,
    features: [
      "Unlimited trips and companions",
      "Everything in Free",
      "Full trip history and savings report",
      "Export a trip as a printable itinerary",
    ],
  },
};

/** Stages that count against the active-trip allowance. */
export const ACTIVE_STAGES = ["idea", "planning", "booked", "travelling"] as const;

export interface LimitCheck {
  allowed: boolean;
  reason?: string;
}

export function canCreateTrip(plan: Plan, activeTrips: number): LimitCheck {
  const limit = PLANS[plan].max_active_trips;
  if (limit === null || activeTrips < limit) return { allowed: true };
  return {
    allowed: false,
    reason: `The ${PLANS[plan].name} plan keeps ${limit} trips active at a time. Complete or archive one, or move to Plus.`,
  };
}

export function canAddCompanion(plan: Plan, currentCompanions: number): LimitCheck {
  const limit = PLANS[plan].max_companions_per_trip;
  if (limit === null || currentCompanions < limit) return { allowed: true };
  return {
    allowed: false,
    reason: `The ${PLANS[plan].name} plan allows ${limit} companion${limit === 1 ? "" : "s"} per trip. Move to Plus to travel with more people.`,
  };
}
