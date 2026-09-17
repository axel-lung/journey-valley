import { randomBytes } from "node:crypto";
import { getDb } from "./db";
import type { Invoice, InvoiceKind } from "./invoices";

/**
 * La persistance des factures. Séparée de `invoices.ts`, qui reste pur pour
 * que les écrans clients puissent en importer les règles sans embarquer la
 * base de données.
 */

function nextReference(agencyId: number): string {
  const year = new Date().getFullYear();
  const row = getDb()
    .prepare<[number, string], { count: number }>(
      `SELECT COUNT(*) AS count FROM invoices WHERE agency_id = ? AND reference LIKE ?`,
    )
    .get(agencyId, `FAC-${year}-%`);

  return `FAC-${year}-${String((row?.count ?? 0) + 1).padStart(4, "0")}`;
}

export function listInvoices(tripId: number): Invoice[] {
  return getDb()
    .prepare<[number], Invoice>(
      `SELECT * FROM invoices WHERE trip_id = ? ORDER BY created_at DESC, id DESC`,
    )
    .all(tripId);
}

export function getInvoice(invoiceId: number): Invoice | null {
  return (
    getDb().prepare<[number], Invoice>(`SELECT * FROM invoices WHERE id = ?`).get(invoiceId) ?? null
  );
}

export function getInvoiceByToken(token: string): Invoice | null {
  return (
    getDb().prepare<[string], Invoice>(`SELECT * FROM invoices WHERE token = ?`).get(token) ?? null
  );
}

export function createInvoice(input: {
  tripId: number;
  agencyId: number;
  quoteId: number | null;
  kind: InvoiceKind;
  label: string;
  totalCents: number;
  dueDate: string | null;
}): Invoice {
  const result = getDb()
    .prepare(
      `INSERT INTO invoices (trip_id, agency_id, quote_id, reference, token, kind, status,
                             label, total_cents, due_date)
       VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
    )
    .run(
      input.tripId,
      input.agencyId,
      input.quoteId,
      nextReference(input.agencyId),
      randomBytes(24).toString("base64url"),
      input.kind,
      input.label,
      input.totalCents,
      input.dueDate,
    );

  return getInvoice(Number(result.lastInsertRowid))!;
}

/** Émettre fige la facture : une pièce comptable ne se retouche pas. */
export function issue(invoiceId: number): void {
  getDb()
    .prepare(
      `UPDATE invoices SET status = 'issued', issued_at = datetime('now')
        WHERE id = ? AND status = 'draft'`,
    )
    .run(invoiceId);
}

export function markPaid(invoiceId: number, note: string): void {
  getDb()
    .prepare(
      `UPDATE invoices SET status = 'paid', paid_at = datetime('now'), payment_note = ?
        WHERE id = ? AND status = 'issued'`,
    )
    .run(note, invoiceId);
}

/**
 * Annuler plutôt que supprimer, dès que la facture est émise : une numérotation
 * comptable doit rester continue, donc le numéro survit à l'annulation.
 */
export function cancel(invoiceId: number): void {
  const db = getDb();
  const invoice = getInvoice(invoiceId);
  if (!invoice) return;

  if (invoice.status === "draft") {
    db.prepare(`DELETE FROM invoices WHERE id = ?`).run(invoiceId);
    return;
  }
  db.prepare(`UPDATE invoices SET status = 'cancelled' WHERE id = ?`).run(invoiceId);
}
