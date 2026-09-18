import type { Quote } from "./quotes";

/**
 * Les factures d'une agence de voyages.
 *
 * Une règle domine tout le reste, et elle surprend : **la TVA ne figure pas sur
 * la facture**. Sous le régime de la marge, ne pas la mentionner est une
 * condition d'application du régime — la faire apparaître révélerait la marge
 * (elle en est 20/120) et ouvrirait à tort un droit à déduction au client. En
 * revanche la mention « Régime particulier – agences de voyages » est
 * obligatoire, sous peine d'amende par facture.
 *
 * La TVA n'est donc pas absente du produit, elle est ailleurs : calculée par
 * `vat.ts` pour le conseiller, et exportée pour le comptable. Le client ne voit
 * qu'un montant à payer.
 *
 * Deuxième règle : on ne facture jamais plus que ce qui a été vendu. Acompte
 * puis solde, et le solde se calcule sur ce qui reste.
 *
 * Ce fichier est pur : ni base, ni React, donc un composant client peut
 * l'importer sans embarquer SQLite. Les écritures vivent dans
 * `invoices-store.ts`.
 */

export type InvoiceKind = "deposit" | "balance" | "full";
export type InvoiceStatus = "draft" | "issued" | "paid" | "cancelled";

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  deposit: "Acompte",
  balance: "Solde",
  full: "Facture",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Brouillon",
  issued: "Émise",
  paid: "Payée",
  cancelled: "Annulée",
};

export const INVOICE_STATUS_TONE: Record<InvoiceStatus, string> = {
  draft: "bg-stone-100 text-stone-600",
  issued: "bg-amber-100 text-amber-800",
  paid: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-stone-100 text-stone-400",
};

/** La mention qui doit figurer sur chaque facture, à la lettre. */
export const MARGIN_SCHEME_MENTION = "Régime particulier – agences de voyages";

export interface Invoice {
  id: number;
  trip_id: number;
  agency_id: number;
  quote_id: number | null;
  reference: string;
  token: string;
  kind: InvoiceKind;
  status: InvoiceStatus;
  label: string;
  total_cents: number;
  due_date: string | null;
  issued_at: string | null;
  /** Quand le client a ouvert la facture ; null tant qu'il ne l'a pas vue. */
  opened_at: string | null;
  paid_at: string | null;
  payment_note: string;
  created_at: string;
}

/** Ce qu'une facture compte vraiment : émise ou payée, pas annulée. */
export function counts(invoice: Pick<Invoice, "status">): boolean {
  return invoice.status === "issued" || invoice.status === "paid";
}

export interface Billing {
  sold_cents: number;
  invoiced_cents: number;
  paid_cents: number;
  /** Ce qui reste à facturer ; jamais négatif. */
  remaining_cents: number;
  /** Ce qui est facturé mais pas encore réglé. */
  outstanding_cents: number;
  fully_invoiced: boolean;
}

/**
 * L'état de facturation d'un dossier.
 *
 * Pur : la page, le tableau de bord et les tests lisent la même règle, et
 * personne ne recalcule « ce qui reste » à sa façon.
 */
export function billingFor(soldCents: number, invoices: Invoice[]): Billing {
  const counted = invoices.filter(counts);
  const invoiced = counted.reduce((total, invoice) => total + invoice.total_cents, 0);
  const paid = counted
    .filter((invoice) => invoice.status === "paid")
    .reduce((total, invoice) => total + invoice.total_cents, 0);

  return {
    sold_cents: soldCents,
    invoiced_cents: invoiced,
    paid_cents: paid,
    remaining_cents: Math.max(0, soldCents - invoiced),
    outstanding_cents: invoiced - paid,
    fully_invoiced: soldCents > 0 && invoiced >= soldCents,
  };
}

/** Le montant qu'une facture de ce type proposerait aujourd'hui. */
export function suggestedAmount(
  kind: InvoiceKind,
  quote: Pick<Quote, "total_cents" | "deposit_percent">,
  billing: Billing,
): number {
  if (kind === "deposit") {
    const deposit = Math.round((quote.total_cents * quote.deposit_percent) / 100);
    return Math.min(deposit, billing.remaining_cents);
  }
  // Solde comme facture unique : tout ce qui reste dû.
  return billing.remaining_cents;
}
