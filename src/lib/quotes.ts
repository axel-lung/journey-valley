import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import { defaultTerms } from "./legal";
import type { Booking, Trip } from "./types";

/**
 * Le devis : l'offre qu'on envoie, et la preuve qu'elle a été acceptée.
 *
 * Deux règles tiennent tout le reste :
 *
 * 1. **Un devis envoyé est figé.** Ses lignes sont recopiées au moment de
 *    l'envoi, pas lues en direct depuis le dossier. Sans cela, changer un prix
 *    d'achat le lendemain modifierait rétroactivement une offre que le client a
 *    sous les yeux — au mieux gênant, au pire indéfendable.
 * 2. **Le lien public vaut authentification.** Le jeton est long et aléatoire,
 *    propre à un devis, et c'est tout ce qui protège l'accès : il ne se devine
 *    pas, ne se réutilise pas, et n'ouvre rien d'autre que ce devis.
 */

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  declined: "Refusé",
};

export const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = {
  draft: "bg-stone-100 text-stone-600",
  sent: "bg-brand-100 text-brand-800",
  accepted: "bg-emerald-100 text-emerald-800",
  declined: "bg-rose-100 text-rose-700",
};

export interface Quote {
  id: number;
  trip_id: number;
  agency_id: number;
  reference: string;
  token: string;
  status: QuoteStatus;
  title: string;
  intro: string;
  terms: string;
  total_cents: number;
  deposit_percent: number;
  valid_until: string | null;
  sent_at: string | null;
  /** Quand le client a ouvert le devis pour la première fois ; null tant qu'il ne l'a pas vu. */
  opened_at: string | null;
  decided_at: string | null;
  decided_by_name: string | null;
  decided_ip: string | null;
  decided_note: string | null;
  created_at: string;
}

export interface QuoteLine {
  id: number;
  quote_id: number;
  label: string;
  detail: string;
  start_at: string | null;
  end_at: string | null;
  price_cents: number;
  position: number;
}

export interface QuoteWithLines {
  quote: Quote;
  lines: QuoteLine[];
}

/** Un devis expiré n'est plus acceptable, sans qu'il faille une tâche de fond. */
export function isExpired(quote: Pick<Quote, "valid_until">, today = new Date()): boolean {
  if (!quote.valid_until) return false;
  return quote.valid_until < today.toISOString().slice(0, 10);
}

/** Le client peut-il encore se prononcer ? */
export function isDecidable(quote: Quote, today = new Date()): boolean {
  return quote.status === "sent" && !isExpired(quote, today);
}

export function depositCents(quote: Pick<Quote, "total_cents" | "deposit_percent">): number {
  return Math.round((quote.total_cents * quote.deposit_percent) / 100);
}

/** Référence lisible et croissante : DEV-2026-0007. */
function nextReference(agencyId: number): string {
  const year = new Date().getFullYear();
  const row = getDb()
    .prepare<[number, string], { count: number }>(
      `SELECT COUNT(*) AS count FROM quotes WHERE agency_id = ? AND reference LIKE ?`,
    )
    .get(agencyId, `DEV-${year}-%`);

  return `DEV-${year}-${String((row?.count ?? 0) + 1).padStart(4, "0")}`;
}

/**
 * Prépare les lignes à partir du dossier.
 *
 * Un forfait posé sur le dossier l'emporte : le client achète un prix, pas une
 * addition. Sinon, chaque prestation valorisée devient une ligne — celles sans
 * prix de vente sont laissées de côté, parce qu'on ne facture pas ce qu'on n'a
 * pas chiffré.
 */
export function draftLinesFor(
  trip: Pick<Trip, "title" | "agency_quote_cents" | "start_date" | "end_date">,
  bookings: Booking[],
): Array<Omit<QuoteLine, "id" | "quote_id">> {
  if (trip.agency_quote_cents > 0) {
    return [
      {
        label: trip.title,
        detail: "Forfait complet, tel que décrit au programme",
        start_at: trip.start_date,
        end_at: trip.end_date,
        price_cents: trip.agency_quote_cents,
        position: 0,
      },
    ];
  }

  return bookings
    .filter((booking) => booking.agency_quote_cents > 0)
    .map((booking, index) => ({
      label: booking.vendor,
      detail: booking.description,
      start_at: booking.start_at,
      end_at: booking.end_at,
      price_cents: booking.agency_quote_cents,
      position: index,
    }));
}

