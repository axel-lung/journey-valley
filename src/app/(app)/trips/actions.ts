"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, recordActivity } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";
import { canAddCompanion, canCreateTrip } from "@/lib/plans";
import { checkStageChange, type StageAction } from "@/lib/stages";
import {
  countActiveTrips,
  findUserByEmail,
  getTrip,
  listMembers,
  membershipRole,
} from "@/lib/trips";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.");

const tripSchema = z
  .object({
    title: z.string().trim().min(3, "Give the trip a name you'll recognise."),
    summary: z.string().trim().max(500).default(""),
    destination_city: z.string().trim().min(1, "Where are you going?"),
    destination_country: z.string().trim().min(1, "Which country?"),
    start_date: isoDate,
    end_date: isoDate,
    budget: z.string().trim().default(""),
    agency_quote: z.string().trim().default(""),
    travellers: z.coerce.number().int().min(1).max(20).default(1),
  })
  .refine((value) => value.end_date >= value.start_date, {
    message: "The return date cannot be before you leave.",
    path: ["end_date"],
  });

/** Blank means "not set", which the budget and savings maths treat as zero. */
function optionalAmount(input: string): number | null {
  if (input.trim() === "") return 0;
  return parseAmountToCents(input);
}

export async function createTripAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const limit = canCreateTrip(user.plan, countActiveTrips(user.id));
  if (!limit.allowed) return { error: limit.reason };

  const parsed = tripSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const budget = optionalAmount(parsed.data.budget);
  if (budget === null) return { fieldErrors: { budget: "Enter an amount such as 1 200 or 1200.50." } };

  const quote = optionalAmount(parsed.data.agency_quote);
  if (quote === null) {
    return { fieldErrors: { agency_quote: "Enter an amount such as 2 400, or leave it blank." } };
  }

  const db = getDb();
  const tripId = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO trips (owner_id, title, summary, destination_city, destination_country,
                            start_date, end_date, stage, currency, budget_cents,
                            agency_quote_cents, travellers)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'idea', ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        parsed.data.title,
        parsed.data.summary,
        parsed.data.destination_city,
        parsed.data.destination_country,
        parsed.data.start_date,
        parsed.data.end_date,
        user.currency,
        budget,
        quote,
        parsed.data.travellers,
      );

    const id = Number(result.lastInsertRowid);
    db.prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')`).run(
      id,
      user.id,
    );
    return id;
  })();

  recordActivity({
    tripId,
    actorId: user.id,
    action: "trip.created",
    detail: parsed.data.title,
  });

  revalidatePath("/trips");
  revalidatePath("/dashboard");
  redirect(`/trips/${tripId}`);
}

export async function changeStageAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tripId = Number(formData.get("trip_id"));
  const action = String(formData.get("action")) as StageAction;

  const trip = getTrip(tripId);
  const role = membershipRole(user.id, tripId);
  if (!trip || !role) redirect("/trips");

  const check = checkStageChange(trip, action, role);
  if (!check.allowed || !check.nextStage) {
    redirect(`/trips/${tripId}?error=${encodeURIComponent(check.reason ?? "Not allowed.")}`);
  }

  getDb().prepare(`UPDATE trips SET stage = ? WHERE id = ?`).run(check.nextStage, tripId);
  recordActivity({
    tripId,
    actorId: user.id,
    action: `trip.${check.nextStage}`,
    detail: trip.title,
  });

  revalidatePath(`/trips/${tripId}`);
  revalidatePath("/trips");
  revalidatePath("/dashboard");
}

const bookingSchema = z.object({
  trip_id: z.coerce.number().int().positive(),
  type: z.enum(["flight", "stay", "activity", "transport", "other"]),
  vendor: z.string().trim().min(1, "Who are you booking with?"),
  reference: z.string().trim().max(60).optional(),
  description: z.string().trim().max(300).default(""),
  start_at: isoDate,
  end_at: z.string().optional(),
  amount: z.string().trim().min(1, "What did it cost?"),
  agency_quote: z.string().trim().default(""),
  nights: z.string().optional(),
});

