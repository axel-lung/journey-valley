"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getClient } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { getDb, recordActivity } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";
import { CHECKLIST_TEMPLATE } from "@/lib/checklist";
import { canAddCompanion, canCreateTrip } from "@/lib/plans";
import { checkStageChange, type StageAction } from "@/lib/stages";
import {
  countActiveTrips,
  findUserByEmail,
  getTrip,
  listMembers,
  membershipRole,
  serialiseParticipants,
} from "@/lib/trips";

export interface FormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  ok?: boolean;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez une date valide.");

const tripSchema = z
  .object({
    title: z.string().trim().min(3, "Donnez-lui un nom que vous reconnaîtrez."),
    summary: z.string().trim().max(500).default(""),
    destination_city: z.string().trim().min(1, "Vous allez où ?"),
    destination_country: z.string().trim().min(1, "Dans quel pays ?"),
    start_date: isoDate,
    end_date: isoDate,
    budget: z.string().trim().default(""),
    agency_quote: z.string().trim().default(""),
    client_id: z.string().trim().default(""),
    travellers: z.coerce.number().int().min(1).max(20).default(1),
  })
  .refine((value) => value.end_date >= value.start_date, {
    message: "Le retour ne peut pas précéder le départ.",
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
  if (budget === null) {
    return { fieldErrors: { budget: "Un montant comme 1 200 ou 1200,50." } };
  }

  const quote = optionalAmount(parsed.data.agency_quote);
  if (quote === null) {
    return { fieldErrors: { agency_quote: "Un montant comme 2 400, ou laissez vide." } };
  }

  // Un dossier appartient à un client de l'agence, et à personne d'autre : un
  // identifiant venu d'ailleurs est ignoré plutôt que rattaché de force.
  const clientId = Number(parsed.data.client_id) || null;
  const client =
    clientId && user.agency_id ? getClient(user.agency_id, clientId) : null;

  const db = getDb();
  const tripId = db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO trips (owner_id, client_id, title, summary, destination_city,
                            destination_country, start_date, end_date, stage, currency,
                            budget_cents, agency_quote_cents, travellers)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'idea', ?, ?, ?, ?)`,
      )
      .run(
        user.id,
        client?.id ?? null,
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

  recordActivity({ tripId, actorId: user.id, action: "trip.created", detail: parsed.data.title });

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
    redirect(`/trips/${tripId}?error=${encodeURIComponent(check.reason ?? "Action impossible.")}`);
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
  revalidatePath("/savings");
}

const bookingSchema = z.object({
  trip_id: z.coerce.number().int().positive(),
  type: z.enum(["flight", "stay", "activity", "transport", "other"]),
  vendor: z.string().trim().min(1, "Réservé chez qui ?"),
  reference: z.string().trim().max(60).optional(),
  description: z.string().trim().max(300).default(""),
  start_at: isoDate,
  end_at: z.string().optional(),
  amount: z.string().trim().min(1, "Combien avez-vous payé ?"),
  agency_quote: z.string().trim().default(""),
  zone: z.enum(["eu", "non_eu"]).default("eu"),
  nights: z.string().optional(),
});

export async function addBookingAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = bookingSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const trip = getTrip(parsed.data.trip_id);
  const role = membershipRole(user.id, parsed.data.trip_id);
  if (!trip || !role) return { error: "Ce voyage ne vous appartient pas." };
  if (trip.stage === "cancelled") return { error: "Ce voyage est annulé." };

  const amount = parseAmountToCents(parsed.data.amount);
  if (amount === null) {
    return { fieldErrors: { amount: "Un montant comme 246 ou 245,90." } };
  }

  const quote = optionalAmount(parsed.data.agency_quote);
  if (quote === null) {
    return { fieldErrors: { agency_quote: "Un montant, ou laissez vide." } };
  }

  const nights =
    parsed.data.type === "stay" && parsed.data.nights ? Number(parsed.data.nights) || null : null;

  getDb()
    .prepare(
      `INSERT INTO bookings (trip_id, type, vendor, reference, description, start_at, end_at,
                             amount_cents, agency_quote_cents, zone, nights, booked_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      parsed.data.zone,
      nights,
      user.id,
    );

  recordActivity({
    tripId: trip.id,
    actorId: user.id,
    action: "booking.added",
    detail: parsed.data.vendor,
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
  if (!row || !membershipRole(user.id, row.trip_id)) redirect("/trips");

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
  description: z.string().trim().min(1, "C'était pour quoi ?"),
  spent_on: isoDate,
  amount: z.string().trim().min(1, "Combien ?"),
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
    return { error: "Ce voyage ne vous appartient pas." };
  }

  const amount = parseAmountToCents(parsed.data.amount);
  if (amount === null) {
    return { fieldErrors: { amount: "Un montant comme 24 ou 23,80." } };
  }

  const members = listMembers(trip.id);
  const memberIds = new Set(members.map((member) => member.user_id));

  // You may record that a companion paid, but only someone on the trip.
  const paidBy =
    parsed.data.paid_by && memberIds.has(parsed.data.paid_by) ? parsed.data.paid_by : user.id;

  const shared = parsed.data.shared === "on";
  // Checkboxes only submit what is ticked; an untouched form means "everyone".
  const picked = formData
    .getAll("participants")
    .map((value) => Number(value))
    .filter((id) => memberIds.has(id));
  const participants =
    shared && picked.length > 0 && picked.length < members.length ? picked : null;

  getDb()
    .prepare(
      `INSERT INTO expenses (trip_id, paid_by, category, description, spent_on, amount_cents,
                             shared, participant_ids, receipt_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      trip.id,
      paidBy,
      parsed.data.category,
      parsed.data.description,
      parsed.data.spent_on,
      amount,
      shared ? 1 : 0,
      serialiseParticipants(participants),
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
  email: z.email("Indiquez l'e-mail de son compte."),
});

export async function addCompanionAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();

  const parsed = companionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return toFormState(parsed.error);

  const trip = getTrip(parsed.data.trip_id);
  if (!trip || membershipRole(user.id, parsed.data.trip_id) !== "owner") {
    return { error: "Seule la personne qui a créé le voyage peut inviter." };
  }

  const members = listMembers(trip.id);
  const limit = canAddCompanion(user.plan, members.length - 1);
  if (!limit.allowed) return { error: limit.reason };

  const companion = findUserByEmail(parsed.data.email);
  if (!companion) {
    return { error: "Personne n'a encore de compte avec cet e-mail — l'inscription est gratuite." };
  }
  if (members.some((member) => member.user_id === companion.id)) {
    return { error: `${companion.name} fait déjà partie du voyage.` };
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

/* ------------------------------------------------------------- checklist */

export async function addChecklistItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tripId = Number(formData.get("trip_id"));
  const label = String(formData.get("label") ?? "").trim().slice(0, 140);

  if (!label || !membershipRole(user.id, tripId)) redirect(`/trips/${tripId}`);

  const db = getDb();
  const next = db
    .prepare<[number], { position: number }>(
      `SELECT COALESCE(MAX(position), -1) + 1 AS position FROM checklist_items WHERE trip_id = ?`,
    )
    .get(tripId)!.position;

  db.prepare(`INSERT INTO checklist_items (trip_id, label, position) VALUES (?, ?, ?)`).run(
    tripId,
    label,
    next,
  );

  revalidatePath(`/trips/${tripId}`);
}

export async function addChecklistTemplateAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tripId = Number(formData.get("trip_id"));
  if (!membershipRole(user.id, tripId)) redirect(`/trips/${tripId}`);

  const db = getDb();
  const existing = db
    .prepare<[number], { label: string }>(`SELECT label FROM checklist_items WHERE trip_id = ?`)
    .all(tripId)
    .map((row) => row.label);

  const insert = db.prepare(
    `INSERT INTO checklist_items (trip_id, label, position) VALUES (?, ?, ?)`,
  );
  const start = existing.length;

  // Adding the template twice must not double every line.
  db.transaction(() => {
    CHECKLIST_TEMPLATE.filter((label) => !existing.includes(label)).forEach((label, index) => {
      insert.run(tripId, label, start + index);
    });
  })();

  revalidatePath(`/trips/${tripId}`);
}

export async function toggleChecklistItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const itemId = Number(formData.get("item_id"));

  const db = getDb();
  const row = db
    .prepare<[number], { trip_id: number }>(`SELECT trip_id FROM checklist_items WHERE id = ?`)
    .get(itemId);
  if (!row || !membershipRole(user.id, row.trip_id)) redirect("/trips");

  db.prepare(`UPDATE checklist_items SET done = 1 - done WHERE id = ?`).run(itemId);
  revalidatePath(`/trips/${row.trip_id}`);
}

export async function deleteChecklistItemAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const itemId = Number(formData.get("item_id"));

  const db = getDb();
  const row = db
    .prepare<[number], { trip_id: number }>(`SELECT trip_id FROM checklist_items WHERE id = ?`)
    .get(itemId);
  if (!row || !membershipRole(user.id, row.trip_id)) redirect("/trips");

  db.prepare(`DELETE FROM checklist_items WHERE id = ?`).run(itemId);
  revalidatePath(`/trips/${row.trip_id}`);
}

function toFormState(error: z.ZodError): FormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    fieldErrors[key] ??= issue.message;
  }
  return { fieldErrors };
}
