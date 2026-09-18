import { parseAmountToCents } from "../money";

/**
 * Lire un programme de voyage déjà écrit.
 *
 * C'est la brique dont dépend toute la promesse : « à partir du programme que
 * vous avez déjà préparé ». Si l'extraction est mauvaise, le conseiller passe
 * plus de temps à corriger qu'à retaper, et le produit fait perdre du temps au
 * lieu d'en faire gagner. Tout ce fichier est donc écrit pour une seule
 * exigence : **ne jamais inventer, et dire ce dont on n'est pas sûr**.
 *
 * Trois règles en découlent, et elles ne se négocient pas plus que les autres :
 *
 * 1. **Rien n'est jeté.** Une ligne qu'on ne sait pas rattacher part dans
 *    `unmatched` et s'affiche. Une extraction qui perd silencieusement le
 *    paragraphe « ce que le prix ne comprend pas » est pire qu'une extraction
 *    qui échoue franchement.
 * 2. **Ce qui est deviné est marqué.** `confidence` distingue ce qui a été lu
 *    de ce qui a été supposé, champ par champ. C'est la règle 5 du projet — un
 *    chiffre pas ferme se dit — appliquée à la lecture.
 * 3. **Aucun appel réseau.** Ce module est pur : il lit du texte et rend une
 *    structure. Le fournisseur d'extraction assistée, quand il existera, se
 *    branchera à côté (voir `provider.ts`) et sera jugé contre ce que fait ce
 *    parseur seul.
 */

export type EntryKind = "flight" | "stay" | "transport" | "activity" | "other";

export interface ExtractedEntry {
  kind: EntryKind;
  /** Ce qu'on affiche : « Vol AF 264 », « Hôtel Riad Kniza ». */
  label: string;
  /** Le reste de la ligne, quand elle en disait plus. */
  detail: string;
  /** Numéro de vol, référence de réservation : ce qu'on a su isoler. */
  reference: string | null;
  nights: number | null;
}

export interface ExtractedDay {
  day_number: number;
  /** Date ISO quand le programme en portait une ; sinon null. */
  date: string | null;
  title: string;
  entries: ExtractedEntry[];
}

export type Confidence = "sure" | "guess";

export interface ExtractedProgramme {
  title: string;
  destination_city: string;
  destination_country: string;
  start_date: string | null;
  end_date: string | null;
  travellers: number | null;
  price_cents: number | null;
  days: ExtractedDay[];
  /** Les lignes qu'aucune journée n'a réclamées. Montrées, jamais perdues. */
  unmatched: string[];
  /** Champ par champ : lu, ou supposé. */
  confidence: Partial<Record<keyof ExtractedProgramme, Confidence>>;
}

/* ------------------------------------------------------------------ dates */

const MONTHS: Record<string, number> = {
  janvier: 1, janv: 1, jan: 1,
  fevrier: 2, fev: 2, "février": 2, "fév": 2,
  mars: 3,
  avril: 4, avr: 4,
  mai: 5,
  juin: 6,
  juillet: 7, juil: 7,
  aout: 8, "août": 8,
  septembre: 9, sept: 9, sep: 9,
  octobre: 10, oct: 10,
  novembre: 11, nov: 11,
  decembre: 12, "décembre": 12, dec: 12, "déc": 12,
};

/** Sans accents ni casse : les programmes écrivent « Aout » comme « août ». */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function iso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Lit une date française dans une ligne : « 12 octobre 2026 », « 12/10/2026 »,
 * « lundi 12 octobre ». Sans année écrite, celle du dossier sert de repère —
 * et le champ est alors marqué comme supposé par l'appelant.
 */
export function matchFrenchDate(
  line: string,
  fallbackYear: number,
): { date: string; text: string } | null {
  const numeric = /\b\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}\b/.exec(line);
  if (numeric) {
    const [day, month, rawYear] = numeric[0].split(/[/.-]/).map(Number);
    const date = iso(rawYear < 100 ? 2000 + rawYear : rawYear, month, day);
    if (date) return { date, text: numeric[0] };
  }

  // Le jour de la semaine, s'il est écrit, fait partie de la date : « lundi 12
  // octobre » doit disparaître en entier du titre de la journée.
  const written = /(?:\b[a-zéèûô]+\s+)?\b(\d{1,2})(?:er)?\s+([a-zA-Zéèûôàî]+)\.?(?:\s+(\d{4}))?/i.exec(
    line,
  );
  if (written) {
    const month = MONTHS[fold(written[2])];
    if (month) {
      const date = iso(written[3] ? Number(written[3]) : fallbackYear, month, Number(written[1]));
      if (date) return { date, text: written[0] };
    }
  }

  return null;
}

export function parseFrenchDate(line: string, fallbackYear: number): string | null {
  return matchFrenchDate(line, fallbackYear)?.date ?? null;
}

/* ------------------------------------------------ reconnaissance des lignes */

/** « Jour 3 », « J3 », « Jour 3 : », « JOUR 3 — Marrakech ». */
const DAY_MARKER = /^\s*(?:jour|j)\s*[°n]?\s*(\d{1,2})\s*(?:[:：.–—-]|\b)\s*(.*)$/i;

