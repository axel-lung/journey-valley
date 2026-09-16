import { LOCALE } from "./money";

/**
 * Dates as a French traveller reads them. Everything stored is an ISO date
 * (`AAAA-MM-JJ`); nothing here ever writes one back, so these helpers are for
 * display only.
 */

function parse(iso: string): Date | null {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** `2026-10-12` → `12 oct. 2026` */
export function formatDate(iso: string, options: Intl.DateTimeFormatOptions = {}): string {
  const date = parse(iso);
  if (!date) return iso;
  return date.toLocaleDateString(LOCALE, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...options,
  });
}

/** `12 oct.` — the year is dropped when the context already carries it. */
export function formatDateShort(iso: string): string {
  return formatDate(iso, { year: undefined });
}

/**
 * `12 – 21 oct. 2026`, collapsing whatever the two dates share.
 * A single-day trip comes back as one date.
 */
export function formatDateRange(startIso: string, endIso: string): string {
  const start = parse(startIso);
  const end = parse(endIso);
  if (!start || !end) return `${startIso} → ${endIso}`;
  if (startIso.slice(0, 10) === endIso.slice(0, 10)) return formatDate(startIso);

  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

  if (sameMonth) {
    return `${start.getUTCDate()} – ${formatDate(endIso)}`;
  }
  if (sameYear) {
    return `${formatDateShort(startIso)} – ${formatDate(endIso)}`;
  }
  return `${formatDate(startIso)} – ${formatDate(endIso)}`;
}

/** Whole days from today to `iso`; negative once the date has passed. */
export function daysUntil(iso: string, from: Date = new Date()): number {
  const target = parse(iso);
  if (!target) return 0;
  const today = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  return Math.round((target.getTime() - today) / 86_400_000);
}

export interface Countdown {
  days: number;
  label: string;
  /** True while the trip is ahead — the only case worth a badge. */
  upcoming: boolean;
}

/**
 * The line a traveller actually wants: how long until they leave.
 * Past departures say how long ago instead.
 */
export function countdown(startIso: string, endIso: string, from: Date = new Date()): Countdown {
  const toStart = daysUntil(startIso, from);
  const toEnd = daysUntil(endIso, from);

  if (toStart > 0) {
    const label =
      toStart === 1 ? "Départ demain" : toStart <= 60 ? `J − ${toStart}` : `Dans ${Math.round(toStart / 30)} mois`;
    return { days: toStart, label, upcoming: true };
  }
  if (toStart === 0) return { days: 0, label: "Départ aujourd'hui", upcoming: true };
  if (toEnd >= 0) return { days: toStart, label: "En voyage", upcoming: true };

  const ago = -toEnd;
  const label =
    ago === 1 ? "Rentré hier" : ago < 30 ? `Rentré il y a ${ago} jours` : `Rentré il y a ${Math.round(ago / 30)} mois`;
  return { days: toStart, label, upcoming: false };
}

/** `3 nuits`, `1 nuit`, `aller-retour dans la journée`. */
export function formatNights(nights: number): string {
  if (nights <= 0) return "aller-retour dans la journée";
  return `${nights} nuit${nights > 1 ? "s" : ""}`;
}

/** `2 voyageurs` / `1 voyageur`. */
export function formatTravellers(count: number): string {
  return `${count} voyageur${count > 1 ? "s" : ""}`;
}

/** Initials for an avatar bubble, at most two letters. */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}
