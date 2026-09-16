import { cachedJson, fetchJson } from "./http";
import type { Currency } from "../money";

/**
 * Exchange rates from Frankfurter — free, no key, published from European
 * Central Bank reference rates.
 *
 * Rates are stored with the amount they converted, never re-applied later: a
 * trip's numbers must not move because the euro did.
 */

export interface RateSet {
  base: string;
  date: string;
  rates: Record<string, number>;
}

/** Pure: Frankfurter's payload into a rate set, or null when unusable. */
export function parseRates(payload: unknown): RateSet | null {
  const body = payload as { base?: string; date?: string; rates?: Record<string, unknown> };
  if (!body?.base || !body?.rates) return null;

  const rates: Record<string, number> = {};
  for (const [code, value] of Object.entries(body.rates)) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      rates[code.toUpperCase()] = value;
    }
  }
  if (Object.keys(rates).length === 0) return null;

  return { base: body.base.toUpperCase(), date: body.date ?? "", rates };
}

/**
 * Converts an amount in cents, rounding once at the end.
 * Returns null when the pair is unknown, rather than guessing.
 */
export function convertCents(
  amountCents: number,
  from: string,
  to: string,
  rates: RateSet,
): number | null {
  const source = from.toUpperCase();
  const target = to.toUpperCase();
  if (source === target) return amountCents;

  const toBase = source === rates.base ? 1 : rates.rates[source];
  const fromBase = target === rates.base ? 1 : rates.rates[target];
  if (!toBase || !fromBase) return null;

  return Math.round((amountCents / toBase) * fromBase);
}

export async function ratesFor(base: Currency): Promise<RateSet | null> {
  const url = `https://api.frankfurter.app/latest?${new URLSearchParams({ from: base })}`;
  // One set a day is plenty: the ECB publishes once each working day.
  const { value } = await cachedJson(`fx:${base}`, 12, () => fetchJson<unknown>(url));
  return parseRates(value);
}