const FLIGHT_NUMBER = /\b([A-Z]{2}\s?\d{2,4})\b/;
const AIRPORT_PAIR = /\b([A-Z]{3})\s*(?:→|->|>|\/|–|—|-)\s*([A-Z]{3})\b/;

const KEYWORDS: Array<{ kind: EntryKind; words: string[] }> = [
  {
    kind: "flight",
    // Pas « aéroport » : « transfert vers l'aéroport » est un transfert. Un vol
    // se reconnaît à son numéro, à ses codes, ou au mot lui-même.
    words: ["vol", "vols", "envol", "decollage", "atterrissage", "escale"],
  },
  {
    kind: "transport",
    words: [
      "transfert", "train", "bus", "voiture", "location", "ferry", "bateau", "taxi",
      "navette", "route", "trajet", "4x4", "pirogue",
    ],
  },
  {
    kind: "stay",
    words: [
      "hotel", "riad", "lodge", "auberge", "guesthouse", "hebergement", "logement",
      "nuit", "nuits", "chambre", "resort", "maison d'hotes", "campement", "bivouac",
    ],
  },
  {
    kind: "activity",
    words: [
      "visite", "excursion", "balade", "randonnee", "degustation", "cours", "atelier",
      "spectacle", "safari", "plongee", "guide", "decouverte", "temps libre", "musee",
      "marche", "croisiere", "massage", "diner", "dejeuner",
    ],
  },
];

/**
 * À quelle famille appartient cette ligne ?
 *
 * **L'ordre des familles est le classement.** Une ligne porte souvent deux
 * mots de deux familles — « transfert de l'aéroport au riad » en a trois — et
 * c'est la première essayée qui gagne. Le transport passe donc avant
 * l'hébergement : la ligne décrit le trajet, la nuit vient après.
 */
export function classify(line: string): EntryKind {
  const folded = fold(line);
  if (FLIGHT_NUMBER.test(line) || AIRPORT_PAIR.test(line)) return "flight";

  for (const { kind, words } of KEYWORDS) {
    if (words.some((word) => new RegExp(`\\b${word}`, "i").test(folded))) return kind;
  }
  return "other";
}

/** Le numéro de vol, quand la ligne en porte un — c'est ce qu'on veut garder. */
export function referenceIn(line: string): string | null {
  const flight = FLIGHT_NUMBER.exec(line);
  if (flight) return flight[1].replace(/\s+/, " ").trim();

  const booking = /\b(?:r[ée]f(?:[ée]rence)?|conf(?:irmation)?|dossier)\s*[:.]?\s*([A-Z0-9]{5,10})\b/i.exec(line);
  return booking ? booking[1] : null;
}

export function nightsIn(line: string): number | null {
  const match = /(\d{1,2})\s*nuit/i.exec(line);
  return match ? Number(match[1]) : null;
}

