import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { hashPassword, verifyPassword } from "./password";
import { isCurrency, type Currency } from "./money";
import { createAgency } from "./agency";
import type { User, UserRole } from "./types";

const SESSION_COOKIE = "jv_session";
const SESSION_TTL_DAYS = 30;

export { hashPassword, verifyPassword };

export function authenticate(email: string, password: string): User | null {
  const row = getDb()
    .prepare<[string], User & { password_hash: string }>(
      `SELECT * FROM users WHERE email = ? COLLATE NOCASE`,
    )
    .get(email.trim().toLowerCase());

  if (!row) {
    // Spend comparable time on unknown emails so the form does not leak which
    // addresses have an account.
    verifyPassword(password, hashPassword("placeholder"));
    return null;
  }
  if (!verifyPassword(password, row.password_hash)) return null;

  const { password_hash: _hash, ...user } = row;
  return user;
}

export class EmailTakenError extends Error {
  constructor() {
    super("That email already has an account.");
    this.name = "EmailTakenError";
  }
}

/**
 * Crée un compte.
 *
 * Sans nom d'agence, c'est un compte client : le voyageur que son conseiller
 * invite, qui voit ses dossiers et rien d'autre. Avec un nom d'agence, c'est un
 * conseiller, et l'agence naît avec lui — une inscription, pas deux.
 */
export function registerUser(input: {
  email: string;
  name: string;
  password: string;
  homeCity: string;
  currency: string;
  agencyName?: string;
  role?: UserRole;
}): User {
  const db = getDb();
  const email = input.email.trim().toLowerCase();

  const existing = db
    .prepare<[string], { id: number }>(`SELECT id FROM users WHERE email = ? COLLATE NOCASE`)
    .get(email);
  if (existing) throw new EmailTakenError();

  const currency: Currency = isCurrency(input.currency) ? input.currency : "EUR";
  const agencyName = input.agencyName?.trim() ?? "";
  const role: UserRole = input.role ?? (agencyName ? "advisor" : "client");
  const agency = role === "advisor" && agencyName ? createAgency({ name: agencyName, currency }) : null;

  const result = db
    .prepare(
      `INSERT INTO users (email, name, password_hash, plan, home_city, currency, role, agency_id)
       VALUES (?, ?, ?, 'free', ?, ?, ?, ?)`,
    )
    .run(
      email,
      input.name.trim(),
      hashPassword(input.password),
      input.homeCity.trim(),
      currency,
      role,
      agency?.id ?? null,
    );

  return db
    .prepare<[number], User>(
      `SELECT id, email, name, plan, home_city, currency, role, agency_id, created_at
         FROM users WHERE id = ?`,
    )
    .get(Number(result.lastInsertRowid))!;
}

/**
 * Remplace le mot de passe d'un compte, et coupe toutes ses sessions.
 *
 * Couper les sessions est le point important : on change son mot de passe
 * parce qu'on soupçonne quelqu'un d'autre de le connaître, et le laisser
 * connecté viderait le geste de son sens.
 */
export function setPassword(userId: number, password: string): void {
  const db = getDb();
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(
    hashPassword(password),
    userId,
  );
  db.prepare(`DELETE FROM sessions WHERE user_id = ?`).run(userId);
}

export async function createSession(userId: number): Promise<void> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  getDb()
    .prepare(`INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)`)
    .run(id, userId, expiresAt.toISOString());

  const store = await cookies();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const id = store.get(SESSION_COOKIE)?.value;
  if (id) getDb().prepare(`DELETE FROM sessions WHERE id = ?`).run(id);
  store.delete(SESSION_COOKIE);
}

/** Returns the signed-in user, or null when there is no valid session. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const sessionId = store.get(SESSION_COOKIE)?.value;
  if (!sessionId) return null;

  const db = getDb();
  const row = db
    .prepare<[string], User & { expires_at: string }>(
      `SELECT u.id, u.email, u.name, u.plan, u.home_city, u.currency, u.role, u.agency_id,
              u.created_at, s.expires_at
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ?`,
    )
    .get(sessionId);

  if (!row) return null;

  if (Date.parse(row.expires_at) < Date.now()) {
    db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
    return null;
  }

  const { expires_at: _expires, ...user } = row;
  return user;
}

/** Same as `getCurrentUser` but throws — for pages already behind the app shell. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new Error("UNAUTHENTICATED");
  return user;
}