export function createQuote(input: {
  trip: Trip;
  agencyId: number;
  bookings: Booking[];
  intro: string;
  terms: string;
  depositPercent: number;
  validUntil: string | null;
}): Quote {
  const db = getDb();
  const lines = draftLinesFor(input.trip, input.bookings);
  const total = lines.reduce((sum, line) => sum + line.price_cents, 0);

  return db.transaction(() => {
    const result = db
      .prepare(
        `INSERT INTO quotes (trip_id, agency_id, reference, token, status, title, intro, terms,
                             total_cents, deposit_percent, valid_until)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.trip.id,
        input.agencyId,
        nextReference(input.agencyId),
        randomBytes(24).toString("base64url"),
        input.trip.title,
        input.intro,
        input.terms || defaultTerms(input.depositPercent),
        total,
        input.depositPercent,
        input.validUntil,
      );

    const quoteId = Number(result.lastInsertRowid);
    const insertLine = db.prepare(
      `INSERT INTO quote_lines (quote_id, label, detail, start_at, end_at, price_cents, position)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const line of lines) {
      insertLine.run(
        quoteId,
        line.label,
        line.detail,
        line.start_at,
        line.end_at,
        line.price_cents,
        line.position,
      );
    }

    return getQuote(quoteId)!;
  })();
}

export function getQuote(quoteId: number): Quote | null {
  return getDb().prepare<[number], Quote>(`SELECT * FROM quotes WHERE id = ?`).get(quoteId) ?? null;
}

/** Le seul accès sans compte, et donc le seul endroit où le jeton fait foi. */
export function getQuoteByToken(token: string): QuoteWithLines | null {
  const db = getDb();
  const quote = db.prepare<[string], Quote>(`SELECT * FROM quotes WHERE token = ?`).get(token);
  if (!quote) return null;
  return { quote, lines: listQuoteLines(quote.id) };
}

export function listQuoteLines(quoteId: number): QuoteLine[] {
  return getDb()
    .prepare<[number], QuoteLine>(
      `SELECT * FROM quote_lines WHERE quote_id = ? ORDER BY position, id`,
    )
    .all(quoteId);
}

export function listQuotes(tripId: number): Quote[] {
  return getDb()
    .prepare<[number], Quote>(`SELECT * FROM quotes WHERE trip_id = ? ORDER BY created_at DESC, id DESC`)
    .all(tripId);
}

export function listAgencyQuotes(agencyId: number, statuses?: QuoteStatus[]): Quote[] {
  const db = getDb();
  if (!statuses || statuses.length === 0) {
    return db
      .prepare<[number], Quote>(
        `SELECT * FROM quotes WHERE agency_id = ? ORDER BY created_at DESC, id DESC`,
      )
      .all(agencyId);
  }

  const placeholders = statuses.map(() => "?").join(", ");
  return db
    .prepare<[number, ...QuoteStatus[]], Quote>(
      `SELECT * FROM quotes WHERE agency_id = ? AND status IN (${placeholders})
        ORDER BY created_at DESC, id DESC`,
    )
    .all(agencyId, ...statuses);
}

/** L'envoi fige le devis : c'est à partir de là qu'il engage l'agence. */
export function markSent(quoteId: number): void {
  getDb()
    .prepare(`UPDATE quotes SET status = 'sent', sent_at = datetime('now') WHERE id = ? AND status = 'draft'`)
    .run(quoteId);
}

export function decide(input: {
  quoteId: number;
  accepted: boolean;
  name: string;
  ip: string | null;
  note: string;
}): void {
  getDb()
    .prepare(
      `UPDATE quotes
          SET status = ?, decided_at = datetime('now'), decided_by_name = ?, decided_ip = ?,
              decided_note = ?
        WHERE id = ? AND status = 'sent'`,
    )
    .run(
      input.accepted ? "accepted" : "declined",
      input.name,
      input.ip,
      input.note,
      input.quoteId,
    );
}

export function deleteQuote(quoteId: number): void {
  // Un devis déjà envoyé a existé aux yeux du client : on ne le fait pas
  // disparaître, on l'archive en le refusant.
  getDb().prepare(`DELETE FROM quotes WHERE id = ? AND status = 'draft'`).run(quoteId);
}
