"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { addBookingAction, type FormState } from "../actions";

const TYPES = [
  { value: "flight", label: "Flight" },
  { value: "stay", label: "Stay" },
  { value: "transport", label: "Train, car, ferry" },
  { value: "activity", label: "Activity" },
  { value: "other", label: "Other" },
] as const;

export function BookingForm({
  tripId,
  currency,
  defaultDate,
}: {
  tripId: number;
  currency: string;
  defaultDate: string;
}) {
  const [state, action] = useActionState<FormState, FormData>(addBookingAction, {});
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("flight");
  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="trip_id" value={tripId} />
      <ErrorNotice message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="What is it">
          <select
            name="type"
            value={type}
            onChange={(event) => setType(event.target.value as typeof type)}
            className={inputClass}
          >
            {TYPES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Booked with" hint={error("vendor")}>
          <input name="vendor" required placeholder="Norwegian" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`You paid (${currency})`} hint={error("amount")}>
          <input name="amount" required inputMode="decimal" placeholder="624" className={inputClass} />
        </Field>
        <Field
          label={`Agency quote (${currency})`}
          hint={error("agency_quote") ?? "What the same thing cost through an agency, if you checked."}
        >
          <input name="agency_quote" inputMode="decimal" placeholder="790" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Starts" hint={error("start_at")}>
          <input
            name="start_at"
            type="date"
            required
            defaultValue={defaultDate}
            className={inputClass}
          />
        </Field>
        <Field label="Ends" hint={error("end_at")}>
          <input name="end_at" type="date" className={inputClass} />
        </Field>
      </div>

      {type === "stay" && (
        <Field label="Nights" hint="Lets the trip page show a nightly rate.">
          <input name="nights" type="number" min={1} defaultValue={1} className={inputClass} />
        </Field>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Reference" hint={error("reference")}>
          <input name="reference" placeholder="DY1451" className={inputClass} />
        </Field>
        <Field label="Notes" hint={error("description")}>
          <input name="description" placeholder="LYS → BGO return, three seats" className={inputClass} />
        </Field>
      </div>

      <SubmitButton pendingLabel="Saving…">Add to the trip</SubmitButton>
    </form>
  );
}
