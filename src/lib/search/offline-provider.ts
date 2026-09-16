import { estimateComponentPackagePrice } from "../package";
import { tripNights } from "../budget";
import type { SearchProvider, SearchQuery, SearchResult } from "./types";

/**
 * A provider that works without a network, so the search flow is complete and
 * testable with no account and no API key.
 *
 * It does NOT return real offers. Prices are plausible figures derived from the
 * query itself — the same query always gives the same answers — so people can
 * try the feature and shape a budget before a real provider is connected. Every
 * screen that shows these results says where they come from, and `live` is
 * false so nothing can mistake them for something bookable.
 */

const AIRLINES = [
  "Air France",
  "Transavia",
  "easyJet",
  "Vueling",
  "Lufthansa",
  "KLM",
  "Ryanair",
  "ITA Airways",
];

const STAY_STYLES = [
  { name: "Appartement centre-ville", nightly: [55, 140] },
  { name: "Hôtel 3 étoiles", nightly: [65, 130] },
  { name: "Hôtel de charme", nightly: [95, 220] },
  { name: "Chambre chez l'habitant", nightly: [35, 80] },
  { name: "Auberge", nightly: [22, 55] },
];

const ACTIVITIES = [
  { name: "Visite guidée à pied", price: [12, 35] },
  { name: "Musée et collections", price: [9, 28] },
  { name: "Excursion à la journée", price: [45, 120] },
  { name: "Atelier cuisine locale", price: [40, 95] },
  { name: "Balade en bateau", price: [25, 70] },
  { name: "Location de vélos", price: [12, 30] },
];

/** Deterministic hash, so a query always produces the same list. */
function hash(seed: string): number {
  let value = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    value ^= seed.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** mulberry32 — small, fast, and good enough for plausible prices. */
function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(random: () => number, low: number, high: number): number {
  return Math.round((low + random() * (high - low)) * 100);
}

function queryKey(query: SearchQuery): string {
  return [
    query.kind,
    query.origin ?? "",
    query.destination,
    query.start_date,
    query.end_date ?? "",
    query.travellers,
  ]
    .join("|")
    .toLowerCase();
}

function build(
  query: SearchQuery,
  index: number,
  fields: Omit<SearchResult, "id" | "kind" | "source" | "currency" | "package_price_cents">,
): SearchResult {
  return {
    id: `offline:${hash(`${queryKey(query)}#${index}`).toString(36)}`,
    kind: query.kind,
    source: "offline",
    currency: "EUR",
    package_price_cents: estimateComponentPackagePrice(query.kind, fields.price_cents),
    ...fields,
  };
}

function searchFlights(query: SearchQuery): SearchResult[] {
  const random = rng(hash(queryKey(query)));
  const travellers = Math.max(1, query.travellers);
  const origin = query.origin?.trim() || "votre ville";

  return Array.from({ length: 4 }, (_, index) => {
    const airline = AIRLINES[Math.floor(random() * AIRLINES.length)];
    const perSeat = between(random, 48, 260);
    const stops = random() < 0.45 ? 1 : 0;
    // A connection is cheaper and longer — the trade-off people actually weigh.
    const price = Math.round(perSeat * travellers * (stops === 1 ? 0.82 : 1));

    return build(query, index, {
      vendor: airline,
      title: `${origin} → ${query.destination}`,
      description: `${stops === 0 ? "Direct" : "1 escale"} · aller-retour · ${travellers} voyageur${travellers > 1 ? "s" : ""}`,
      start_at: query.start_date,
      end_at: query.end_date ?? null,
      nights: null,
      price_cents: price,
    });
  }).sort((a, b) => a.price_cents - b.price_cents);
}

function searchStays(query: SearchQuery): SearchResult[] {
  const random = rng(hash(queryKey(query)));
  const nights = Math.max(
    1,
    query.end_date ? tripNights({ start_date: query.start_date, end_date: query.end_date }) : 1,
  );

  return Array.from({ length: 4 }, (_, index) => {
    const style = STAY_STYLES[Math.floor(random() * STAY_STYLES.length)];
    const nightly = between(random, style.nightly[0], style.nightly[1]);

    return build(query, index, {
      vendor: `${style.name} · ${query.destination}`,
      title: style.name,
      description: `${nights} nuit${nights > 1 ? "s" : ""} · ${Math.round(nightly / 100)} € la nuit`,
      start_at: query.start_date,
      end_at: query.end_date ?? null,
      nights,
      price_cents: nightly * nights,
    });
  }).sort((a, b) => a.price_cents - b.price_cents);
}

function searchActivities(query: SearchQuery): SearchResult[] {
  const random = rng(hash(queryKey(query)));
  const travellers = Math.max(1, query.travellers);

  return Array.from({ length: 5 }, (_, index) => {
    const activity = ACTIVITIES[Math.floor(random() * ACTIVITIES.length)];
    const perPerson = between(random, activity.price[0], activity.price[1]);

    return build(query, index, {
      vendor: `${activity.name} à ${query.destination}`,
      title: activity.name,
      description: `${travellers} participant${travellers > 1 ? "s" : ""} · ${Math.round(perPerson / 100)} € par personne`,
      start_at: query.start_date,
      end_at: null,
      nights: null,
      price_cents: perPerson * travellers,
    });
  }).sort((a, b) => a.price_cents - b.price_cents);
}

export const offlineProvider: SearchProvider = {
  id: "offline",
  label: "Estimations hors ligne",
  live: false,
  supports: () => true,
  async search(query: SearchQuery): Promise<SearchResult[]> {
    switch (query.kind) {
      case "flight":
        return searchFlights(query);
      case "stay":
        return searchStays(query);
      case "activity":
        return searchActivities(query);
    }
  },
};
