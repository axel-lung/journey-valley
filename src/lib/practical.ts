/**
 * The practical page of an agency's brochure: plugs, emergency number, which
 * side of the road, how tipping works, and roughly what a French passport
 * needs to get in.
 *
 * Curated rather than fetched, because it has to work with no network — and
 * because no free API publishes it reliably. Entry rules change, so `entry` is
 * deliberately coarse and every screen that shows it links to France
 * Diplomatie, which is the authority.
 */

export type DriveSide = "droite" | "gauche";

export interface PracticalInfo {
  country_code: string;
  currency: string;
  /** Plug letters as travellers see them on adaptor packaging. */
  plugs: string;
  voltage: string;
  emergency: string;
  drive: DriveSide;
  tipping: string;
  /** Indicative, for a French passport, short stay. Always to be checked. */
  entry: string;
}

export const OFFICIAL_ADVICE_URL =
  "https://www.diplomatie.gouv.fr/fr/conseils-aux-voyageurs/conseils-par-pays-destination/";

const SCHENGEN = "Carte d'identité ou passeport suffisent (espace Schengen).";
const EU_EMERGENCY = "112";

function european(country_code: string, currency = "EUR", plugs = "C / E / F"): PracticalInfo {
  return {
    country_code,
    currency,
    plugs,
    voltage: "230 V, 50 Hz",
    emergency: EU_EMERGENCY,
    drive: "droite",
    tipping: "Pourboire facultatif, on arrondit l'addition.",
    entry: SCHENGEN,
  };
}

