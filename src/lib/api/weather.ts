import { cachedJson, fetchJson } from "./http";
import type { Place } from "./geo";

/**
 * Weather from Open-Meteo — free, no key, no account, and explicit that
 * non-commercial use needs nothing at all.
 *
 * Two questions matter to someone planning a trip, and they need two different
 * endpoints: "what will it be like next week?" (forecast, 16 days out) and
 * "what is it like there in October?" (climate normals from past years).
 */

export interface DailyWeather {
  date: string;
  min_c: number;
  max_c: number;
  rain_mm: number;
}

export interface WeatherOutlook {
  kind: "forecast" | "normals";
  days: DailyWeather[];
  /** Averages over the period, which is what people actually read. */
  average_min_c: number;
  average_max_c: number;
  rainy_days: number;
  source: string;
}

interface OpenMeteoDaily {
  daily?: {
    time?: string[];
    temperature_2m_min?: Array<number | null>;
    temperature_2m_max?: Array<number | null>;
    precipitation_sum?: Array<number | null>;
  };
}

/** Pure: Open-Meteo's column arrays into rows, dropping incomplete days. */
export function parseDaily(payload: unknown): DailyWeather[] {
  const daily = (payload as OpenMeteoDaily)?.daily;
  const times = daily?.time ?? [];

  const rows: DailyWeather[] = [];
  for (let index = 0; index < times.length; index += 1) {
    const min = daily?.temperature_2m_min?.[index];
    const max = daily?.temperature_2m_max?.[index];
    if (typeof min !== "number" || typeof max !== "number") continue;

    rows.push({
      date: times[index],
      min_c: Math.round(min),
      max_c: Math.round(max),
      rain_mm: Math.max(0, Math.round(daily?.precipitation_sum?.[index] ?? 0)),
    });
  }
  return rows;
}

/** Pure: the summary the trip page shows. A day with ≥1mm counts as rainy. */
export function summarise(days: DailyWeather[], kind: WeatherOutlook["kind"], source: string): WeatherOutlook {
  if (days.length === 0) {
    return { kind, days, average_min_c: 0, average_max_c: 0, rainy_days: 0, source };
  }

  const total = days.reduce(
    (sums, day) => ({
      min: sums.min + day.min_c,
      max: sums.max + day.max_c,
      rainy: sums.rainy + (day.rain_mm >= 1 ? 1 : 0),
    }),
    { min: 0, max: 0, rainy: 0 },
  );

  return {
    kind,
    days,
    average_min_c: Math.round(total.min / days.length),
    average_max_c: Math.round(total.max / days.length),
    rainy_days: total.rainy,
    source,
  };
}

/** True when the dates are close enough for a real forecast to exist. */
export function withinForecastRange(startDate: string, now: Date = new Date()): boolean {
  const start = Date.parse(`${startDate.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start)) return false;
  const days = (start - now.getTime()) / 86_400_000;
  return days <= 14;
}

export async function weatherFor(
  place: Place,
  startDate: string,
  endDate: string,
): Promise<WeatherOutlook> {
  if (withinForecastRange(startDate)) {
    const url =
      "https://api.open-meteo.com/v1/forecast?" +
      new URLSearchParams({
        latitude: String(place.latitude),
        longitude: String(place.longitude),
        daily: "temperature_2m_min,temperature_2m_max,precipitation_sum",
        timezone: "auto",
        start_date: startDate.slice(0, 10),
        end_date: endDate.slice(0, 10),
      });

    const { value } = await cachedJson(
      `forecast:${place.latitude},${place.longitude}:${startDate}:${endDate}`,
      6,
      () => fetchJson<unknown>(url),
    );
    return summarise(parseDaily(value), "forecast", "Open-Meteo");
  }

  // Too far out for a forecast: same week last year stands in for the season.
  const lastYear = (iso: string) =>
    `${Number(iso.slice(0, 4)) - 1}${iso.slice(4, 10)}`;

  const url =
    "https://archive-api.open-meteo.com/v1/archive?" +
    new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      daily: "temperature_2m_min,temperature_2m_max,precipitation_sum",
      timezone: "auto",
      start_date: lastYear(startDate),
      end_date: lastYear(endDate),
    });

  const { value } = await cachedJson(
    `normals:${place.latitude},${place.longitude}:${startDate.slice(5, 10)}`,
    24 * 30,
    () => fetchJson<unknown>(url),
  );
  return summarise(parseDaily(value), "normals", "Open-Meteo (archive)");
}
