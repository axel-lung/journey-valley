"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdvisor, getAgency } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { recordActivity } from "@/lib/db";
import { createQuote, deleteQuote, getQuote, markSent } from "@/lib/quotes";
import { getTrip, listBookings, membershipRole } from "@/lib/trips";

/**
 * Les devis, côté conseiller.
 *
 * Trois verbes seulement : créer un brouillon, l'envoyer, le supprimer tant
 * qu'il n'est pas parti. Ce qui suit l'envoi appartient au client, et se fait
 * par le lien public — un devis ne s'accepte pas à la place de celui qui paie.
 */

const createSchema = z.object({
  trip_id: z.coerce.number().int().positive(),
  intro: z.string().trim().max(2000).default(""),
  terms: z.string().trim().max(4000).default(""),
  deposit_percent: z.coerce.number().int().min(0).max(100).default(30),
  valid_until: z.string().trim().default(""),
});

export interface QuoteFormState {
  error?: string;
}

export async function createQuoteAction(
  _previous: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const user = await requireUser();
  assertAdvisor(user);

  const parsed = createSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };

  const trip = getTrip(parsed.data.trip_id);
  if (!trip || !membershipRole(user.id, parsed.data.trip_id)) {
    return { error: "Ce dossier ne vous appartient pas." };
  }
  if (!user.agency_id || !getAgency(user.agency_id)) {
    return { error: "Votre compte n'est rattaché à aucune agence." };
  }

  const bookings = listBookings(trip.id);
  const quote = createQuote({
    trip,
    agencyId: user.agency_id,
    bookings,
    intro: parsed.data.intro,
    terms: parsed.data.terms,
    depositPercent: parsed.data.deposit_percent,
    validUntil: parsed.data.valid_until || null,
  });

  if (quote.total_cents === 0) {
    // Un devis à zéro euro n'est pas un devis : on le retire plutôt que de
    // laisser un brouillon vide traîner dans le dossier.
    deleteQuote(quote.id);
    return {
      error:
        "Aucune prestation n'a de prix de vente : posez un forfait sur le dossier, ou chiffrez au moins une ligne.",
    };
  }

  recordActivity({
    tripId: trip.id,
    actorId: user.id,
    action: "quote.created",
    detail: quote.reference,
  });

  revalidatePath(`/trips/${trip.id}/devis`);
  return {};
}

export async function sendQuoteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  assertAdvisor(user);

  const quote = getQuote(Number(formData.get("quote_id")));
  if (!quote || quote.agency_id !== user.agency_id) redirect("/trips");

  markSent(quote.id);
  recordActivity({
    tripId: quote.trip_id,
    actorId: user.id,
    action: "quote.sent",
    detail: quote.reference,
  });

  revalidatePath(`/trips/${quote.trip_id}/devis`);
}

export async function deleteQuoteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  assertAdvisor(user);

  const quote = getQuote(Number(formData.get("quote_id")));
  if (!quote || quote.agency_id !== user.agency_id) redirect("/trips");

  deleteQuote(quote.id);
  revalidatePath(`/trips/${quote.trip_id}/devis`);
}
