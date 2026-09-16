import { cachedJson, fetchJson } from "./http";

/**
 * The destination write-up, from Wikipedia's REST summary endpoint — free, no
 * key, and CC BY-SA, which is why the attribution and the link travel with the
 * text everywhere it is shown.
 */

export interface DestinationGuide {
  title: string;
  extract: string;
  url: string;
  attribution: string;
}

interface WikiSummary {
  title?: string;
  extract?: string;
  type?: string;
  content_urls?: { desktop?: { page?: string } };
}

/** Pure: a REST summary into a guide, or null for a disambiguation page. */
export function parseGuide(payload: unknown): DestinationGuide | null {
  const body = payload as WikiSummary;
  const extract = body?.extract?.trim();
  if (!extract || body.type === "disambiguation") return null;

  return {
    title: body.title?.trim() ?? "",
    extract,
    url: body.content_urls?.desktop?.page ?? "",
    attribution: "Wikipédia (CC BY-SA)",
  };
}

export async function guideFor(city: string): Promise<DestinationGuide | null> {
  const title = city.trim();
  if (!title) return null;

  const url = `https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const { value } = await cachedJson(`guide:${title.toLowerCase()}`, 24 * 30, () =>
    fetchJson<unknown>(url),
  );
  return parseGuide(value);
}
