
/**
 * Place lookup through Nominatim (OpenStreetMap) — free, no key, no account.
 *
 * Their usage policy asks for an identifying User-Agent, at most one call per
 * second, and that results be cached — which the two callers honour:
 * `api/live.ts` on the server, `mobile/web/api.ts` on the phone.
 *
 * This module holds only the URL and the parser, with no transport and no
 * database, so the Android bundle can import it as-is.
 */

export interface Place {
  name: string;
  country: string;
  /** ISO 3166-1 alpha-2, upper case; "" when Nominatim did not say. */
  country_code: string;
  latitude: number;
  longitude: number;
}

interface NominatimRow {
  display_name?: string;
  lat?: string;
  lon?: string;
  name?: string;
  address?: { country?: string; country_code?: string };
}

/** Pure: turns a Nominatim payload into a Place, or null when unusable. */
export function parsePlace(payload: unknown, fallbackName: string): Place | null {
  const rows = Array.isArray(payload) ? (payload as NominatimRow[]) : [];
  const row = rows[0];
  if (!row) return null;

  const latitude = Number(row.lat);
  const longitude = Number(row.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return {
    name: row.name?.trim() || row.display_name?.split(",")[0]?.trim() || fallbackName,
    country: row.address?.country?.trim() ?? "",
    country_code: (row.address?.country_code ?? "").toUpperCase(),
    latitude,
    longitude,
  };
}

/** The request, separated from the transport: the Android build reuses it. */
export function geocodeUrl(place: string): string {
  return (
    "https://nominatim.openstreetmap.org/search?" +
    new URLSearchParams({
      q: place.trim(),
      format: "jsonv2",
      addressdetails: "1",
      limit: "1",
      "accept-language": "fr",
    })
  );
}
