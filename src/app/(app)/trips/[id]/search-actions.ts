"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getDb, recordActivity } from "@/lib/db";
import { parseAmountToCents } from "@/lib/money";
import { runSearch, type SearchKind, type SearchResult } from "@/lib/search";
import { getTrip, listWatches, membershipRole } from "@/lib/trips";
import { checkWatch } from "@/lib/watch-runner";

export interface SearchState {
  error?: string;
  results?: SearchResult[];
  provider?: { id: string; label: string; live: boolean };
  fallback_reason?: string;
  /** Echoed back so the import buttons know what was searched. */
  query?: {
    kind: SearchKind;
    origin: string;
    destination: string;
    start_date: string;
    end_date: string;
    travellers: number;
  };
}

const searchSchema = z.object({
  trip_id: z.coerce.number().int().positive(),
  kind: z.enum(["flight", "stay", "activity"]),
  origin: z.string().trim().max(80).default(""),
  destination: z.string().trim().min(1, "Indiquez une destination."),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Indiquez une date valide."),
  end_date: z.string().default(""),
  travellers: z.coerce.number().int().min(1).max(20).default(1),
});

export async function searchAction(_prev: SearchState, formData: FormData): Promise<SearchState> {
  const user = await requireUser();

  const parsed = searchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs de recherche." };
  }
  if (!membershipRole(user.id, parsed.data.trip_id)) {
    return { error: "Ce voyage ne vous appartient pas." };
  }

  const query = {
    kind: parsed.data.kind,
    origin: parsed.data.origin || undefined,
    destination: parsed.data.destination,
    start_date: parsed.data.start_date,
    end_date: parsed.data.end_date || undefined,
    travellers: parsed.data.travellers,
  };

  try {
    const outcome = await runSearch(query);
    return {
      results: outcome.results,
      provider: outcome.provider,
      fallback_reason: outcome.fallback_reason,
      query: {
        kind: parsed.data.kind,
        origin: parsed.data.origin,
        destination: parsed.data.destination,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        travellers: parsed.data.travellers,
      },
    };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "La recherche n'a pas abouti. Réessayez.",
    };
  }
}

const importSchema = z.object({
  trip_id: z.coerce.number().int().positive(),
  kind: z.enum(["flight", "stay", "activity"]),
  vendor: z.string().trim().min(1),
  description: z.string().trim().max(300).default(""),
  start_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_at: z.string().default(""),
  nights: z.string().default(""),
  price_cents: z.coerce.number().int().min(0).default(0),
  /** Typed by the traveller when the source knows the place but not its price. */
  price: z.string().trim().max(20).default(""),
  source: z.string().trim().max(40).default("offline"),
});

/**
 * Turns a search result into a booking on the trip.
 *
 * The price is imported; the package estimate that sits beside it in the
 * results is not. An estimate must never end up in `agency_quote_cents`, or the
 * savings figures would quietly become guesses.
 *
 * OpenStreetMap knows the museum but not the ticket, so those results arrive
 * with no price and the traveller types one in. Without it there is nothing to
 * add: a booking at zero euro would quietly falsify the budget.
 */
export async function importResultAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const parsed = importSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) redirect("/trips");

  const trip = getTrip(parsed.data.trip_id);
  if (!trip || !membershipRole(user.id, parsed.data.trip_id)) redirect("/trips");

  const typed = parsed.data.price === "" ? null : parseAmountToCents(parsed.data.price);
  const amountCents = typed ?? parsed.data.price_cents;
  if (amountCents <= 0) {
    redirect(
      `/trips/${trip.id}?error=${encodeURIComponent(
        "Indiquez le prix de cette prestation avant de l'ajouter — la source ne le publie pas.",
      )}`,
    );
  }

  getDb()
    .prepare(
      `INSERT INTO bookings (trip_id, type, vendor, reference, description, start_at, end_at,
                             amount_cents, agency_quote_cents, nights, booked_by)
       VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 0, ?, ?)`,
    )
    .run(
      trip.id,
      parsed.data.kind,
      parsed.data.vendor,
      parsed.data.description,
      parsed.data.start_at,
      parsed.data.end_at || null,
      amountCents,
      parsed.data.nights ? Number(parsed.data.nights) || null : null,
      user.id,
    );

  recordActivity({
    tripId: trip.id,
    actorId: user.id,
    action: "booking.added",
    detail: parsed.data.vendor,
  });

  revalidatePath(`/trips/${trip.id}`);
  revalidatePath("/dashboard");
  revalidatePath("/savings");
}

const watchSchema = searchSchema.extend({
  target: z.string().trim().default(""),
});

export async function createWatchAction(formData: FormData): Promise<void> {
  const user = await requireUser();

  const parsed = watchSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success || !membershipRole(user.id, parsed.data.trip_id)) {
    redirect(`/trips/${formData.get("trip_id") ?? ""}`);
  }

  const target = parsed.data.target.trim() === "" ? 0 : parseAmountToCents(parsed.data.target);
  if (target === null) {
    redirect(
      `/trips/${parsed.data.trip_id}?error=${encodeURIComponent("Le prix cible n'est pas un montant lisible.")}`,
    );
  }

  getDb()
    .prepare(
      `INSERT INTO price_watches (trip_id, kind, origin, destination, start_date, end_date,
                                  travellers, target_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      parsed.data.trip_id,
      parsed.data.kind,
      parsed.data.origin || null,
      parsed.data.destination,
      parsed.data.start_date,
      parsed.data.end_date || null,
      parsed.data.travellers,
      target,
    );

  recordActivity({
    tripId: parsed.data.trip_id,
    actorId: user.id,
    action: "watch.created",
    detail: parsed.data.destination,
  });

  revalidatePath(`/trips/${parsed.data.trip_id}`);
}

export async function deleteWatchAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const watchId = Number(formData.get("watch_id"));

  const db = getDb();
  const row = db
    .prepare<[number], { trip_id: number }>(`SELECT trip_id FROM price_watches WHERE id = ?`)
    .get(watchId);
  if (!row || !membershipRole(user.id, row.trip_id)) redirect("/trips");

  db.prepare(`DELETE FROM price_watches WHERE id = ?`).run(watchId);
  revalidatePath(`/trips/${row.trip_id}`);
}

/**
 * Runs every watch on a trip now — the same work the scheduled sweep at
 * POST /api/watches/check does, through the same `checkWatch`, so a manual
 * check and a nightly one cannot drift apart.
 */
export async function checkTripWatchesAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const tripId = Number(formData.get("trip_id"));
  if (!membershipRole(user.id, tripId)) redirect("/trips");

  for (const watch of listWatches(tripId)) {
    await checkWatch(watch);
  }

  revalidatePath(`/trips/${tripId}`);
}
