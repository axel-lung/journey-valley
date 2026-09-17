import type { Booking, Trip, TripStage } from "./types";

/**
 * La marge, du point de vue de l'agence.
 *
 * Chaque ligne d'un dossier porte déjà deux montants : `amount_cents`, ce que
 * l'agence paie au fournisseur, et `agency_quote_cents`, ce que le client paie.
 * Tout ce qui suit en découle — il n'y a rien de nouveau à saisir.
 *
 * Deux taux circulent dans le métier et on les confond souvent :
 *
 * - le **taux de marque** = marge / prix de vente. C'est celui dont parlent les
 *   agences (« je fais 12 % sur ce dossier ») et celui qu'on affiche ;
 * - le **taux de marge** = marge / coût d'achat. Plus grand, à la même marge.
 *
 * Les deux sont calculés : se tromper de dénominateur, c'est se tromper de prix.
 * Tout est en centimes, et rien ici ne touche à la base ni à React, pour que le
 * même calcul serve la page, le devis PDF et les tests.
 */

export interface Margin {
  /** Ce que l'agence paie aux fournisseurs. */
  cost_cents: number;
  /** Ce que le client paie. */
  sell_cents: number;
  margin_cents: number;
  /** Taux de marque : marge / vente, arrondi au point. */
  margin_percent: number;
  /** Taux de marge : marge / coût, arrondi au point. */
  markup_percent: number;
}

export type MarginBasis =
  /** Un prix de vente global est posé sur le dossier : c'est lui qui fait foi. */
  | "package"
  /** Pas de forfait : la vente est la somme des lignes valorisées. */
  | "lines"
  /** Rien n'est encore vendu. */
  | "none";

export interface DossierMargin extends Margin {
  basis: MarginBasis;
  lines: number;
  /** Lignes sans prix de vente : elles pèsent sur le coût, pas sur la vente. */
  unpriced_lines: number;
  /**
   * Vrai quand la marge affichée n'est pas le résultat final. Deux cas, opposés
   * et tous deux dangereux à annoncer :
   *
   * - au détail, une ligne sans prix de vente tire la marge vers le bas : le
   *   chiffre est un plancher ;
   * - au forfait, tant que le dossier n'est pas réservé, les achats ne sont pas
   *   tous saisis : le chiffre est un plafond, et c'est le plus traître — il
   *   fait croire à une marge qu'on n'a pas encore payée.
   */
  partial: boolean;
  /** Dans quel sens le chiffre est faux, pour que l'écran puisse le dire. */
  partial_reason: "none" | "unpriced_lines" | "purchases_incomplete";
}

/** Étapes où les achats du dossier sont réputés tous saisis. */
const PURCHASED_STAGES: readonly TripStage[] = ["booked", "travelling", "completed"];

/**
 * Vrai quand le dossier a fini d'acheter : sa marge est un résultat, pas une
 * prévision, et elle peut entrer dans le chiffre de l'agence.
 */
export function purchasesComplete(stage: TripStage): boolean {
  return PURCHASED_STAGES.includes(stage);
}

function rate(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 100);
}

function build(costCents: number, sellCents: number): Margin {
  const margin = sellCents - costCents;
  return {
    cost_cents: costCents,
    sell_cents: sellCents,
    margin_cents: margin,
    margin_percent: rate(margin, sellCents),
    markup_percent: rate(margin, costCents),
  };
}

/** Ce que rapporte une ligne. Sans prix de vente, elle ne rapporte rien. */
export function lineMargin(booking: Pick<Booking, "amount_cents" | "agency_quote_cents">): Margin {
  const sell = booking.agency_quote_cents > 0 ? booking.agency_quote_cents : 0;
  return build(booking.amount_cents, sell);
}

/**
 * Ce que rapporte un dossier.
 *
 * Un prix de vente posé sur le dossier l'emporte sur la somme des lignes :
 * c'est un forfait négocié, et c'est ce que le client paiera, quelles que
 * soient les lignes derrière.
 */
export function dossierMargin(
  trip: Pick<Trip, "agency_quote_cents" | "stage">,
  bookings: Array<Pick<Booking, "amount_cents" | "agency_quote_cents">>,
): DossierMargin {
  const cost = bookings.reduce((total, booking) => total + booking.amount_cents, 0);
  const priced = bookings.filter((booking) => booking.agency_quote_cents > 0);
  const unpriced = bookings.length - priced.length;

  if (trip.agency_quote_cents > 0) {
    // Le forfait couvre tout le séjour ; les achats, eux, arrivent au fil des
    // réservations. Tant que le dossier n'est pas réservé, la marge est un
    // plafond : c'est l'erreur qui fait vendre trop bas sans s'en apercevoir.
    const purchasesIn = PURCHASED_STAGES.includes(trip.stage);
    return {
      ...build(cost, trip.agency_quote_cents),
      basis: "package",
      lines: bookings.length,
      unpriced_lines: unpriced,
      partial: !purchasesIn,
      partial_reason: purchasesIn ? "none" : "purchases_incomplete",
    };
  }

  const sell = priced.reduce((total, booking) => total + booking.agency_quote_cents, 0);
  return {
    ...build(cost, sell),
    basis: sell > 0 ? "lines" : "none",
    lines: bookings.length,
    unpriced_lines: unpriced,
    partial: unpriced > 0,
    partial_reason: unpriced > 0 ? "unpriced_lines" : "none",
  };
}

/**
 * Le prix de vente qui atteint un taux de marque donné.
 *
 * On divise par (1 − taux), on ne multiplie pas par (1 + taux) : vendre un
 * achat de 1 000 € à 1 150 € ne fait pas 15 % de marque mais 13 %. C'est
 * l'erreur qui coûte le plus cher dans ce métier.
 */
export function sellPriceFor(costCents: number, targetMarginPercent: number): number {
  const target = Math.min(Math.max(targetMarginPercent, 0), 95);
  if (costCents <= 0) return 0;
  return Math.round(costCents / (1 - target / 100));
}

/** Arrondi commercial : un devis se présente à l'euro, pas au centime. */
export function roundToEuro(cents: number): number {
  return Math.round(cents / 100) * 100;
}

export interface PeriodMargin extends Margin {
  /** Mois du départ, au format AAAA-MM. */
  month: string;
  files: number;
}

/**
 * Le chiffre d'affaires et la marge, mois par mois, par date de départ.
 *
 * Une agence raisonne en saison : ce qui part en février se prépare en
 * novembre, et c'est le départ qui fixe la période comptable du dossier.
 */
export function marginByMonth(
  files: Array<{ start_date: string; margin: Margin }>,
): PeriodMargin[] {
  const months = new Map<string, { cost: number; sell: number; files: number }>();

  for (const file of files) {
    const month = file.start_date.slice(0, 7);
    if (!month) continue;
    const bucket = months.get(month) ?? { cost: 0, sell: 0, files: 0 };
    bucket.cost += file.margin.cost_cents;
    bucket.sell += file.margin.sell_cents;
    bucket.files += 1;
    months.set(month, bucket);
  }

  return [...months.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, bucket]) => ({ month, files: bucket.files, ...build(bucket.cost, bucket.sell) }));
}

/** Additionne des dossiers en un seul résultat. */
export function totalMargin(margins: Margin[]): Margin {
  return build(
    margins.reduce((total, margin) => total + margin.cost_cents, 0),
    margins.reduce((total, margin) => total + margin.sell_cents, 0),
  );
}
