import { estimateComponentPackagePrice } from "../package";
import { SearchUnavailableError, type SearchProvider, type SearchQuery, type SearchResult } from "./types";

/**
 * Amadeus Self-Service — the live flight provider.
 *
 * It switches on only when AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET are set;
 * without them the app falls back to the offline provider. Written against the
 * documented v1/v2 endpoints:
 *
 *   POST /v1/security/oauth2/token            client_credentials → access token
 *   GET  /v1/reference-data/locations         city or airport name → IATA code
 *   GET  /v2/shopping/flight-offers           the offers themselves
 *
 * Amadeus is unreachable from the sandbox this was written in, so this adapter
 * has never been run against the real service: treat the first live call as
 * something to watch. Everything around it — the provider interface, the
 * import flow, the price watches — is exercised by the offline provider.
 *
 * Stays and activities are not covered: Amadeus hotel search needs a property
 * list per city first, and activities are a different product. `supports()`
 * says so, and the registry falls back for those kinds.
 */

const HOSTS = {
  test: "https://test.api.amadeus.com",
  production: "https://api.amadeus.com",
};

interface Token {
  value: string;
  /** Epoch milliseconds; refreshed a minute early to avoid racing expiry. */
  expires_at: number;
}

let cachedToken: Token | null = null;

function host(): string {
  return process.env.AMADEUS_ENV === "production" ? HOSTS.production : HOSTS.test;
}

export function amadeusConfigured(): boolean {
  return Boolean(process.env.AMADEUS_CLIENT_ID && process.env.AMADEUS_CLIENT_SECRET);
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires_at > Date.now()) return cachedToken.value;

  const response = await fetch(`${host()}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AMADEUS_CLIENT_ID ?? "",
      client_secret: process.env.AMADEUS_CLIENT_SECRET ?? "",
    }),
  });

  if (!response.ok) {
    throw new SearchUnavailableError(
      `Amadeus a refusé les identifiants (HTTP ${response.status}).`,
    );
  }

  const body = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new SearchUnavailableError("Amadeus n'a pas renvoyé de jeton.");

  cachedToken = {
    value: body.access_token,
    expires_at: Date.now() + Math.max(60, (body.expires_in ?? 1799) - 60) * 1000,
  };
  return cachedToken.value;
}

async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const token = await accessToken();
  const url = `${host()}${path}?${new URLSearchParams(params)}`;

  const response = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  if (response.status === 429) {
    throw new SearchUnavailableError("Trop de recherches d'affilée — réessayez dans un instant.");
  }
  if (!response.ok) {
    throw new SearchUnavailableError(`Amadeus a répondu HTTP ${response.status}.`);
  }
  return response.json();
}

/** City or airport name → IATA code. Cached per process; these never change. */
const codeCache = new Map<string, string | null>();

export async function resolveIataCode(place: string): Promise<string | null> {
  const key = place.trim().toLowerCase();
  if (!key) return null;
  if (codeCache.has(key)) return codeCache.get(key) ?? null;

  // Someone who already knows the code should not be sent through a lookup.
  if (/^[a-z]{3}$/.test(key)) {
    codeCache.set(key, key.toUpperCase());
    return key.toUpperCase();
  }

  const body = (await get("/v1/reference-data/locations", {
    keyword: place.trim(),
    subType: "CITY,AIRPORT",
    "page[limit]": "1",
  })) as { data?: Array<{ iataCode?: string }> };

  const code = body.data?.[0]?.iataCode ?? null;
  codeCache.set(key, code);
  return code;
}

interface AmadeusOffer {
  id?: string;
  price?: { grandTotal?: string; currency?: string };
  itineraries?: Array<{ segments?: Array<{ carrierCode?: string; departure?: { at?: string } }> }>;
}

function toResult(query: SearchQuery, offer: AmadeusOffer, carriers: Record<string, string>): SearchResult | null {
  const total = Number(offer.price?.grandTotal);
  if (!Number.isFinite(total) || total <= 0) return null;

  const outbound = offer.itineraries?.[0]?.segments ?? [];
  const carrierCode = outbound[0]?.carrierCode ?? "";
  const stops = Math.max(0, outbound.length - 1);
  const priceCents = Math.round(total * 100);

  return {
    id: `amadeus:${offer.id ?? `${carrierCode}-${priceCents}`}`,
    kind: "flight",
    source: "amadeus",
    vendor: carriers[carrierCode] ?? carrierCode ?? "Compagnie",
    title: `${query.origin ?? ""} → ${query.destination}`.trim(),
    description: `${stops === 0 ? "Direct" : `${stops} escale${stops > 1 ? "s" : ""}`} · ${query.travellers} voyageur${query.travellers > 1 ? "s" : ""}`,
    start_at: query.start_date,
    end_at: query.end_date ?? null,
    nights: null,
    price_cents: priceCents,
    price_known: true,
    currency: offer.price?.currency ?? "EUR",
    package_price_cents: estimateComponentPackagePrice("flight", priceCents),
  };
}

export const amadeusProvider: SearchProvider = {
  id: "amadeus",
  label: "Amadeus",
  live: true,
  supports: (kind) => kind === "flight",

  async search(query: SearchQuery): Promise<SearchResult[]> {
    if (!amadeusConfigured()) {
      throw new SearchUnavailableError("Amadeus n'est pas configuré.");
    }
    if (!query.origin) {
      throw new SearchUnavailableError("Indiquez la ville de départ pour chercher un vol.");
    }

    const [origin, destination] = await Promise.all([
      resolveIataCode(query.origin),
      resolveIataCode(query.destination),
    ]);
    if (!origin || !destination) {
      throw new SearchUnavailableError(
        "Impossible de reconnaître l'aéroport de départ ou d'arrivée.",
      );
    }

    const params: Record<string, string> = {
      originLocationCode: origin,
      destinationLocationCode: destination,
      departureDate: query.start_date,
      adults: String(Math.max(1, Math.min(9, query.travellers))),
      currencyCode: "EUR",
      max: "5",
    };
    if (query.end_date && query.end_date > query.start_date) {
      params.returnDate = query.end_date;
    }

    const body = (await get("/v2/shopping/flight-offers", params)) as {
      data?: AmadeusOffer[];
      dictionaries?: { carriers?: Record<string, string> };
    };

    return (body.data ?? [])
      .map((offer) => toResult(query, offer, body.dictionaries?.carriers ?? {}))
      .filter((result): result is SearchResult => result !== null)
      .sort((a, b) => a.price_cents - b.price_cents);
  },
};
