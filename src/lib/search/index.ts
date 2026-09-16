import { amadeusConfigured, amadeusProvider } from "./amadeus-provider";
import { offlineProvider } from "./offline-provider";
import { osmProvider } from "./osm-provider";
import { SearchUnavailableError, type SearchKind, type SearchProvider, type SearchQuery, type SearchResult } from "./types";

export type { SearchKind, SearchProvider, SearchQuery, SearchResult };
export { SearchUnavailableError };

/**
 * Picks the provider for a kind of search: a live one when it is configured and
 * covers that kind, the offline estimator otherwise. Nothing else in the app
 * needs to know which provider answered — every result carries its `source`.
 */
export function providerFor(kind: SearchKind): SearchProvider {
  // An escape hatch for tests and for running without any outbound network.
  if (process.env.JV_DISABLE_LIVE_APIS === "1") return offlineProvider;

  if (amadeusConfigured() && amadeusProvider.supports(kind)) return amadeusProvider;
  // OpenStreetMap needs no key at all, so activities get real places by default.
  if (osmProvider.supports(kind)) return osmProvider;
  return offlineProvider;
}

export interface SearchOutcome {
  results: SearchResult[];
  provider: { id: string; label: string; live: boolean };
  /** Set when a live provider failed and the offline estimates stood in. */
  fallback_reason?: string;
}

/**
 * Runs a search, and falls back to the offline estimates when a live provider
 * is down, rate-limited or misconfigured — a trip being planned should not stop
 * because an API is having a bad afternoon. The outcome always says which
 * provider actually answered.
 */
export async function runSearch(query: SearchQuery): Promise<SearchOutcome> {
  const provider = providerFor(query.kind);

  try {
    const results = await provider.search(query);
    if (results.length > 0 || !provider.live) {
      return {
        results,
        provider: { id: provider.id, label: provider.label, live: provider.live },
      };
    }
    // A live provider that found nothing: offer estimates rather than a blank.
    const estimates = await offlineProvider.search(query);
    return {
      results: estimates,
      provider: { id: offlineProvider.id, label: offlineProvider.label, live: false },
      fallback_reason: `${provider.label} n'a trouvé aucune offre pour ces dates.`,
    };
  } catch (error) {
    if (!provider.live) throw error;

    const estimates = await offlineProvider.search(query);
    return {
      results: estimates,
      provider: { id: offlineProvider.id, label: offlineProvider.label, live: false },
      fallback_reason:
        error instanceof SearchUnavailableError
          ? error.message
          : `${provider.label} est injoignable pour l'instant.`,
    };
  }
}