const TABLE: Record<string, PracticalInfo> = {
  FR: european("FR"),
  PT: european("PT"),
  ES: european("ES"),
  IT: { ...european("IT"), plugs: "C / F / L" },
  DE: european("DE"),
  NL: european("NL"),
  BE: european("BE"),
  AT: european("AT"),
  GR: european("GR"),
  HR: european("HR"),
  PL: { ...european("PL", "PLN"), entry: SCHENGEN },
  CZ: { ...european("CZ", "CZK"), plugs: "C / E" },
  SE: { ...european("SE", "SEK") },
  DK: { ...european("DK", "DKK"), plugs: "C / E / F / K" },
  FI: { ...european("FI") },
  IS: { ...european("IS", "ISK") },
  NO: {
    ...european("NO", "NOK"),
    tipping: "Pourboire rare, le service est inclus.",
    entry: "Hors UE mais dans Schengen : carte d'identité ou passeport.",
  },
  CH: {
    ...european("CH", "CHF", "J (C compatible)"),
    entry: "Hors UE mais dans Schengen : carte d'identité ou passeport.",
    tipping: "Service compris, on arrondit.",
  },
  IE: { ...european("IE"), plugs: "G", drive: "gauche" },
  GB: {
    country_code: "GB",
    currency: "GBP",
    plugs: "G",
    voltage: "230 V, 50 Hz",
    emergency: "999 ou 112",
    drive: "gauche",
    tipping: "10 à 15 % au restaurant si le service n'est pas compté.",
    entry: "Passeport obligatoire (la carte d'identité ne suffit plus). ETA à demander avant le départ.",
  },
  MA: {
    country_code: "MA",
    currency: "MAD",
    plugs: "C / E",
    voltage: "220 V, 50 Hz",
    emergency: "19 (police) · 15 (secours)",
    drive: "droite",
    tipping: "Pourboire courant, quelques dirhams suffisent.",
    entry: "Passeport valide ; séjour touristique jusqu'à 90 jours sans visa.",
  },
  TN: {
    country_code: "TN",
    currency: "TND",
    plugs: "C / E",
    voltage: "230 V, 50 Hz",
    emergency: "197 (police) · 190 (secours)",
    drive: "droite",
    tipping: "Pourboire apprécié, 5 à 10 %.",
    entry: "Passeport valide ; séjour touristique jusqu'à 90 jours sans visa.",
  },
  TR: {
    country_code: "TR",
    currency: "TRY",
    plugs: "C / F",
    voltage: "230 V, 50 Hz",
    emergency: "112",
    drive: "droite",
    tipping: "5 à 10 % au restaurant.",
    entry: "Passeport ; séjour touristique jusqu'à 90 jours sans visa.",
  },
  US: {
    country_code: "US",
    currency: "USD",
    plugs: "A / B",
    voltage: "120 V, 60 Hz",
    emergency: "911",
    drive: "droite",
    tipping: "Pourboire attendu : 15 à 20 % au restaurant, 1 à 2 $ par bagage.",
    entry: "Passeport biométrique + autorisation ESTA à demander avant le départ.",
  },
  CA: {
    country_code: "CA",
    currency: "CAD",
    plugs: "A / B",
    voltage: "120 V, 60 Hz",
    emergency: "911",
    drive: "droite",
    tipping: "15 à 20 % au restaurant.",
    entry: "Passeport + autorisation AVE avant le départ.",
  },
  MX: {
    country_code: "MX",
    currency: "MXN",
    plugs: "A / B",
    voltage: "127 V, 60 Hz",
    emergency: "911",
    drive: "droite",
    tipping: "10 à 15 % au restaurant.",
    entry: "Passeport ; séjour touristique jusqu'à 180 jours sans visa.",
  },
  BR: {
    country_code: "BR",
    currency: "BRL",
    plugs: "C / N",
    voltage: "127 / 220 V",
    emergency: "190 (police) · 192 (secours)",
    drive: "droite",
    tipping: "10 % souvent déjà ajoutés à l'addition.",
    entry: "Passeport ; séjour touristique jusqu'à 90 jours sans visa.",
  },
  JP: {
    country_code: "JP",
    currency: "JPY",
    plugs: "A / B",
    voltage: "100 V, 50 ou 60 Hz",
    emergency: "110 (police) · 119 (secours)",
    drive: "gauche",
    tipping: "Pas de pourboire — il peut même gêner.",
    entry: "Passeport ; séjour touristique jusqu'à 90 jours sans visa.",
  },
  KR: {
    country_code: "KR",
    currency: "KRW",
    plugs: "C / F",
    voltage: "220 V, 60 Hz",
    emergency: "112 (police) · 119 (secours)",
    drive: "droite",
    tipping: "Pas de pourboire.",
    entry: "Passeport + autorisation K-ETA selon la période : à vérifier.",
  },
  TH: {
    country_code: "TH",
    currency: "THB",
    plugs: "A / B / C",
    voltage: "230 V, 50 Hz",
    emergency: "191 (police) · 1669 (secours)",
    drive: "gauche",
    tipping: "Pourboire facultatif, on laisse la monnaie.",
    entry: "Passeport ; séjour touristique sans visa, durée à vérifier.",
  },
  VN: {
    country_code: "VN",
    currency: "VND",
    plugs: "A / C / F",
    voltage: "220 V, 50 Hz",
    emergency: "113 (police) · 115 (secours)",
    drive: "droite",
    tipping: "Pourboire peu courant mais apprécié.",
    entry: "Passeport ; exemption de visa courte durée ou e-visa selon le séjour.",
  },
  ID: {
    country_code: "ID",
    currency: "IDR",
    plugs: "C / F",
    voltage: "230 V, 50 Hz",
    emergency: "112",
    drive: "gauche",
    tipping: "Souvent 5 à 10 % déjà inclus.",
    entry: "Passeport + visa à l'arrivée ou e-visa selon le séjour.",
  },
  IN: {
    country_code: "IN",
    currency: "INR",
    plugs: "C / D / M",
    voltage: "230 V, 50 Hz",
    emergency: "112",
    drive: "gauche",
    tipping: "10 % au restaurant.",
    entry: "Passeport + e-visa à demander avant le départ.",
  },
  AE: {
    country_code: "AE",
    currency: "AED",
    plugs: "G",
    voltage: "230 V, 50 Hz",
    emergency: "999 (police) · 998 (secours)",
    drive: "droite",
    tipping: "10 % courant ; souvent une taxe de service déjà ajoutée.",
    entry: "Passeport ; séjour touristique jusqu'à 90 jours sans visa.",
  },
  ZA: {
    country_code: "ZA",
    currency: "ZAR",
    plugs: "D / M / N",
    voltage: "230 V, 50 Hz",
    emergency: "10111 (police) · 10177 (secours)",
    drive: "gauche",
    tipping: "10 à 15 %, y compris pour le gardien de parking.",
    entry: "Passeport ; séjour touristique jusqu'à 90 jours sans visa.",
  },
  AU: {
    country_code: "AU",
    currency: "AUD",
    plugs: "I",
    voltage: "230 V, 50 Hz",
    emergency: "000",
    drive: "gauche",
    tipping: "Pas de pourboire attendu.",
    entry: "Passeport + autorisation eVisitor avant le départ.",
  },
  NZ: {
    country_code: "NZ",
    currency: "NZD",
    plugs: "I",
    voltage: "230 V, 50 Hz",
    emergency: "111",
    drive: "gauche",
    tipping: "Pas de pourboire attendu.",
    entry: "Passeport + autorisation NZeTA avant le départ.",
  },
};

