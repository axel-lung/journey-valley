import { getDb } from "./db";
import { getAgency } from "./agency";
import { dossierMargin } from "./margin";
import { counts, type Invoice } from "./invoices";
import { costsByZone, vatOnMargin } from "./vat";
import type { Trip, VatZone } from "./types";

/**
 * L'aide à la déclaration de TVA sur marge.
 *
 * La base imposable du régime est la différence entre les **encaissements** et
 * les **dépenses** de la période. On se rattache donc aux factures *payées*,
 * pas aux dossiers vendus : une facture émise et non réglée n'a rien encaissé.
 *
 * Et comme un dossier se règle souvent en deux fois, la TVA du dossier est
 * répartie au prorata de ce qui a été encaissé. C'est une **aide**, pas une
 * déclaration : l'hypothèse est écrite en clair dans l'export, et le comptable
 * garde la main.
 */

export interface VatReturnLine {
  /** Mois de l'encaissement, AAAA-MM. */
  month: string;
  invoice_reference: string;
  trip_title: string;
  paid_cents: number;
  /** Part de la marge du dossier rattachée à cet encaissement. */
  margin_cents: number;
  taxable_margin_cents: number;
  exempt_margin_cents: number;
  vat_cents: number;
  rate_percent: number;
}

export interface VatReturnMonth {
  month: string;
  invoices: number;
  paid_cents: number;
  taxable_margin_cents: number;
  exempt_margin_cents: number;
  vat_cents: number;
}

export interface VatReturn {
  lines: VatReturnLine[];
  months: VatReturnMonth[];
  /** Vrai quand un dossier encaissé n'a pas de prix de vente : prorata impossible. */
  incomplete: boolean;
}

export function buildVatReturn(agencyId: number): VatReturn {
  const db = getDb();
  const agency = getAgency(agencyId);
  const rate = agency?.vat_rate;
  const subject = agency ? agency.vat_on_margin === 1 : true;

  const invoices = db
    .prepare<[number], Invoice>(
      `SELECT * FROM invoices WHERE agency_id = ? AND status = 'paid' AND paid_at IS NOT NULL
        ORDER BY paid_at`,
    )
    .all(agencyId);

  const lines: VatReturnLine[] = [];
  let incomplete = false;

  for (const invoice of invoices) {
    if (!counts(invoice)) continue;

    const trip = db
      .prepare<[number], Trip>(`SELECT * FROM trips WHERE id = ?`)
      .get(invoice.trip_id);
    if (!trip) continue;

    const bookings = db
      .prepare<[number], { amount_cents: number; agency_quote_cents: number; zone: VatZone }>(
        `SELECT amount_cents, agency_quote_cents, zone FROM bookings WHERE trip_id = ?`,
      )
      .all(trip.id);

    const margin = dossierMargin(trip, bookings);
    const vat = vatOnMargin({
      marginGrossCents: margin.margin_cents,
      costs: costsByZone(bookings),
      ratePercent: rate,
      subjectToVat: subject,
    });

    // Le prorata : ce qui a été encaissé sur ce dossier, rapporté à ce qu'il
    // vaut. Sans prix de vente, il n'y a pas de rapport à établir.
    if (margin.sell_cents <= 0) {
      incomplete = true;
      continue;
    }
    const share = Math.min(1, invoice.total_cents / margin.sell_cents);

    lines.push({
      month: (invoice.paid_at ?? "").slice(0, 7),
      invoice_reference: invoice.reference,
      trip_title: trip.title,
      paid_cents: invoice.total_cents,
      margin_cents: Math.round(margin.margin_cents * share),
      taxable_margin_cents: Math.round(vat.taxable_margin_cents * share),
      exempt_margin_cents: Math.round(vat.exempt_margin_cents * share),
      vat_cents: Math.round(vat.vat_cents * share),
      rate_percent: vat.rate_percent,
    });
  }

  const byMonth = new Map<string, VatReturnMonth>();
  for (const line of lines) {
    const bucket =
      byMonth.get(line.month) ??
      {
        month: line.month,
        invoices: 0,
        paid_cents: 0,
        taxable_margin_cents: 0,
        exempt_margin_cents: 0,
        vat_cents: 0,
      };

    bucket.invoices += 1;
    bucket.paid_cents += line.paid_cents;
    bucket.taxable_margin_cents += line.taxable_margin_cents;
    bucket.exempt_margin_cents += line.exempt_margin_cents;
    bucket.vat_cents += line.vat_cents;
    byMonth.set(line.month, bucket);
  }

  return {
    lines,
    months: [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month)),
    incomplete,
  };
}

/** Une valeur de cellule CSV : point-virgule comme séparateur, virgule décimale. */
function cell(value: string | number): string {
  if (typeof value === "number") return (value / 100).toFixed(2).replace(".", ",");
  return /[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Le CSV qu'on ouvre dans un tableur français : point-virgule, virgule
 * décimale, et un en-tête qui dit ce que le fichier est — et ce qu'il n'est
 * pas.
 */
export function toCsv(report: VatReturn): string {
  // Le BOM : sans lui, Excel lit l'UTF-8 comme du latin-1 et abîme les accents.
  const rows: string[] = [
    "\ufeff# Journey Valley — export TVA sur marge",
    "# Aide à la déclaration de TVA sur marge — agences de voyages",
    "# Base = encaissements de la période. La TVA du dossier est répartie au prorata de ce qui a été encaissé.",
    "# Document de travail : à vérifier avec votre comptable avant toute déclaration.",
    "",
    ["Mois", "Facture", "Dossier", "Encaissé", "Marge", "Base taxable", "Base exonérée", "TVA", "Taux"].join(";"),
  ];

  for (const line of report.lines) {
    rows.push(
      [
        cell(line.month),
        cell(line.invoice_reference),
        cell(line.trip_title),
        cell(line.paid_cents),
        cell(line.margin_cents),
        cell(line.taxable_margin_cents),
        cell(line.exempt_margin_cents),
        cell(line.vat_cents),
        `${line.rate_percent} %`,
      ].join(";"),
    );
  }

  rows.push("");
  rows.push(["Mois", "Factures", "Encaissé", "Base taxable", "Base exonérée", "TVA due"].join(";"));
  for (const month of report.months) {
    rows.push(
      [
        cell(month.month),
        String(month.invoices),
        cell(month.paid_cents),
        cell(month.taxable_margin_cents),
        cell(month.exempt_margin_cents),
        cell(month.vat_cents),
      ].join(";"),
    );
  }

  if (report.incomplete) {
    rows.push("");
    rows.push(
      "# Attention : un dossier encaissé n'a pas de prix de vente ; sa part de marge n'a pas pu être répartie.",
    );
  }

  return rows.join("\n");
}
