import { getDb } from "../db";

/**
 * Shared plumbing for the free, key-less APIs the app leans on.
 *
 * All of them are run by volunteers or small teams and publish usage policies:
 * identify yourself, do not hammer, cache what you get. So every call goes
 * through here — one timeout, one User-Agent, one cache — rather than each
 * provider inventing its own.
 */

const USER_AGENT =
  process.env.JV_USER_AGENT ??
  "JourneyValley/0.1 (https://github.com/axel-lung/journey-valley)";

export class ApiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiUnavailableError";
  }
}

export interface FetchOptions {
  /** Give up after this many milliseconds; these services can be slow. */
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": USER_AGENT,
        ...options.headers,
      },
    });

    if (response.status === 429) {
      throw new ApiUnavailableError("Le service gratuit limite le nombre d'appels — réessayez plus tard.");
    }
    if (!response.ok) {
      throw new ApiUnavailableError(`Le service a répondu HTTP ${response.status}.`);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ApiUnavailableError("Le service n'a pas répondu à temps.");
    }
    throw new ApiUnavailableError("Service injoignable depuis ce serveur.");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads through a small SQLite cache before hitting the network.
 *
 * Caching is not an optimisation here, it is the price of admission: these
 * services ask you not to re-request what you already have. A stale entry is
 * also the last line of defence — when the network is down, `cachedJson`
 * returns the expired copy rather than failing.
 */
export async function cachedJson<T>(
  key: string,
  ttlHours: number,
  loader: () => Promise<T>,
): Promise<{ value: T; cached: boolean; fetched_at: string }> {
  const db = getDb();
  const row = db
    .prepare<[string], { payload: string; fetched_at: string; expires_at: string }>(
      `SELECT payload, fetched_at, expires_at FROM api_cache WHERE key = ?`,
    )
    .get(key);

  if (row && Date.parse(row.expires_at) > Date.now()) {
    try {
      return { value: JSON.parse(row.payload) as T, cached: true, fetched_at: row.fetched_at };
    } catch {
      // A corrupt entry is not worth keeping.
      db.prepare(`DELETE FROM api_cache WHERE key = ?`).run(key);
    }
  }

  try {
    const value = await loader();
    const now = new Date();
    const expires = new Date(now.getTime() + ttlHours * 3600_000);

    db.prepare(
      `INSERT INTO api_cache (key, payload, fetched_at, expires_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET payload = excluded.payload,
                                      fetched_at = excluded.fetched_at,
                                      expires_at = excluded.expires_at`,
    ).run(key, JSON.stringify(value), now.toISOString(), expires.toISOString());

    return { value, cached: false, fetched_at: now.toISOString() };
  } catch (error) {
    if (row) {
      // Expired, but better than nothing — and the caller is told it is old.
      try {
        return { value: JSON.parse(row.payload) as T, cached: true, fetched_at: row.fetched_at };
      } catch {
        /* fall through to the error */
      }
    }
    throw error;
  }
}
