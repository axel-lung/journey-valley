import type { Booking } from "./types";

/**
 * La TVA sur marge des agences de voyages (régime particulier, art. 266-1-e du
 * CGI, directive TVA art. 306 et suivants).
 *
 * Une agence qui achète et revend en son nom ne facture pas la TVA sur le prix
 * de vente : elle la doit sur **sa marge**, et seulement pour la part des
 * prestations exécutées dans l'Union européenne. Ce qui est exécuté hors UE est
 * exonéré.
 *
 * Trois conséquences que les tableurs ratent régulièrement :
 *
 * 1. La marge est **TTC**. La TVA s'en extrait — marge × 20/120 — et ne s'y
 *    ajoute pas. Calculer marge × 20 % surestime la taxe de 20 %.
 * 2. Un forfait mixte (vol hors UE + hôtel en UE) se **ventile au prorata des
 *    coûts d'achat** de chaque zone. C'est la clé de répartition retenue par la
 *    doctrine ; elle doit pouvoir être justifiée, d'où la zone portée par
 *    chaque ligne d'achat plutôt qu'une case à cocher sur le dossier.
 * 3. Une marge négative n'est pas une créance de TVA : elle donne zéro, pas un
 *    crédit.
 *
 * Module pur : aucune base, aucun React. Le même calcul sert la page dossier,
 * le devis et les tests.
 */

/** Où la prestation est exécutée : c'est le lieu qui décide, pas le fournisseur. */
export type VatZone = "eu" | "non_eu";

export const VAT_ZONE_LABEL: Record<VatZone, string> = {
  eu: "Union européenne",
  non_eu: "Hors UE",
};

/** Taux normal français, applicable à la marge des agences. */
export const DEFAULT_VAT_RATE = 20;

export interface VatBreakdown {
  /** La marge telle qu'encaissée, toutes taxes comprises. */
  margin_gross_cents: number;
  /** Part de cette marge rattachée à l'UE, donc taxable. */
  taxable_margin_cents: number;
  /** Part hors UE, exonérée. */
  exempt_margin_cents: number;
  vat_cents: number;
  /** Ce qui reste réellement à l'agence. */
  margin_net_cents: number;
  rate_percent: number;
  /** Vrai quand le dossier mêle les deux zones et a dû être ventilé. */
  mixed: boolean;
  /** Vrai quand rien n'est dû : hors UE, franchise, ou marge nulle. */
  no_vat_due: boolean;
}

export interface ZoneCosts {
  eu: number;
  non_eu: number;
}

/** Les coûts d'achat par zone — la clé de ventilation. */
export function costsByZone(
  bookings: Array<Pick<Booking, "amount_cents"> & { zone?: VatZone | null }>,
): ZoneCosts {
  const costs: ZoneCosts = { eu: 0, non_eu: 0 };
  for (const booking of bookings) {
    // Sans zone renseignée, la ligne est réputée UE : on provisionne la taxe
    // plutôt que de la sous-estimer, et l'écran demande de trancher.
    costs[booking.zone === "non_eu" ? "non_eu" : "eu"] += booking.amount_cents;
  }
  return costs;
}

export function vatOnMargin(input: {
  marginGrossCents: number;
  costs: ZoneCosts;
  ratePercent?: number;
  /** Faux pour une agence en franchise en base, ou hors régime de la marge. */
  subjectToVat?: boolean;
}): VatBreakdown {
  const rate = input.ratePercent ?? DEFAULT_VAT_RATE;
  const subject = input.subjectToVat ?? true;
  const gross = input.marginGrossCents;
  const total = input.costs.eu + input.costs.non_eu;
  const mixed = input.costs.eu > 0 && input.costs.non_eu > 0;

  const nothing = (taxable: number, exempt: number): VatBreakdown => ({
    margin_gross_cents: gross,
    taxable_margin_cents: taxable,
    exempt_margin_cents: exempt,
    vat_cents: 0,
    margin_net_cents: gross,
    rate_percent: rate,
    mixed,
    no_vat_due: true,
  });

  if (!subject) return nothing(0, gross);
  // Une perte ne crée pas de TVA à reverser.
  if (gross <= 0) return nothing(0, 0);

  // Sans aucun coût saisi, il n'y a rien à ventiler : tout est réputé taxable.
  const euShare = total === 0 ? 1 : input.costs.eu / total;
  const taxable = Math.round(gross * euShare);
  const exempt = gross - taxable;
  if (taxable === 0) return nothing(0, exempt);

  // La marge est TTC : la taxe s'en extrait.
  const vat = Math.round((taxable * rate) / (100 + rate));

  return {
    margin_gross_cents: gross,
    taxable_margin_cents: taxable,
    exempt_margin_cents: exempt,
    vat_cents: vat,
    margin_net_cents: gross - vat,
    rate_percent: rate,
    mixed,
    no_vat_due: vat === 0,
  };
}

/** Une phrase pour le devis et pour l'écran, selon le cas rencontré. */
export function describeVat(breakdown: VatBreakdown): string {
  if (breakdown.margin_gross_cents <= 0) return "Aucune TVA : la marge est nulle ou négative.";
  if (breakdown.taxable_margin_cents === 0) {
    return "Prestations exécutées hors UE : marge exonérée de TVA.";
  }
  if (breakdown.mixed) {
    return `Forfait mixte : la marge est ventilée au prorata des coûts d'achat, et la TVA à ${breakdown.rate_percent} % ne porte que sur la part UE.`;
  }
  return `TVA sur marge à ${breakdown.rate_percent} %, extraite de la marge TTC.`;
}
