/**
 * All monetary values are stored as integer minor units ("cents") to avoid
 * floating point drift. Nothing in the app should ever multiply or add a
 * currency amount that is not a whole number of cents.
 */

export type Currency = "EUR" | "USD" | "GBP" | "CHF";

export const SUPPORTED_CURRENCIES: Currency[] = ["EUR", "USD", "GBP", "CHF"];

export function isCurrency(value: string): value is Currency {
  return (SUPPORTED_CURRENCIES as string[]).includes(value);
}

/**
 * Parses a human typed amount ("1 234,56", "1,234.56", "89") into cents.
 * Returns null when the input cannot be read as a positive amount.
 */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  // Strip currency symbols, spaces and non-breaking spaces used as separators.
  let normalized = trimmed.replace(/[\s  €$£]/g, "");

  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");

  if (lastComma !== -1 && lastDot !== -1) {
    // The right-most separator is the decimal one, the other groups thousands.
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, "").replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (lastComma !== -1) {
    const decimals = normalized.length - lastComma - 1;
    // "1,234" is a thousands group; "12,34" is a decimal comma.
    normalized = decimals === 3 ? normalized.replace(/,/g, "") : normalized.replace(",", ".");
  }

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;

  return Math.round(value * 100);
}

/** The app speaks French, so amounts are formatted French: 1 500 €. */
export const LOCALE = "fr-FR";

export function formatMoney(cents: number, currency: Currency = "EUR"): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/** Compact form for tiles: 1,2 k€, 340 k€. */
export function formatMoneyCompact(cents: number, currency: Currency = "EUR"): string {
  return new Intl.NumberFormat(LOCALE, {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(cents / 100);
}

export function sumCents(values: Array<{ amount_cents: number }>): number {
  return values.reduce((total, item) => total + item.amount_cents, 0);
}

/** Percentage of `part` within `whole`, clamped to [0, 100]; 0 when whole is 0. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((part / whole) * 100)));
}
