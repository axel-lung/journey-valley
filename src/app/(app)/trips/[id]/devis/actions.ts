"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertAdvisor, getAgency, getClient } from "@/lib/agency";
import { requireUser } from "@/lib/auth";
import { recordActivity } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { billingFor, INVOICE_KIND_LABEL, suggestedAmount } from "@/lib/invoices";
import {
  cancel,
  createInvoice,
  getInvoice,
  issue,
  listInvoices,
  markPaid,
} from "@/lib/invoices-store";
import { dossierMargin } from "@/lib/margin";
import { formatMoney, parseAmountToCents } from "@/lib/money";
import { composeInvoice, composeQuote } from "@/lib/mail";
import { publicUrl, queueAndDeliver } from "@/lib/mail-store";
import { createQuote, deleteQuote, getQuote, listQuotes, markSent } from "@/lib/quotes";
import { getTrip, listBookings, membershipRole } from "@/lib/trips";
import type { Trip, User } from "@/lib/types";

/**
 * À qui le message part.
 *
 * Le client du dossier, s'il a une adresse. Sans adresse, rien n'est mis en
 * file : un message sans destinataire n'attend pas, il n'existe pas — et
 * l'écran le dit plutôt que de laisser croire à un envoi.
 */
function recipientFor(agencyId: number, trip: Trip): { name: string; email: string } | null {
  if (!trip.client_id) return null;
  const client = getClient(agencyId, trip.client_id);
  if (!client?.email) return null;
  return { name: client.name, email: client.email };
}

function senderFor(user: User): { name: string; email: string } {
  return { name: user.name, email: user.email };
}

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

  // Le message part avec le lien public : c'est lui qui porte le devis, le PDF
  // et la réponse du client. Le devis reste envoyé même si le courrier échoue —
  // l'échec se range dans la file, où il se voit et se rattrape.
  const trip = getTrip(quote.trip_id);
  const agency = getAgency(quote.agency_id);
  const to = trip && quote.agency_id ? recipientFor(quote.agency_id, trip) : null;

  if (trip && to) {
    const composed = composeQuote({
      client: to,
      agencyName: agency?.name ?? "votre agence",
      advisor: senderFor(user),
      reference: quote.reference,
      title: quote.title,
      url: publicUrl(`/devis/${quote.token}`),
      validUntil: quote.valid_until ? formatDate(quote.valid_until) : null,
      intro: quote.intro,
    });

    await queueAndDeliver({
      agencyId: quote.agency_id,
      tripId: quote.trip_id,
      kind: "quote",
      to,
      subject: composed.subject,
      body: composed.body,
      link: publicUrl(`/devis/${quote.token}`),
      fromEmail: user.email,
    });
  }

  revalidatePath(`/trips/${quote.trip_id}/devis`);
  revalidatePath("/messages");
}

export async function deleteQuoteAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  assertAdvisor(user);

  const quote = getQuote(Number(formData.get("quote_id")));
  if (!quote || quote.agency_id !== user.agency_id) redirect("/trips");

  deleteQuote(quote.id);
  revalidatePath(`/trips/${quote.trip_id}/devis`);
}

/* ---------------------------------------------------------------- factures */

const invoiceSchema = z.object({
  trip_id: z.coerce.number().int().positive(),
  quote_id: z.coerce.number().int().positive().optional(),
  kind: z.enum(["deposit", "balance", "full"]),
  amount: z.string().trim().default(""),
  due_date: z.string().trim().default(""),
  label: z.string().trim().max(200).default(""),
});

/**
 * Crée une facture d'acompte ou de solde.
 *
 * Le montant proposé vient de `suggestedAmount`, mais le conseiller peut le
 * corriger — un acompte se négocie. Ce qui ne se négocie pas : on ne facture
 * pas plus que ce qui reste dû.
 */
