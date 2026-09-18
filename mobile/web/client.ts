/**
 * Le lien avec le serveur de l'agence.
 *
 * Trois exigences, dans cet ordre :
 *
 * 1. **Ça marche dans un avion.** Toute réponse est gardée ; hors réseau, c'est
 *    la dernière connue qui s'affiche, datée, plutôt qu'un écran vide. Un
 *    carnet de voyage qu'on ne peut pas ouvrir sans réseau ne sert à rien.
 * 2. **Le jeton reste en en-tête.** Jamais dans une URL, qui finit dans des
 *    journaux ; il est stocké avec le reste du document local.
 * 3. **Le même code tourne dans un navigateur**, où le pont Java est absent et
 *    où `fetch` prend le relais — c'est ce qui rend le bundle testable.
 */
import { bridgeRequest } from "./bridge";
import { getDb, persistNow } from "./store";

declare const __JV_SERVER__: string;

/** Injecté à la construction ; vide en développement dans un navigateur. */
export const SERVER: string =
  typeof __JV_SERVER__ === "string" && __JV_SERVER__ ? __JV_SERVER__ : "";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Le message du serveur, quand il en donne un ; sinon le code. */
function apiFailure(status: number, body: string): ApiError {
  let message = status > 0 ? `Erreur ${status}.` : body || "Serveur injoignable.";
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) message = parsed.error;
  } catch {
    /* le corps n'était pas du JSON */
  }
  return new ApiError(message, status);
}

function origin(): string {
  // Dans un navigateur de développement, le bundle est servi par le serveur
  // lui-même : on parle à la même origine.
  if (SERVER) return SERVER;
  if (typeof location !== "undefined" && location.protocol.startsWith("http")) return location.origin;
  return "";
}

async function call(path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<unknown> {
  const url = `${origin()}${path}`;
  const token = getToken();
  const method = options.method ?? "GET";
  const body = options.body === undefined ? null : JSON.stringify(options.body);

  const bridge = typeof window !== "undefined" ? window.JVNet : undefined;
  if (bridge && (method === "GET" ? bridge.getWithToken : bridge.post)) {
    const raw = await bridgeRequest({
      prefix: "a",
      timeoutMs: 20_000,
      onTimeout: () => new ApiError("Le serveur n'a pas répondu à temps.", 0),
      onFailure: ({ status, body: text }) => apiFailure(status, text),
      send: (id) => {
        if (method === "GET") bridge.getWithToken!(url, token ?? "", id);
        else bridge.post!(url, body ?? "", token ?? "", id);
      },
    });
    return JSON.parse(raw);
  }

  const response = await fetch(url, {
    method,
    headers: {
      accept: "application/json",
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ?? undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      (payload as { error?: string }).error ?? `Erreur ${response.status}.`,
      response.status,
    );
  }
  return payload;
}

/* ------------------------------------------------------------------ session */

export interface Session {
  token: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: "advisor" | "client";
    agency: { name: string; brand_colour: string } | null;
  };
}

export function getSession(): Session | null {
  return getDb().session ?? null;
}

function getToken(): string | null {
  return getDb().session?.token ?? null;
}

export async function signIn(email: string, password: string): Promise<Session> {
  const session = (await call("/api/mobile/login", {
    method: "POST",
    body: { email, password },
  })) as Session;

  const db = getDb();
  db.session = session;
  // Un compte en remplace un autre : les données du précédent ne doivent pas
  // rester lisibles sur le téléphone.
  db.cache = {};
  persistNow();
  return session;
}

export function signOut(): void {
  const db = getDb();
  delete db.session;
  db.cache = {};
  persistNow();
}

/* -------------------------------------------------------------- les données */

export interface Cached<T> {
  value: T;
  /** Quand la réponse a été obtenue, pour pouvoir le dire à l'écran. */
  fetched_at: number;
  /** Vrai quand elle vient du cache faute de réseau. */
  stale: boolean;
}

async function cached<T>(key: string, path: string): Promise<Cached<T>> {
  const db = getDb();
  db.cache ??= {};
  const hit = db.cache[key];

  try {
    const value = (await call(path)) as T;
    db.cache[key] = { payload: JSON.stringify(value), expires_at: Date.now() };
    persistNow();
    return { value, fetched_at: Date.now(), stale: false };
  } catch (error) {
    // Une session expirée doit remonter : se reconnecter est la seule issue,
    // et servir un cache périmé masquerait le problème.
    if (error instanceof ApiError && error.status === 401) throw error;
    if (!hit) throw error;
    return {
      value: JSON.parse(hit.payload) as T,
      fetched_at: hit.expires_at,
      stale: true,
    };
  }
}

export interface FileSummary {
  id: number;
  title: string;
  city: string;
  country: string;
  start_date: string;
  end_date: string;
  stage: string;
  stage_label: string;
  countdown: string;
  upcoming: boolean;
  client_name: string | null;
  sell_cents?: number;
  cost_cents?: number;
  margin_net_cents?: number;
  margin_percent?: number;
  margin_firm?: boolean;
  price_cents?: number;
}

export interface Home {
  user: Session["user"];
  files: FileSummary[];
  totals?: {
    files: number;
    sell_cents: number;
    margin_net_cents: number;
    margin_percent: number;
    vat_cents: number;
  };
}

export interface FileDetail extends FileSummary {
  summary: string;
  travellers: string[];
  days: Array<{
    date: string;
    day_number: number;
    entries: Array<{ label: string; detail: string; kind: "start" | "return" | "ongoing" }>;
  }>;
  bookings: Array<{
    id: number;
    label: string;
    detail: string;
    date: string;
    reference: string | null;
    cost_cents?: number;
    sell_cents?: number;
    zone?: string;
  }>;
  checklist: Array<{ id: number; label: string; done: boolean }>;
  quotes?: Array<{
    reference: string;
    status: string;
    status_label: string;
    total_cents: number;
    token: string;
  }>;
  budget?: { committed_cents: number; budget_cents: number; percent_used: number };
}

export const fetchHome = (): Promise<Cached<Home>> => cached<Home>("home", "/api/mobile/home");

export const fetchFile = (id: number): Promise<Cached<FileDetail>> =>
  cached<FileDetail>(`file:${id}`, `/api/mobile/file/${id}`);
