import { formatMoney, LOCALE, type Currency } from "./money";

/**
 * Les achats payés dans une autre devise.
 *
 * Un réceptif thaïlandais se facture en bahts, un guide marocain en dirhams.
 * Jusqu'ici le produit tenait un seul montant, implicitement dans la devise du
 * dossier : on saisissait un équivalent en euros et l'information d'origine
 * était perdue — introuvable au moment de rapprocher un relevé bancaire, et
 * invérifiable en cas de contrôle.
 *
 * ## Ce qui est stocké, et pourquoi dans cet ordre
 *
 * **`amount_cents` reste la vérité, dans la devise du dossier.** C'est lui que
 * lisent la marge, la TVA, le budget et le tableau de bord — aucun de ces
 * calculs ne change, et aucun n'a besoin de connaître une devise étrangère.
 * Ce qu'on ajoute est un **souvenir** : le montant d'origine, sa devise, et le
 * taux qui s'en déduit.
 *
 * **Le conseiller saisit les deux montants, pas un taux.** C'est délibéré : sa
 * banque lui débite une somme exacte en euros, qu'il lit sur son relevé. Lui
 * demander un taux l'obligerait à faire une division, donc à arrondir, donc à
 * ce que la marge diffère de ce qui est réellement sorti du compte. Le taux se
 * déduit de ce qu'il a saisi ; il sert à l'affichage et à la justification,
 * jamais à recalculer un montant.
 *
 * Rien ici n'appelle un service de change : un taux du jour est une estimation,
 * et la règle 9 vaut aussi pour l'argent qu'on a déjà payé.
 */

/**
 * Les devises dans lesquelles une agence française achète vraiment.
 *
 * Liste fermée plutôt que saisie libre : elle évite les fautes de frappe dans
 * un code ISO, et un code inconnu ferait échouer le formatage à l'affichage.
 */
export const PURCHASE_CURRENCIES = [
  "EUR", "USD", "GBP", "CHF", "AED", "ARS", "AUD", "BRL", "CAD", "CLP", "CNY",
  "COP", "CZK", "DKK", "EGP", "HKD", "HUF", "IDR", "ILS", "INR", "ISK", "JPY",
  "KES", "LKR", "MAD", "MUR", "MXN", "MYR", "NOK", "NPR", "NZD", "PEN", "PLN",
  "RON", "SEK", "SGD", "THB", "TND", "TRY", "TZS", "VND", "ZAR",
] as const;

export type PurchaseCurrency = (typeof PURCHASE_CURRENCIES)[number];

export function isPurchaseCurrency(value: string): value is PurchaseCurrency {
  return (PURCHASE_CURRENCIES as readonly string[]).includes(value);
}

/**
 * Le taux est stocké en milliardièmes.
 *
 * Six décimales ne suffisent pas : le dong vietnamien vaut environ 0,000037 €,
 * ce qui ne laisserait que deux chiffres significatifs. Neuf en laissent assez
 * pour que le taux affiché ressemble à celui du relevé.
 */
export const RATE_SCALE = 1_000_000_000;

/**
 * Le taux qui relie les deux montants saisis.
 *
 * Renvoie 0 quand il n'y a rien à relier — pas d'erreur : un achat dans la
 * devise du dossier n'a pas de taux, et c'est le cas courant.
 */
export function deriveRate(foreignCents: number, baseCents: number): number {
  if (foreignCents <= 0 || baseCents <= 0) return 0;
  // En BigInt : `baseCents * RATE_SCALE` dépasse largement l'entier sûr dès
  // quelques milliers d'euros, et un flottant introduirait une dérive dans un
  // chiffre qui sert de justificatif.
  return Number((BigInt(baseCents) * BigInt(RATE_SCALE)) / BigInt(foreignCents));
}

/** `0,026100` — assez de décimales pour un taux faible, sans zéros inutiles. */
export function formatRate(rateNanos: number): string {
  if (rateNanos <= 0) return "";
  const value = rateNanos / RATE_SCALE;
  const decimals = value >= 1 ? 4 : value >= 0.001 ? 6 : 8;
  return new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Un montant dans n'importe quelle devise d'achat, écrit à la française. */
export function formatForeign(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat(LOCALE, {
      style: "currency",
      currency,
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    // Un code que l'environnement ne connaît pas ne doit pas casser une page.
    return `${(cents / 100).toLocaleString(LOCALE)} ${currency}`;
  }
}

/** Ce qu'une ligne d'achat porte d'origine, quand elle vient d'ailleurs. */
export interface ForeignPurchase {
  foreign_currency: string;
  foreign_amount_cents: number;
  fx_rate_nanos: number;
}

/** Vrai quand la ligne garde le souvenir d'un achat en devise. */
export function hasForeign(
  purchase: Partial<ForeignPurchase> | null | undefined,
): purchase is ForeignPurchase {
  return Boolean(
    purchase?.foreign_currency &&
      purchase.foreign_amount_cents &&
      purchase.foreign_amount_cents > 0,
  );
}

/**
 * La phrase qu'on écrit à côté du montant : « 45 000 THB au taux de 0,026100 ».
 *
 * Le conseiller doit pouvoir retrouver sa ligne de relevé à partir de cette
 * phrase — c'est tout ce qu'on lui promet, et c'est ce qui compte.
 */
export function describePurchase(purchase: ForeignPurchase): string {
  const rate = formatRate(purchase.fx_rate_nanos);
  const original = formatForeign(purchase.foreign_amount_cents, purchase.foreign_currency);
  return rate ? `${original} au taux de ${rate}` : original;
}

/**
 * Ce qu'on a payé, des deux côtés : « 31,20 € · 45 000 THB au taux de … ».
 * Sans achat en devise, c'est simplement le montant du dossier.
 */
export function describeCost(
  baseCents: number,
  currency: Currency,
  purchase: Partial<ForeignPurchase> | null | undefined,
): string {
  const base = formatMoney(baseCents, currency);
  return hasForeign(purchase) ? `${base} · ${describePurchase(purchase)}` : base;
}