export async function createInvoiceAction(
  _previous: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  const user = await requireUser();
  assertAdvisor(user);

  const parsed = invoiceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Vérifiez les champs." };

  const trip = getTrip(parsed.data.trip_id);
  if (!trip || !membershipRole(user.id, parsed.data.trip_id)) {
    return { error: "Ce dossier ne vous appartient pas." };
  }
  if (!user.agency_id) return { error: "Votre compte n'est rattaché à aucune agence." };

  const bookings = listBookings(trip.id);
  const margin = dossierMargin(trip, bookings);
  const billing = billingFor(margin.sell_cents, listInvoices(trip.id));

  if (margin.sell_cents <= 0) {
    return { error: "Rien n'est vendu sur ce dossier : posez un prix de vente d'abord." };
  }

  const typed = parsed.data.amount === "" ? null : parseAmountToCents(parsed.data.amount);
  if (parsed.data.amount !== "" && typed === null) {
    return { error: "Le montant n'est pas lisible : 1 194 ou 1194,00." };
  }

  // Champ laissé vide : on retient ce que l'écran proposait pour ce type de
  // facture — un acompte reste un acompte, pas la totalité du dossier.
  const accepted = listQuotes(trip.id).find((quote) => quote.status === "accepted");
  const reference = accepted ?? { total_cents: margin.sell_cents, deposit_percent: 30 };
  const amount = typed ?? suggestedAmount(parsed.data.kind, reference, billing);

  if (amount <= 0) return { error: "Le montant doit être supérieur à zéro." };
  if (amount > billing.remaining_cents) {
    return {
      error: `Il ne reste que ${formatMoney(billing.remaining_cents, trip.currency)} à facturer sur ce dossier.`,
    };
  }

  const invoice = createInvoice({
    tripId: trip.id,
    agencyId: user.agency_id,
    quoteId: parsed.data.quote_id ?? null,
    kind: parsed.data.kind,
    label: parsed.data.label || trip.title,
    totalCents: amount,
    dueDate: parsed.data.due_date || null,
  });

  recordActivity({
    tripId: trip.id,
    actorId: user.id,
    action: "invoice.created",
    detail: invoice.reference,
  });

  revalidatePath(`/trips/${trip.id}/devis`);
  return {};
}

export async function issueInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  assertAdvisor(user);

  const invoice = getInvoice(Number(formData.get("invoice_id")));
  if (!invoice || invoice.agency_id !== user.agency_id) redirect("/trips");

  issue(invoice.id);
  recordActivity({
    tripId: invoice.trip_id,
    actorId: user.id,
    action: "invoice.issued",
    detail: invoice.reference,
  });

  const trip = getTrip(invoice.trip_id);
  const agency = getAgency(invoice.agency_id);
  const to = trip ? recipientFor(invoice.agency_id, trip) : null;

  if (trip && to) {
    const composed = composeInvoice({
      client: to,
      agencyName: agency?.name ?? "votre agence",
      advisor: senderFor(user),
      reference: invoice.reference,
      kindLabel: INVOICE_KIND_LABEL[invoice.kind],
      amount: formatMoney(invoice.total_cents, trip.currency),
      dueDate: invoice.due_date ? formatDate(invoice.due_date) : null,
      url: publicUrl(`/facture/${invoice.token}`),
    });

    await queueAndDeliver({
      agencyId: invoice.agency_id,
      tripId: invoice.trip_id,
      kind: "invoice",
      to,
      subject: composed.subject,
      body: composed.body,
      link: publicUrl(`/facture/${invoice.token}`),
      fromEmail: user.email,
    });
  }

  revalidatePath(`/trips/${invoice.trip_id}/devis`);
  revalidatePath("/messages");
}

export async function markInvoicePaidAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  assertAdvisor(user);

  const invoice = getInvoice(Number(formData.get("invoice_id")));
  if (!invoice || invoice.agency_id !== user.agency_id) redirect("/trips");

  markPaid(invoice.id, String(formData.get("payment_note") ?? "").slice(0, 200));
  recordActivity({
    tripId: invoice.trip_id,
    actorId: user.id,
    action: "invoice.paid",
    detail: invoice.reference,
  });
  revalidatePath(`/trips/${invoice.trip_id}/devis`);
  revalidatePath("/marges");
}

export async function cancelInvoiceAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  assertAdvisor(user);

  const invoice = getInvoice(Number(formData.get("invoice_id")));
  if (!invoice || invoice.agency_id !== user.agency_id) redirect("/trips");

  cancel(invoice.id);
  revalidatePath(`/trips/${invoice.trip_id}/devis`);
}
