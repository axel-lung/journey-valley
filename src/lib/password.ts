import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEYLEN = 64;

/** Stored as `scrypt:<salt>:<derived key>` so the scheme can be rotated later. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEYLEN).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, digest] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !digest) return false;

  const expected = Buffer.from(digest, "hex");
  if (expected.length === 0) return false;

  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(expected, actual);
}
