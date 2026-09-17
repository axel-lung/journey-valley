/**
 * The phone's half of the free services.
 *
 * The URLs and the parsers are the web app's — imported, not copied — so a fix
 * to either lands on both builds. Only the transport differs: the server has
 * SQLite and `fetch`, the phone has the Java bridge and its own cache.
 */
import { geocodeUrl, parsePlace, type Place } from "../../src/lib/api/geo";
import { guideUrl, parseGuide, type DestinationGuide } from "../../src/lib/api/guide";
import { convertCents, parseRates, ratesUrl, type RateSet } from "../../src/lib/api/fx";
import { parsePois, poisUrl, type PointOfInterest } from "../../src/lib/api/poi";
import {
  archiveUrl,
  forecastUrl,
  parseDaily,
  summarise,
  withinForecastRange,
  type WeatherOutlook,
} from "../../src/lib/api/weather";
import { estimateComponentPackagePrice } from "../../src/lib/package";
import { countryCodeFromName, practicalFor, type PracticalInfo } from "../../src/lib/practical";
import { cachedJson, networkAllowed } from "./net";
import { CURRENCY } from "./store";

export async function geocode(place: string): Promise<Place | null> {
  const query = place.trim();
  if (!query) return null;

  const payload = await cachedJson<unknown>(
    `geocode:${query.toLowerCase()}`,
    24 * 30,
    geocodeUrl(query),
  );
  return parsePlace(payload, query);
}

export async function weatherFor(
  place: Place,
  startDate: string,
  endDate: string,
): Promise<WeatherOutlook> {
  if (withinForecastRange(startDate)) {
    const payload = await cachedJson<unknown>(
      `forecast:${place.latitude},${place.longitude}:${startDate}:${endDate}`,
      6,
      forecastUrl(place, startDate, endDate),
    );
    return summarise(parseDaily(payload), "forecast", "Open-Meteo");
  }

  const payload = await cachedJson<unknown>(
    `normals:${place.latitude},${place.longitude}:${startDate.slice(5, 10)}`,
    24 * 30,
    archiveUrl(place, startDate, endDate),
  );
  return summarise(parseDaily(payload), "normals", "Open-Meteo (archive)");
}

export async function guideFor(city: string): Promise<DestinationGuide | null> {
  const title = city.trim();
  if (!title) return null;

  const payload = await cachedJson<unknown>(
    `guide:${title.toLowerCase()}`,
    24 * 30,
    guideUrl(title),
  );
  return parseGuide(payload);
}

export async function poisAround(place: Place): Promise<PointOfInterest[]> {
  const payload = await cachedJson<unknown>(
    `pois:${place.latitude.toFixed(3)},${place.longitude.toFixed(3)}`,
    24 * 7,
    poisUrl(place),
  );
  return parsePois(payload);
}

export async function ratesFor(base: string): Promise<RateSet | null> {
  const payload = await cachedJson<unknown>(`fx:${base}`, 12, ratesUrl(base));
  return parseRates(payload);
}

/* ------------------------------------------------------------- destination */

export interface MobileDossier {
  place: Place | null;
  weather: WeatherOutlook | null;
  guide: DestinationGuide | null;
  pois: PointOfInterest[];
  exchange: { local_currency: string; rate: number; date: string } | null;
  practical: PracticalInfo | null;
  missing: string[];
  /** True when nothing was fetched because the network is off or refused. */
  offline: boolean;
}

/**
 * Builds the destination file, never throwing: a half-filled file is still
 * worth reading, and the caller is told what is missing. The practical sheet
 * is local, so it is there even with the network switched off.
 */
export async function buildDossier(trip: {
  destination_city: string;
  destination_country: string;
  start_date: string;
  end_date: string;
}): Promise<MobileDossier> {
  const practical = practicalFor(
    countryCodeFromName(trip.destination_country) ?? trip.destination_country,
  );

  if (!networkAllowed()) {
    return {
      place: null,
      weather: null,
      guide: null,
      pois: [],
      exchange: null,
      practical,
      missing: ["Météo", "Présentation", "Lieux à voir", "Taux de change"],
      offline: true,
    };
  }

  const missing: string[] = [];
  const place = await geocode(
    trip.destination_country
      ? `${trip.destination_city}, ${trip.destination_country}`
      : trip.destination_city,
  ).catch(() => null);
  if (!place) missing.push("Localisation");

  const [weather, guide, pois, rates] = await Promise.all([
    place ? weatherFor(place, trip.start_date, trip.end_date).catch(() => null) : null,
    guideFor(trip.destination_city).catch(() => null),
    place ? poisAround(place).catch(() => [] as PointOfInterest[]) : [],
    ratesFor(CURRENCY).catch(() => null),
  ]);

  if (!weather) missing.push("Météo");
  if (!guide) missing.push("Présentation");
  if (pois.length === 0) missing.push("Lieux à voir");

  const local = practical?.currency ?? null;
  let exchange: MobileDossier["exchange"] = null;

  if (rates && local && local !== CURRENCY) {
    const rate = convertCents(100_000, CURRENCY, local, rates);
    if (rate !== null) {
      exchange = { local_currency: local, rate: rate / 100_000, date: rates.date };
    } else {
      missing.push("Taux de change");
    }
  } else if (local && local !== CURRENCY) {
    missing.push("Taux de change");
  }

  return { place, weather, guide, pois, exchange, practical, missing, offline: false };
}

/** Le prix de revente habituel d'une prestation, pour le repère de prix. */
export { estimateComponentPackagePrice };
