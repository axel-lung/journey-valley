import type { BookingType } from "../types";

export type SearchKind = Extract<BookingType, "flight" | "stay" | "activity">;

export interface SearchQuery {
  kind: SearchKind;
  /** Where you leave from; only flights need it. */
  origin?: string;
  destination: string;
  country?: string;
  start_date: string;
  end_date?: string;
  travellers: number;
}

export interface SearchResult {
  /** Stable for a given query, so importing twice cannot duplicate a line. */
  id: string;
  kind: SearchKind;
  vendor: string;
  title: string;
  description: string;
  start_at: string;
  end_at: string | null;
  nights: number | null;
  price_cents: number;
  /**
   * False when the provider knows the place but not what it costs — a museum
   * from OpenStreetMap, say. The interface asks for the price instead of
   * inventing one, and price alerts ignore these.
   */
  price_known: boolean;
  currency: string;
  /** What the same component tends to cost inside a package — an estimate. */
  package_price_cents: number;
  /** Which provider produced it, so the UI can be honest about the source. */
  source: string;
  /** Where to actually book it, when the provider gives a link. */
  deeplink?: string;
}

export interface SearchProvider {
  id: string;
  label: string;
  /**
   * True when results are real offers from a live provider. The offline
   * provider returns false, and the UI must never present its numbers as
   * bookable prices.
   */
  live: boolean;
  supports(kind: SearchKind): boolean;
  search(query: SearchQuery): Promise<SearchResult[]>;
}

export class SearchUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SearchUnavailableError";
  }
}
