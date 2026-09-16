import { geocode, type Place } from "./api/geo";
import { guideFor, type DestinationGuide } from "./api/guide";
import { convertCents, ratesFor, type RateSet } from "./api/fx";
import { poisAround, type PointOfInterest } from "./api/poi";
import { weatherFor, type WeatherOutlook } from "./api/weather";
import type { Currency } from "./money";
import { countryCodeFromName, practicalFor, type PracticalInfo } from "./practical";
import type { Trip } from "./types";

/**
 * The destination file an agency would hand you: where it is, what the weather
 * does then, what a euro is worth there, what there is to see, and the
 * practical page.
 *
 * Every part is optional. The services behind them are free and volunteer-run,
 * so any of them can be down — and the app is expected to run with no outbound
 * network at all. Whatever is missing is named in `missing`, and the interface
 * says so rather than pretending the section does not exist.
 */

export interface Dossier {
  place: Place | null;
  weather: WeatherOutlook | null;
  guide: DestinationGuide | null;
  pois: PointOfInterest[];
  exchange: {
    local_currency: string;
    /** One unit of the traveller's currency buys this much locally. */
    rate: number;
    date: string;
    /** A concrete example, because a rate alone means little. */
    example_local_cents: number;
  } | null;
  practical: PracticalInfo | null;
  /** Human-readable names of the parts that could not be built. */
  missing: string[];
}

const EMPTY: Dossier = {
  place: null,
  weather: null,
  guide: null,
  pois: [],
  exchange: null,
  practical: null,
  missing: [],
};

function localCurrency(trip: Trip, place: Place | null, practical: PracticalInfo | null): string | null {
  if (practical) return practical.currency;
  if (place?.country_code) return practicalFor(place.country_code)?.currency ?? null;
  return null;
}

/**
 * Builds the dossier for a trip. Never throws: a dossier that is half empty is
 * still worth showing, and the caller gets the list of what is missing.
 */
export async function buildDossier(trip: Trip, travellerCurrency: Currency): Promise<Dossier> {
  if (process.env.JV_DISABLE_LIVE_APIS === "1") {
    // Offline: the curated practical sheet is still worth having.
    const code =
      countryCodeFromName(trip.destination_country) ?? trip.destination_country.toUpperCase();
    const practical = practicalFor(code);
    return {
      ...EMPTY,
      practical,
      missing: ["Météo", "Présentation", "Lieux à voir", "Taux de change"],
    };
  }

  const missing: string[] = [];
  const place = await geocode(
    trip.destination_country
      ? `${trip.destination_city}, ${trip.destination_country}`
      : trip.destination_city,
  ).catch(() => null);
  if (!place) missing.push("Localisation");

  const practical =
    (place?.country_code ? practicalFor(place.country_code) : null) ??
    practicalFor(countryCodeFromName(trip.destination_country) ?? "");

  const [weather, guide, pois, rates] = await Promise.all([
    place
      ? weatherFor(place, trip.start_date, trip.end_date).catch(() => null)
      : Promise.resolve(null),
    guideFor(trip.destination_city).catch(() => null),
    place ? poisAround(place).catch(() => [] as PointOfInterest[]) : Promise.resolve([]),
    ratesFor(travellerCurrency).catch(() => null as RateSet | null),
  ]);

  if (!weather) missing.push("Météo");
  if (!guide) missing.push("Présentation");
  if (pois.length === 0) missing.push("Lieux à voir");

  const local = localCurrency(trip, place, practical);
  let exchange: Dossier["exchange"] = null;

  if (rates && local && local !== travellerCurrency) {
    // 10 units of the home currency, which is the sum people picture.
    const example = convertCents(1_000, travellerCurrency, local, rates);
    const rate = convertCents(100_000, travellerCurrency, local, rates);
    if (example !== null && rate !== null) {
      exchange = {
        local_currency: local,
        rate: rate / 100_000,
        date: rates.date,
        example_local_cents: example,
      };
    }
  }
  if (!exchange && local && local !== travellerCurrency) missing.push("Taux de change");

  return { place, weather, guide, pois, exchange, practical, missing };
}
