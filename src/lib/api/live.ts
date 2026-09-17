import { geocodeUrl, parsePlace, type Place } from "./geo";
import { guideUrl, parseGuide, type DestinationGuide } from "./guide";
import { parseRates, ratesUrl, type RateSet } from "./fx";
import { parsePois, poisUrl, type PointOfInterest } from "./poi";
import {
  archiveUrl,
  forecastUrl,
  parseDaily,
  summarise,
  withinForecastRange,
  type WeatherOutlook,
} from "./weather";
import { cachedJson, fetchJson } from "./http";
import type { Currency } from "../money";

/**
 * The server's half of the free services: the same URLs and the same parsers as
 * the phone, fetched with `fetch` and kept in the SQLite cache.
 *
 * The transport lives apart from the parsers on purpose. `geo.ts`, `weather.ts`
 * and their neighbours must stay free of Node and of the database, because the
 * Android bundle imports them and reaches the network through a Java bridge
 * instead. Anything that touches SQLite belongs here; the phone's twin is
 * `mobile/web/api.ts`.
 */

export async function geocode(place: string): Promise<Place | null> {
  const query = place.trim();
  if (!query) return null;

  // Nominatim asks for at most one call a second and for results to be cached;
  // a month is polite and plenty, since a city does not move.
  const { value } = await cachedJson(`geocode:${query.toLowerCase()}`, 24 * 30, () =>
    fetchJson<unknown>(geocodeUrl(query)),
  );
  return parsePlace(value, query);
}

export async function weatherFor(
  place: Place,
  startDate: string,
  endDate: string,
): Promise<WeatherOutlook> {
  if (withinForecastRange(startDate)) {
    const { value } = await cachedJson(
      `forecast:${place.latitude},${place.longitude}:${startDate}:${endDate}`,
      6,
      () => fetchJson<unknown>(forecastUrl(place, startDate, endDate)),
    );
    return summarise(parseDaily(value), "forecast", "Open-Meteo");
  }

  // Too far out for a forecast: the archive stands in for the season.
  const { value } = await cachedJson(
    `normals:${place.latitude},${place.longitude}:${startDate.slice(5, 10)}`,
    24 * 30,
    () => fetchJson<unknown>(archiveUrl(place, startDate, endDate)),
  );
  return summarise(parseDaily(value), "normals", "Open-Meteo (archive)");
}

export async function guideFor(city: string): Promise<DestinationGuide | null> {
  const title = city.trim();
  if (!title) return null;

  const { value } = await cachedJson(`guide:${title.toLowerCase()}`, 24 * 30, () =>
    fetchJson<unknown>(guideUrl(title)),
  );
  return parseGuide(value);
}

export async function ratesFor(base: Currency): Promise<RateSet | null> {
  // One set a day is plenty: the ECB publishes once each working day.
  const { value } = await cachedJson(`fx:${base}`, 12, () =>
    fetchJson<unknown>(ratesUrl(base)),
  );
  return parseRates(value);
}

export async function poisAround(
  place: Place,
  radiusMetres = 6000,
): Promise<PointOfInterest[]> {
  // Overpass is a shared volunteer service; a week of cache per city is polite
  // and plenty, since museums do not move either.
  const { value } = await cachedJson(
    `pois:${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}:${radiusMetres}`,
    24 * 7,
    () => fetchJson<unknown>(poisUrl(place, radiusMetres), { timeoutMs: 25_000 }),
  );
  return parsePois(value);
}