/**
 * The practical sheet for a country, or null when the destination is not in the
 * table — better an honest blank than plausible nonsense about visas.
 */
export function practicalFor(countryCode: string): PracticalInfo | null {
  const code = countryCode.trim().toUpperCase();
  return TABLE[code] ?? null;
}

/**
 * Country name → code, for what people actually type. French first, but the
 * English names are here too: destinations get pasted from booking sites, and
 * "Norway" should not lose the practical page.
 */
const NAMES: Record<string, string> = {
  france: "FR",
  portugal: "PT",
  espagne: "ES",
  italie: "IT",
  allemagne: "DE",
  "pays-bas": "NL",
  belgique: "BE",
  autriche: "AT",
  grèce: "GR",
  croatie: "HR",
  pologne: "PL",
  "république tchèque": "CZ",
  tchéquie: "CZ",
  suède: "SE",
  danemark: "DK",
  finlande: "FI",
  islande: "IS",
  norvège: "NO",
  suisse: "CH",
  irlande: "IE",
  "royaume-uni": "GB",
  angleterre: "GB",
  écosse: "GB",
  maroc: "MA",
  tunisie: "TN",
  turquie: "TR",
  "états-unis": "US",
  canada: "CA",
  mexique: "MX",
  brésil: "BR",
  japon: "JP",
  "corée du sud": "KR",
  thaïlande: "TH",
  vietnam: "VN",
  indonésie: "ID",
  inde: "IN",
  "émirats arabes unis": "AE",
  "afrique du sud": "ZA",
  australie: "AU",
  "nouvelle-zélande": "NZ",

  // English spellings, and the odd local one.
  spain: "ES",
  italy: "IT",
  germany: "DE",
  netherlands: "NL",
  holland: "NL",
  belgium: "BE",
  austria: "AT",
  greece: "GR",
  croatia: "HR",
  poland: "PL",
  "czech republic": "CZ",
  czechia: "CZ",
  sweden: "SE",
  denmark: "DK",
  finland: "FI",
  iceland: "IS",
  norway: "NO",
  norge: "NO",
  switzerland: "CH",
  ireland: "IE",
  "united kingdom": "GB",
  uk: "GB",
  england: "GB",
  scotland: "GB",
  morocco: "MA",
  tunisia: "TN",
  turkey: "TR",
  türkiye: "TR",
  "united states": "US",
  usa: "US",
  "états unis": "US",
  mexico: "MX",
  brazil: "BR",
  brasil: "BR",
  japan: "JP",
  nippon: "JP",
  "south korea": "KR",
  thailand: "TH",
  "viet nam": "VN",
  indonesia: "ID",
  india: "IN",
  "united arab emirates": "AE",
  uae: "AE",
  "south africa": "ZA",
  australia: "AU",
  "new zealand": "NZ",
};

export function countryCodeFromName(name: string): string | null {
  const key = name.trim().toLowerCase();
  if (!key) return null;

  // Someone may have typed the code itself.
  if (/^[a-z]{2}$/.test(key) && TABLE[key.toUpperCase()]) return key.toUpperCase();

  return NAMES[key] ?? null;
}
