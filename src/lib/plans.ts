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
    name: "Découverte",
    price_cents: 0,
    tagline: "Pour préparer votre prochain voyage et voir ce qu'il vous fait économiser.",
    max_active_trips: 2,
    max_companions_per_trip: 1,
    features: [
      "2 voyages en cours",
      "1 compagnon par voyage",
      "Budget, dépenses et partage des frais",
      "Comparaison avec un devis d'agence",
    ],
  },
  plus: {
    id: "plus",
    name: "Plus",
    price_cents: 500,
    tagline: "Pour celles et ceux qui partent plus de deux fois par an.",
    max_active_trips: null,
    max_companions_per_trip: null,
    features: [
      "Voyages et compagnons illimités",
      "Tout ce que contient Découverte",
      "Historique complet et bilan d'économies",
      "Checklists de préparation illimitées",
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
    reason: `Le forfait ${PLANS[plan].name} permet ${limit} voyages en cours à la fois. Terminez-en un, ou passez à Plus.`,
  };
}

export function canAddCompanion(plan: Plan, currentCompanions: number): LimitCheck {
  const limit = PLANS[plan].max_companions_per_trip;
  if (limit === null || currentCompanions < limit) return { allowed: true };
  return {
    allowed: false,
    reason: `Le forfait ${PLANS[plan].name} autorise ${limit} compagnon${limit === 1 ? "" : "s"} par voyage. Passez à Plus pour partir à plusieurs.`,
  };
}
