import { geocode, poisAround } from "../api/live";
import { SearchUnavailableError, type SearchProvider, type SearchQuery, type SearchResult } from "./types";

/**
 * Activities from OpenStreetMap — free, no key, no account, and real places.
 *
 * This is the one live provider that needs nothing configured, which is why it
 * is the default for activities. It knows what there is to see; it does not
 * know what it costs, so results carry `price_known: false` and the traveller
 * fills the price in when they book.
 */
export const osmProvider: SearchProvider = {
  id: "openstreetmap",
  label: "OpenStreetMap",
  live: true,
  supports: (kind) => kind === "activity",

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const place = await geocode(
      query.country ? `${query.destination}, ${query.country}` : query.destination,
    );
    if (!place) {
      throw new SearchUnavailableError(`Impossible de situer « ${query.destination} ».`);
    }

    const pois = await poisAround(place);
    return pois.map((poi) => ({
      id: poi.id,
      kind: "activity" as const,
      source: "openstreetmap",
      vendor: poi.name,
      title: poi.name,
      description: `${poi.label} · ${place.name}`,
      start_at: query.start_date,
      end_at: null,
      nights: null,
      price_cents: 0,
      price_known: false,
      currency: "EUR",
      package_price_cents: 0,
      deeplink: poi.website ?? poi.osm_url,
    }));
  },
};
