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
  if (!role) return { allowed: false, reason: "You are not on this trip." };

  const rule = RULES[action];
  if (!rule) return { allowed: false, reason: `Unknown action "${action}".` };

  if (!rule.from.includes(trip.stage)) {
    return { allowed: false, reason: `That does not apply to a trip that is ${STAGE_LABEL[trip.stage].toLowerCase()}.` };
  }
  if (!rule.roles.includes(role)) {
    return { allowed: false, reason: "Only the person who created the trip can do that." };
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
  idea: "Idea",
  planning: "Planning",
  booked: "Booked",
  travelling: "On the road",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const STAGE_TONE: Record<TripStage, string> = {
  idea: "bg-slate-100 text-slate-700 ring-slate-200",
  planning: "bg-amber-50 text-amber-700 ring-amber-200",
  booked: "bg-brand-50 text-brand-700 ring-brand-200",
  travelling: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  completed: "bg-sky-50 text-sky-700 ring-sky-200",
  cancelled: "bg-slate-100 text-slate-500 ring-slate-200",
};

export const STAGE_ACTION_LABEL: Record<StageAction, string> = {
  start_planning: "Start planning",
  mark_booked: "Everything is booked",
  start_trip: "We're off",
  complete: "Trip finished",
  cancel: "Cancel trip",
  reopen: "Plan it again",
};
