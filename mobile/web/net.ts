/**
 * The phone's transport for the free services.
 *
 * Requests leave through the Java bridge (`JVNet`), which checks the host
 * against its allowlist before opening a socket, and answers back through
 * `window.__jvNetResolve`. In a desktop browser, where the bridge is absent,
 * it falls back to `fetch` so the bundle stays testable.
 *
 * Answers are cached in the same JSON document as the trips, because these
 * services ask to be cached — and because a cached answer is what makes the
 * destination file work in a plane.
 */
import { bridgeRequest } from "./bridge";
import { getDb, persistNow } from "./store";

export class NetworkUnavailable extends Error {
  constructor(message = "Service injoignable.") {
    super(message);
    this.name = "NetworkUnavailable";
  }
}

/** True when this build can reach the network at all. */
export function networkAvailable(): boolean {
  return typeof window !== "undefined" && (Boolean(window.JVNet) || typeof fetch === "function");
}

/** The user's choice, which the app must honour even when the bridge exists. */
export function networkAllowed(): boolean {
  return getDb().settings?.network !== false;
}

export function setNetworkAllowed(allowed: boolean): void {
  const db = getDb();
  db.settings = { ...(db.settings ?? {}), network: allowed };
  persistNow();
}

async function rawGet(url: string, timeoutMs = 30_000): Promise<string> {
  const bridge = window.JVNet;
  if (bridge) {
    return bridgeRequest({
      prefix: "r",
      timeoutMs,
      onTimeout: () => new NetworkUnavailable("Le service n'a pas répondu à temps."),
      onFailure: ({ status, body }) =>
        new NetworkUnavailable(status > 0 ? `Réponse HTTP ${status}.` : body),
      send: (id) => bridge.get(url, id),
    });
  }

  // Desktop browser: same contract, ordinary fetch.
  const response = await fetch(url, { headers: { accept: "application/json" } });
  if (!response.ok) throw new NetworkUnavailable(`Réponse HTTP ${response.status}.`);
  return response.text();
}

interface CacheEntry {
  payload: string;
  expires_at: number;
}

function cache(): Record<string, CacheEntry> {
  const db = getDb();
  db.cache ??= {};
  return db.cache;
}

/**
 * Fetches JSON, through the cache. A stale entry is served when the network
 * fails — offline, the last answer is far better than an empty screen.
 */
export async function cachedJson<T>(key: string, ttlHours: number, url: string): Promise<T> {
  const store = cache();
  const hit = store[key];

  if (hit && hit.expires_at > Date.now()) {
    try {
      return JSON.parse(hit.payload) as T;
    } catch {
      delete store[key];
    }
  }

  if (!networkAllowed()) {
    if (hit) return JSON.parse(hit.payload) as T;
    throw new NetworkUnavailable("L'accès réseau est désactivé dans les réglages.");
  }

  try {
    const body = await rawGet(url);
    const value = JSON.parse(body) as T;
    store[key] = { payload: body, expires_at: Date.now() + ttlHours * 3_600_000 };
    persistNow();
    return value;
  } catch (error) {
    if (hit) {
      try {
        return JSON.parse(hit.payload) as T;
      } catch {
        /* fall through */
      }
    }
    throw error instanceof Error ? error : new NetworkUnavailable();
  }
}

/** Hands the current screen to Android's print service, which also makes PDFs. */
export function printPage(documentName: string): boolean {
  if (window.JVPrint) {
    window.JVPrint.page(documentName);
    return true;
  }
  if (typeof window.print === "function") {
    window.print();
    return true;
  }
  return false;
}
