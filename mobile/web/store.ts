/**
 * Ce que le téléphone garde entre deux ouvertures.
 *
 * L'application est désormais celle d'une agence : les dossiers vivent sur le
 * serveur, pas ici. Ce document local ne contient donc que la session, les
 * réponses mises en cache — ce qui fait tenir le carnet dans un avion — et les
 * réglages de l'appareil.
 *
 * Il est écrit par le pont Android quand il est là, et dans le localStorage
 * sinon, pour que le même bundle tourne dans un navigateur de développement.
 */
import type { Session } from "./client";

export interface Database {
  version: 2;
  session?: Session;
  /** Réponses du serveur et des services libres, indexées par clé. */
  cache?: Record<string, { payload: string; expires_at: number }>;
  settings?: { network?: boolean };
}

declare global {
  interface Window {
    /** Injecté par la coque Android ; absent dans un navigateur. */
    JVStore?: { load(): string; save(json: string): void };
    /** Enregistré par l'application pour que le bouton retour recule dedans. */
    JVBack?: () => boolean;
    /** Injecté par la coque : ouvre le partage du système. */
    JVShare?: { text(body: string): void };
  }
}

const STORAGE_KEY = "journey-valley/v2";

function readRaw(): string | null {
  try {
    if (window.JVStore) return window.JVStore.load() || null;
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(json: string): void {
  try {
    if (window.JVStore) {
      window.JVStore.save(json);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, json);
  } catch {
    // Un stockage plein ou bloqué ne doit pas faire tomber l'écran : la session
    // continue en mémoire, et la prochaine écriture peut réussir.
  }
}

function empty(): Database {
  return { version: 2, cache: {}, settings: {} };
}

let db: Database = load();

function load(): Database {
  const raw = readRaw();
  if (!raw) return empty();
  try {
    const parsed = JSON.parse(raw) as Database;
    // La version 1 était l'application grand public hors-ligne : ses voyages
    // n'ont pas d'équivalent ici, on repart proprement.
    if (!parsed || parsed.version !== 2) return empty();
    return { ...empty(), ...parsed };
  } catch {
    return empty();
  }
}

export function getDb(): Database {
  return db;
}

export function persistNow(): void {
  writeRaw(JSON.stringify(db));
}

/** Vide tout, y compris la session : le téléphone repart vierge. */
export function clearAll(): void {
  db = empty();
  persistNow();
}

/** Ne vide que les réponses gardées ; la session et les réglages restent. */
export function clearCache(): void {
  db.cache = {};
  persistNow();
}

export function cacheSize(): number {
  return Object.keys(db.cache ?? {}).length;
}

export const CURRENCY = "EUR" as const;

export function today(offset = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}
