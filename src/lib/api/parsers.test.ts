import { describe, expect, it } from "vitest";
import { parsePlace } from "./geo";
import { parseGuide } from "./guide";
import { convertCents, parseRates } from "./fx";
import { parsePois } from "./poi";
import { parseDaily, summarise, withinForecastRange } from "./weather";

/**
 * These services cannot be called from the test runner — and should not be,
 * they are volunteer-run. So the parsers are tested against payloads shaped
 * like the documented responses, which is where the bugs live anyway.
 */

describe("parsePlace (Nominatim)", () => {
  const payload = [
    {
      place_id: 123,
      name: "Lisbonne",
      display_name: "Lisbonne, Portugal",
      lat: "38.7077507",
      lon: "-9.1365919",
      address: { country: "Portugal", country_code: "pt" },
    },
  ];

  it("reads coordinates, name and country", () => {
    const place = parsePlace(payload, "Lisbonne");
    expect(place).toEqual({
      name: "Lisbonne",
      country: "Portugal",
      country_code: "PT",
      latitude: 38.7077507,
      longitude: -9.1365919,
    });
  });

  it("falls back to the first part of the display name", () => {
    const place = parsePlace([{ ...payload[0], name: undefined }], "x");
    expect(place?.name).toBe("Lisbonne");
  });

  it("returns null on an empty or malformed answer", () => {
    expect(parsePlace([], "Lisbonne")).toBeNull();
    expect(parsePlace({}, "Lisbonne")).toBeNull();
    expect(parsePlace([{ lat: "nope", lon: "nope" }], "Lisbonne")).toBeNull();
  });
});

describe("parseDaily and summarise (Open-Meteo)", () => {
  const payload = {
    daily: {
      time: ["2026-10-12", "2026-10-13", "2026-10-14"],
      temperature_2m_min: [11.4, 12.2, null],
      temperature_2m_max: [18.6, 19.1, 20.0],
      precipitation_sum: [0, 4.2, 1.0],
    },
  };

  it("pairs the column arrays into rows", () => {
    const days = parseDaily(payload);
    expect(days).toHaveLength(2);
    expect(days[0]).toEqual({ date: "2026-10-12", min_c: 11, max_c: 19, rain_mm: 0 });
  });

  it("drops a day with a missing temperature rather than inventing one", () => {
    expect(parseDaily(payload).some((day) => day.date === "2026-10-14")).toBe(false);
  });

  it("survives a payload with no daily block", () => {
    expect(parseDaily({})).toEqual([]);
    expect(parseDaily(null)).toEqual([]);
  });

  it("averages the period and counts the rainy days", () => {
    const outlook = summarise(parseDaily(payload), "forecast", "Open-Meteo");
    expect(outlook.average_min_c).toBe(12);
    expect(outlook.average_max_c).toBe(19);
    expect(outlook.rainy_days).toBe(1);
  });

  it("does not divide by zero on an empty period", () => {
    const outlook = summarise([], "normals", "test");
    expect(outlook.average_max_c).toBe(0);
    expect(outlook.rainy_days).toBe(0);
  });
});

describe("withinForecastRange", () => {
  const today = new Date("2026-06-10T09:00:00Z");

  it("uses a forecast for dates inside the next fortnight", () => {
    expect(withinForecastRange("2026-06-20", today)).toBe(true);
    expect(withinForecastRange("2026-06-09", today)).toBe(true);
  });

  it("falls back to seasonal normals further out", () => {
    expect(withinForecastRange("2026-08-01", today)).toBe(false);
  });
});

describe("parseRates and convertCents (Frankfurter)", () => {
  const payload = { amount: 1, base: "EUR", date: "2026-09-15", rates: { JPY: 171.2, NOK: 11.68, USD: 1.09 } };

  it("keeps only usable positive rates", () => {
    const rates = parseRates({ ...payload, rates: { ...payload.rates, BAD: "x", ZERO: 0 } });
    expect(rates?.base).toBe("EUR");
    expect(Object.keys(rates!.rates).sort()).toEqual(["JPY", "NOK", "USD"]);
  });

  it("returns null when there is nothing to use", () => {
    expect(parseRates({})).toBeNull();
    expect(parseRates({ base: "EUR", rates: {} })).toBeNull();
  });

  it("converts through the base currency", () => {
    const rates = parseRates(payload)!;
    // 100 € at 171.2 ¥ per euro.
    expect(convertCents(10_000, "EUR", "JPY", rates)).toBe(1_712_000);
    // …and back again.
    expect(convertCents(1_712_000, "JPY", "EUR", rates)).toBe(10_000);
  });

  it("is a no-op for the same currency, even an unknown one", () => {
    const rates = parseRates(payload)!;
    expect(convertCents(4_200, "XYZ", "XYZ", rates)).toBe(4_200);
  });

  it("returns null rather than guessing an unknown pair", () => {
    const rates = parseRates(payload)!;
    expect(convertCents(4_200, "EUR", "XYZ", rates)).toBeNull();
  });
});

describe("parseGuide (Wikipedia)", () => {
  it("keeps the text, the link and the licence", () => {
    const guide = parseGuide({
      type: "standard",
      title: "Lisbonne",
      extract: "Lisbonne est la capitale du Portugal.",
      content_urls: { desktop: { page: "https://fr.wikipedia.org/wiki/Lisbonne" } },
    });
    expect(guide?.extract).toContain("capitale");
    expect(guide?.url).toContain("wikipedia.org");
    expect(guide?.attribution).toMatch(/CC BY-SA/);
  });

  it("refuses a disambiguation page or an empty extract", () => {
    expect(parseGuide({ type: "disambiguation", extract: "Lisbonne peut désigner…" })).toBeNull();
    expect(parseGuide({ type: "standard", extract: "   " })).toBeNull();
  });
});

describe("parsePois (Overpass)", () => {
  const payload = {
    elements: [
      { type: "node", id: 1, lat: 38.7, lon: -9.1, tags: { tourism: "museum", name: "Musée des Azulejos", wikidata: "Q1" } },
      { type: "way", id: 2, center: { lat: 38.71, lon: -9.13 }, tags: { historic: "castle", name: "Château Saint-Georges" } },
      { type: "node", id: 3, lat: 38.72, lon: -9.14, tags: { tourism: "viewpoint" } },
      { type: "node", id: 4, lat: 38.73, lon: -9.15, tags: { tourism: "museum", name: "Musée des Azulejos" } },
      { type: "node", id: 5, tags: { tourism: "museum", name: "Sans coordonnées" } },
    ],
  };

  it("keeps named places and gives them a French label", () => {
    const pois = parsePois(payload);
    expect(pois.map((poi) => poi.name)).toEqual([
      "Musée des Azulejos",
      "Château Saint-Georges",
    ]);
    expect(pois[0].label).toBe("Musée");
    expect(pois[1].label).toBe("Château");
  });

  it("takes the centre of a way", () => {
    const castle = parsePois(payload).find((poi) => poi.name.startsWith("Château"));
    expect(castle?.latitude).toBe(38.71);
  });

  it("drops the unnamed, the duplicated and the placeless", () => {
    expect(parsePois(payload)).toHaveLength(2);
  });

  it("puts the better-documented place first", () => {
    expect(parsePois(payload)[0].name).toBe("Musée des Azulejos");
  });

  it("honours the limit and survives an empty answer", () => {
    expect(parsePois(payload, 1)).toHaveLength(1);
    expect(parsePois({})).toEqual([]);
  });
});
