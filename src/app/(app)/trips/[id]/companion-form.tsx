"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, inputClass } from "@/components/ui";
import { addCompanionAction, type FormState } from "../actions";

export function CompanionForm({ tripId }: { tripId: number }) {
  const [state, action] = useActionState<FormState, FormData>(addCompanionAction, {});

  return (
    <form action={action} className="space-y-3 border-t border-slate-100 px-5 py-4">
      <input type="hidden" name="trip_id" value={tripId} />
      <ErrorNotice message={state.error ?? state.fieldErrors?.email} />

      <div className="flex flex-wrap gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="their@email.com"
          className={`${inputClass} sm:w-64`}
        />
        <SubmitButton pendingLabel="Adding…">Add companion</SubmitButton>
      </div>
      <p className="text-xs text-slate-500">
        They see the trip, can add bookings and expenses, and are included when costs are split.
      </p>
    </form>
  );
}