export async function addBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const trip = getTrip(parsed.data.trip_id);
  const role = membershipRole(user.id, parsed.data.trip_id);
  if (!trip || !role) return { error: "That trip is not yours." };
  if (trip.stage === "cancelled") return { error: "This trip is cancelled." };

  const amount = parseAmountToCents(parsed.data.amount);
  if (amount === null) return { fieldErrors: { amount: "Enter an amount such as 246 or 245,90." } };

  const quote = optionalAmount(parsed.data.agency_quote);
  if (quote === null) {
    return { fieldErrors: { agency_quote: "Enter an amount, or leave it blank." } };
  }

  const nights =
    parsed.data.type === "stay" && parsed.data.nights ? Number(parsed.data.nights) || null : null;

  getDb()
    .prepare(
      `INSERT INTO bookings (trip_id, type, vendor, reference, description, start_at, end_at,
                             amount_cents, agency_quote_cents, nights, booked_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      trip.id,
      parsed.data.type,
      parsed.data.vendor,
      parsed.data.reference || null,
      parsed.data.description,
      parsed.data.start_at,
      parsed.data.end_at || null,
      amount,
      quote,
      nights,
      user.id,
    );

  recordActivity({
    tripId: trip.id,
    actorId: user.id,
    action: "booking.added",
    detail: `${parsed.data.vendor} (${parsed.data.type})`,
  });

  revalidatePath(`/trips/${trip.id}`);
  revalidatePath("/savings");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteBookingAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const bookingId = Number(formData.get("booking_id"));

  const db = getDb();
  const row = db
    .prepare<[number], { trip_id: number; vendor: string }>(
      `SELECT trip_id, vendor FROM bookings WHERE id = ?`,
    )
    .get(bookingId);
  if (!row) redirect("/trips");
  if (!membershipRole(user.id, row.trip_id)) redirect("/trips");

  db.prepare(`DELETE FROM bookings WHERE id = ?`).run(bookingId);
  recordActivity({
    tripId: row.trip_id,
    actorId: user.id,
    action: "booking.removed",
    detail: row.vendor,
  });

  revalidatePath(`/trips/${row.trip_id}`);
  revalidatePath("/savings");
  revalidatePath("/dashboard");
}

const expenseSchema = z.object({
  trip_id: z.coerce.number().int().positive(),
  category: z.enum(["food", "transport", "lodging", "activities", "shopping", "other"]),
  description: z.string().trim().min(1, "What was it for?"),
  spent_on: isoDate,
  amount: z.string().trim().min(1, "How much was it?"),
  shared: z.string().optional(),
  paid_by: z.coerce.number().int().positive().optional(),
  receipt_name: z.string().trim().max(120).optional(),
});

export async function addExpenseAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const trip = getTrip(parsed.data.trip_id);
  if (!trip || !membershipRole(user.id, parsed.data.trip_id)) {
    return { error: "That trip is not yours." };
  }

  const amount = parseAmountToCents(parsed.data.amount);
  if (amount === null) return { fieldErrors: { amount: "Enter an amount such as 24 or 23,80." } };

  // You may record that a companion paid, but only for someone on the trip.
  const members = listMembers(trip.id);
  const paidBy =
    parsed.data.paid_by && members.some((member) => member.user_id === parsed.data.paid_by)
      ? parsed.data.paid_by
      : user.id;

  getDb()
    .prepare(
      `INSERT INTO expenses (trip_id, paid_by, category, description, spent_on, amount_cents,
                             shared, receipt_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      trip.id,
      paidBy,
      parsed.data.category,
      parsed.data.description,
      parsed.data.spent_on,
      amount,
      parsed.data.shared === "on" ? 1 : 0,
      parsed.data.receipt_name || null,
    );

  recordActivity({
    tripId: trip.id,
    actorId: user.id,
    action: "expense.added",
    detail: parsed.data.description,
  });

  revalidatePath(`/trips/${trip.id}`);
  revalidatePath("/spending");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function deleteExpenseAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const expenseId = Number(formData.get("expense_id"));

  const db = getDb();
  const row = db
    .prepare<[number], { trip_id: number; description: string }>(
      `SELECT trip_id, description FROM expenses WHERE id = ?`,
    )
    .get(expenseId);
  if (!row || !membershipRole(user.id, row.trip_id)) redirect("/spending");

  db.prepare(`DELETE FROM expenses WHERE id = ?`).run(expenseId);
  recordActivity({
    tripId: row.trip_id,
    actorId: user.id,
    action: "expense.removed",
    detail: row.description,
  });

  revalidatePath(`/trips/${row.trip_id}`);
  revalidatePath("/spending");
  revalidatePath("/dashboard");
}

const companionSchema = z.object({
  trip_id: z.coerce.number().int().positive(),
  email: z.email("Enter the email they signed up with."),
});

export async function addCompanionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = companionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const trip = getTrip(parsed.data.trip_id);
  if (!trip || membershipRole(user.id, parsed.data.trip_id) !== "owner") {
    return { error: "Only the person who created the trip can add companions." };
  }

  const members = listMembers(trip.id);
  const limit = canAddCompanion(user.plan, members.length - 1);
  if (!limit.allowed) return { error: limit.reason };

  const companion = findUserByEmail(parsed.data.email);
  if (!companion) {
    return {
      error: "Nobody with that email has an account yet — ask them to sign up first, it's free.",
    };
  }
  if (members.some((member) => member.user_id === companion.id)) {
    return { error: `${companion.name} is already on this trip.` };
  }

  const db = getDb();
  db.prepare(`INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'companion')`).run(
    trip.id,
    companion.id,
  );
  db.prepare(`UPDATE trips SET travellers = MAX(travellers, ?) WHERE id = ?`).run(
    members.length + 1,
    trip.id,
  );

  recordActivity({
    tripId: trip.id,
    actorId: user.id,
    action: "companion.added",
    detail: companion.name,
  });

  revalidatePath(`/trips/${trip.id}`);
  return { ok: true };
}

export async function removeCompanionAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tripId = Number(formData.get("trip_id"));
  const memberId = Number(formData.get("user_id"));

  const trip = getTrip(tripId);
  if (!trip || membershipRole(user.id, tripId) !== "owner") redirect("/trips");
  // The owner cannot leave their own trip; that is what cancelling is for.
  if (memberId === trip.owner_id) redirect(`/trips/${tripId}`);

  const db = getDb();
  db.prepare(`DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?`).run(tripId, memberId);
  db.prepare(
    `UPDATE trips SET travellers = MAX(1, (SELECT COUNT(*) FROM trip_members WHERE trip_id = ?))
      WHERE id = ?`,
  ).run(tripId, tripId);

  recordActivity({ tripId, actorId: user.id, action: "companion.removed" });
  revalidatePath(`/trips/${tripId}`);
}

function toFormState(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { fieldErrors };
}
