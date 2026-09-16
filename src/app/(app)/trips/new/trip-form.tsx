"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { createTripAction, type FormState } from "../actions";

export function TripForm({ currency }: { currency: string }) {
  const [state, action] = useActionState<FormState, FormData>(createTripAction, {});
  const error = (field: string) => state.fieldErrors?.[field];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <form action={action} className="space-y-5">
      <ErrorNotice message={state.error} />

      <Field label="What are you calling it?" hint={error("title")}>
        <input name="title" required placeholder="Norway fjords road trip" className={inputClass} />
      </Field>

      <Field label="The idea" hint={error("summary") ?? "A line to remind you why this trip exists."}>
        <textarea
          name="summary"
          rows={2}
          placeholder="Bergen to Ålesund by hire car, five stops, no tour bus."
          className={inputClass}
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="City" hint={error("destination_city")}>
          <input name="destination_city" required placeholder="Bergen" className={inputClass} />
        </Field>
        <Field label="Country" hint={error("destination_country")}>
          <input name="destination_country" required placeholder="Norway" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <Field label="Leaving" hint={error("start_date")}>
          <input name="start_date" type="date" required defaultValue={today} className={inputClass} />
        </Field>
        <Field label="Back" hint={error("end_date")}>
          <input name="end_date" type="date" required defaultValue={today} className={inputClass} />
        </Field>
        <Field label="Travellers" hint={error("travellers")}>
          <input
            name="travellers"
            type="number"
            min={1}
            max={20}
            defaultValue={1}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field
          label={`Budget (${currency})`}
          hint={error("budget") ?? "Optional. What you would rather not go past."}
        >
          <input name="budget" inputMode="decimal" placeholder="2 100" className={inputClass} />
        </Field>

        <Field
          label={`Agency quote (${currency})`}
          hint={
            error("agency_quote") ??
            "Optional, and the point of all this: what a packaged version of this trip was quoted at."
          }
        >
          <input name="agency_quote" inputMode="decimal" placeholder="2 890" className={inputClass} />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <SubmitButton pendingLabel="Creating…">Create the trip</SubmitButton>
        <p className="text-xs text-slate-500">
          It starts as an idea — add bookings, companions and dates as they firm up.
        </p>
      </div>
    </form>
  );
}