/** « 2 personnes », « base 2 participants », « pour 4 voyageurs ». */
export function travellersIn(text: string): number | null {
  const match = /(\d{1,2})\s*(?:personnes?|participants?|voyageurs?|adultes?|pax)\b/i.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * Le prix : le plus grand montant en euros du document.
 *
 * Choisir le plus grand plutôt que le premier évite de prendre un supplément
 * ou un prix par nuit pour le prix du voyage. C'est une heuristique, donc le
 * champ est toujours rendu comme supposé — jamais comme lu.
 */
export function priceIn(text: string): number | null {
  let best: number | null = null;
  for (const match of text.matchAll(/(\d[\d\s  .,]*)\s*€/g)) {
    const cents = parseAmountToCents(match[1]);
    if (cents !== null && (best === null || cents > best)) best = cents;
  }
  return best;
}

/* ------------------------------------------------------------- l'extraction */

function cleanLines(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    // Une puce se retire en tête de ligne seulement : « Marrakech — 6 jours »
    // garde son tiret, qui appartient au titre.
    .map((line) => line.replace(/^\s*[•·▪●*\-–—]\s+/, "").replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

/** Une ligne de moins de trois caractères n'est pas une prestation. */
function meaningful(line: string): boolean {
  return line.length >= 3;
}

/**
 * Le programme est-il fini ?
 *
 * Un programme d'agence se termine par un bloc de prix et de conditions, qui
 * n'appartient à aucune journée. Sans ce repère, « ce prix ne comprend pas les
 * boissons » finissait rattaché au dernier jour comme s'il s'agissait d'une
 * prestation — et le conseiller devait le retirer à la main.
 */
const FOOTER_MARKER =
  /^(?:prix|tarif|montant|supplement|supplément|ce prix|ce tarif|le prix|inclus|non inclus|compris|non compris|ne comprend|conditions|formalit|assurance|modalit|reglement|règlement)/i;

function closesProgramme(line: string): boolean {
  return FOOTER_MARKER.test(fold(line)) || FOOTER_MARKER.test(line);
}

export interface ParseOptions {
  /** L'année à supposer quand le programme n'en écrit pas. */
  fallbackYear?: number;
}

/**
 * Lit un programme et rend ce qu'on a su en tirer.
 *
 * Ne jette jamais et ne rend jamais null : un texte illisible donne un
 * programme vide avec toutes ses lignes dans `unmatched`, ce qui est
 * exactement ce que le conseiller doit voir pour décider de corriger ou
 * d'abandonner.
 */
export function parseProgramme(text: string, options: ParseOptions = {}): ExtractedProgramme {
  const fallbackYear = options.fallbackYear ?? new Date().getUTCFullYear();
  const lines = cleanLines(text);

  const days: ExtractedDay[] = [];
  const unmatched: string[] = [];
  let current: ExtractedDay | null = null;

  for (const line of lines) {
    if (current && closesProgramme(line)) {
      // Tout ce qui suit le premier marqueur de pied de page quitte les
      // journées : c'est du prix et des conditions, pas du programme.
      current = null;
      unmatched.push(line);
      continue;
    }

    const marker = DAY_MARKER.exec(line);
    if (marker) {
      const rest = marker[2].trim();
      const dated = matchFrenchDate(rest, fallbackYear);
      current = {
        day_number: Number(marker[1]),
        date: dated?.date ?? null,
        // Le titre de la journée est ce qui reste une fois retirée exactement
        // la date qu'on a reconnue — pas une autre, devinée une deuxième fois.
        title: (dated ? rest.replace(dated.text, "") : rest)
          .replace(/^[\s:–—-]+/, "")
          .replace(/[\s:–—-]+$/, "")
          .trim(),
        entries: [],
      };
      days.push(current);
      continue;
    }

    if (!meaningful(line)) continue;

    if (!current) {
      unmatched.push(line);
      continue;
    }

    current.entries.push({
      kind: classify(line),
      label: line.length > 90 ? `${line.slice(0, 87)}…` : line,
      detail: line.length > 90 ? line : "",
      reference: referenceIn(line),
      nights: nightsIn(line),
    });
  }

  // Le titre : la première ligne avant toute journée, si elle ressemble à un
  // titre. Sinon on ne force rien — un titre inventé est pire qu'un titre vide.
  const head = unmatched[0] ?? "";
  const title = head.length > 0 && head.length <= 80 ? head : "";
  if (title) unmatched.shift();

  const dated = days.filter((day) => day.date).map((day) => day.date!);
  const confidence: ExtractedProgramme["confidence"] = {};

  if (title) confidence.title = "guess";
  if (dated.length > 0) confidence.start_date = "sure";
  if (dated.length > 1) confidence.end_date = "sure";

  const travellers = travellersIn(text);
  if (travellers !== null) confidence.travellers = "sure";

  const price = priceIn(text);
  // Toujours supposé : rien ne distingue sûrement le prix du voyage d'un
  // supplément, et annoncer un prix faux comme certain serait le pire service
  // à rendre.
  if (price !== null) confidence.price_cents = "guess";

  const destination = destinationIn(title, days);
  if (destination.city) confidence.destination_city = "guess";

  return {
    title,
    destination_city: destination.city,
    destination_country: destination.country,
    start_date: dated[0] ?? null,
    end_date: dated.length > 1 ? dated[dated.length - 1] : null,
    travellers,
    price_cents: price,
    days,
    unmatched,
    confidence,
  };
}

/**
 * La destination, devinée depuis le titre ou la première journée.
 *
 * Volontairement pauvre : sans dictionnaire de lieux, tout ce qu'on peut faire
 * honnêtement est de proposer un mot que le conseiller corrigera. Le champ est
 * donc toujours rendu comme supposé.
 */
export function destinationIn(
  title: string,
  days: ExtractedDay[],
): { city: string; country: string } {
  const explicit = /destination\s*[:.]\s*([^,\n]+?)(?:,\s*([^,\n]+))?$/i.exec(title);
  if (explicit) {
    return { city: explicit[1].trim(), country: (explicit[2] ?? "").trim() };
  }

  // « Paris → Marrakech » au premier jour : l'arrivée est la destination.
  const arrival = /(?:→|->|>)\s*([A-ZÉÈÀ][\p{L}' -]{2,30})/u.exec(days[0]?.title ?? "");
  if (arrival) return { city: arrival[1].trim(), country: "" };

  // À défaut, le dernier mot capitalisé du titre : « Le Maroc en famille » n'en
  // donnera rien de bon, et c'est pour ça que le champ est marqué « supposé ».
  const capitalised = [...title.matchAll(/\b([A-ZÉÈÀ][\p{L}'-]{2,})\b/gu)].map((m) => m[1]);
  return { city: capitalised.length > 0 ? capitalised[capitalised.length - 1] : "", country: "" };
}

/** Combien de lignes le parseur a su rattacher — la mesure qui compte. */
export function coverage(programme: ExtractedProgramme): {
  matched: number;
  total: number;
  percent: number;
} {
  const matched = programme.days.reduce((total, day) => total + day.entries.length, 0);
  const total = matched + programme.unmatched.length;
  return { matched, total, percent: total === 0 ? 0 : Math.round((matched / total) * 100) };
}
