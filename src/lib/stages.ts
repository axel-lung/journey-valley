import type { MemberRole, Trip, TripStage } from "./types";

export type StageAction =
  | "start_planning"
  | "mark_booked"
  | "start_trip"
  | "complete"
  | "cancel"
  | "reopen";

interface StageRule {
  from: TripStage[];
  to: TripStage;
  /** Which trip roles may trigger it. Companions can add things, not move stages. */
  roles: MemberRole[];
}

const RULES: Record<StageAction, StageRule> = {
  start_planning: { from: ["idea"], to: "planning", roles: ["owner"] },
  mark_booked: { from: ["planning"], to: "booked", roles: ["owner", "companion"] },
  start_trip: { from: ["booked"], to: "travelling", roles: ["owner", "companion"] },
  complete: { from: ["travelling", "booked"], to: "completed", roles: ["owner"] },
  cancel: { from: ["idea", "planning", "booked"], to: "cancelled", roles: ["owner"] },
  reopen: { from: ["cancelled", "completed"], to: "planning", roles: ["owner"] },
};

export interface StageCheck {
  allowed: boolean;
  reason?: string;
  nextStage?: TripStage;
}

/**
 * One place decides whether a stage change is legal, so a hidden button and a
 * rejected form submission can never disagree.
 */
export function checkStageChange(
  trip: Pick<Trip, "stage">,
  action: StageAction,
  role: MemberRole | null,
): StageCheck {
  if (!role) return { allowed: false, reason: "Vous ne faites pas partie de ce voyage." };

  const rule = RULES[action];
  if (!rule) return { allowed: false, reason: `Action inconnue : « ${action} ».` };

  if (!rule.from.includes(trip.stage)) {
    return {
      allowed: false,
      reason: `Impossible sur un voyage au statut « ${STAGE_LABEL[trip.stage].toLowerCase()} ».`,
    };
  }
  if (!rule.roles.includes(role)) {
    return { allowed: false, reason: "Seule la personne qui a créé le voyage peut faire ça." };
  }

  return { allowed: true, nextStage: rule.to };
}

export function availableStageActions(
  trip: Pick<Trip, "stage">,
  role: MemberRole | null,
): StageAction[] {
  return (Object.keys(RULES) as StageAction[]).filter(
    (action) => checkStageChange(trip, action, role).allowed,
  );
}

export const STAGE_LABEL: Record<TripStage, string> = {
  idea: "Idée",
  planning: "En préparation",
  booked: "Réservé",
  travelling: "En voyage",
  completed: "Terminé",
  cancelled: "Annulé",
};

export const STAGE_TONE: Record<TripStage, string> = {
  idea: "bg-stone-100 text-stone-600 ring-stone-200",
  planning: "bg-amber-50 text-amber-700 ring-amber-200",
  booked: "bg-brand-50 text-brand-700 ring-brand-200",
  travelling: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  completed: "bg-stone-100 text-stone-600 ring-stone-200",
  cancelled: "bg-stone-100 text-stone-400 ring-stone-200",
};

export const STAGE_ACTION_LABEL: Record<StageAction, string> = {
  start_planning: "Passer en préparation",
  mark_booked: "Tout est réservé",
  start_trip: "C'est parti !",
  complete: "Voyage terminé",
  cancel: "Annuler le voyage",
  reopen: "Le reprendre",
};
