import type { Place } from "./geo";

/**
 * Things to do, from OpenStreetMap through the Overpass API — free, no key, no
 * account, and real places rather than estimates.
 *
 * What OSM does not have is prices: it is a map, not a booking engine. So these
 * results come back with `price_known: false` and the interface asks for the
 * price rather than inventing one.
 *
 * URLs and parsers only: the fetching lives in `api/live.ts` on the server and
 * in `mobile/web/api.ts` on the phone, which share this file.
 */

const ENDPOINT = "https://overpass-api.de/api/interpreter";

const CATEGORY_LABEL: Record<string, string> = {
  museum: "Musée",
  gallery: "Galerie",
  attraction: "Site touristique",
  artwork: "Œuvre d'art",
  viewpoint: "Point de vue",
  zoo: "Zoo",
  aquarium: "Aquarium",
  theme_park: "Parc d'attractions",
  castle: "Château",
  ruins: "Ruines",
  monument: "Monument",
  memorial: "Mémorial",
  place_of_worship: "Édifice religieux",
};

export interface PointOfInterest {
  id: string;
  name: string;
  category: string;
  label: string;
  latitude: number;
  longitude: number;
  website: string | null;
  /** OSM's own page, so a curious traveller can check the source. */
  osm_url: string;
}

interface OverpassElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

/**
 * Pure: an Overpass payload into a usable list — named places only, one entry
 * per name, the most documented first.
 */
export function parsePois(payload: unknown, limit = 8): PointOfInterest[] {
  const elements = (payload as { elements?: OverpassElement[] })?.elements ?? [];
  const seen = new Set<string>();
  const pois: Array<PointOfInterest & { score: number }> = [];

  for (const element of elements) {
    const tags = element.tags ?? {};
    const name = (tags["name:fr"] ?? tags.name ?? "").trim();
    if (!name) continue;

    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    if (typeof latitude !== "number" || typeof longitude !== "number") continue;

    const category = tags.tourism ?? tags.historic ?? tags.amenity ?? "attraction";
    seen.add(key);

    pois.push({
      id: `osm:${element.type ?? "node"}/${element.id ?? key}`,
      name,
      category,
      label: CATEGORY_LABEL[category] ?? "À voir",
      latitude,
      longitude,
      website: tags.website ?? tags["contact:website"] ?? null,
      osm_url: `https://www.openstreetmap.org/${element.type ?? "node"}/${element.id ?? ""}`,
      // A place with a Wikidata entry or a site is usually the one worth listing.
      score: (tags.wikidata ? 2 : 0) + (tags.website || tags["contact:website"] ? 1 : 0),
    });
  }

  return pois
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, "fr"))
    .slice(0, limit)
    .map(({ score: _score, ...poi }) => poi);
}

export function buildQuery(place: Place, radiusMetres: number): string {
  const around = `around:${radiusMetres},${place.latitude},${place.longitude}`;
  const tourism = "museum|attraction|artwork|viewpoint|gallery|zoo|aquarium|theme_park";

  return `[out:json][timeout:20];
(
  node["tourism"~"${tourism}"](${around});
  way["tourism"~"${tourism}"](${around});
  node["historic"~"castle|ruins|monument|memorial"](${around});
  way["historic"~"castle|ruins|monument|memorial"](${around});
);
out center 60;`;
}

export function poisUrl(place: Place, radiusMetres = 6000): string {
  return `${ENDPOINT}?${new URLSearchParams({ data: buildQuery(place, radiusMetres) })}`;
}
