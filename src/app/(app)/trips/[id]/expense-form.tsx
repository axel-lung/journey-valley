"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ErrorNotice, Field, inputClass } from "@/components/ui";
import { addExpenseAction, type FormState } from "../actions";

const CATEGORIES = [
  { value: "food", label: "Food and drink" },
  { value: "transport", label: "Getting around" },
  { value: "lodging", label: "Stays" },
  { value: "activities", label: "Things to do" },
  { value: "shopping", label: "Shopping" },
  { value: "other", label: "Other" },
] as const;

export function ExpenseForm({
  tripId,
  currency,
  defaultDate,
  members,
  currentUserId,
}: {
  tripId: number;
  currency: string;
  defaultDate: string;
  members: Array<{ user_id: number; name: string }>;
  currentUserId: number;
}) {
  const [state, action] = useActionState<FormState, FormData>(addExpenseAction, {});
  const error = (field: string) => state.fieldErrors?.[field];

  return (
    <form action={action} className="space-y-4 px-5 py-4">
      <input type="hidden" name="trip_id" value={tripId} />
      <ErrorNotice message={state.error} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <select name="category" defaultValue="food" className={inputClass}>
            {CATEGORIES.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Amount (${currency})`} hint={error("amount")}>
          <input name="amount" required inputMode="decimal" placeholder="42,50" className={inputClass} />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="When" hint={error("spent_on")}>
          <input
            name="spent_on"
            type="date"
            required
            defaultValue={defaultDate}
            className={inputClass}
          />
        </Field>
        <Field label="Who paid">
          <select name="paid_by" defaultValue={String(currentUserId)} className={inputClass}>
            {members.map((member) => (
              <option key={member.user_id} value={member.user_id}>
                {member.user_id === currentUserId ? `${member.name} (you)` : member.name}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="What was it" hint={error("description")}>
        <input name="description" required placeholder="Dinner in Bergen" className={inputClass} />
      </Field>

      <Field label="Receipt" hint="A file name or reference for now.">
        <input name="receipt_name" placeholder="bergen-dinner.jpg" className={inputClass} />
      </Field>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          name="shared"
          defaultChecked
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-200"
        />
        Split this between everyone on the trip
      </label>

      <SubmitButton pendingLabel="Saving…">Log it</SubmitButton>
    </form>
  );
}
