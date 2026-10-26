import "server-only";
import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, options: { N: number; r: number; p: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, { ...options, maxmem: 64 * 1024 * 1024 }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** `scrypt$N$r$p$salt$key`, salt and key in base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, key] = stored.split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const expected = Buffer.from(key, "base64url");
  const actual = await derive(password, Buffer.from(salt, "base64url"), { N: Number(n), r: Number(r), p: Number(p) });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Verifies against a throwaway hash so an unknown email takes as long as a wrong password. */
let decoy: Promise<string> | null = null;
export async function spendPasswordCheck(password: string): Promise<void> {
  decoy ??= hashPassword("coffee-atlas-decoy-password");
  await verifyPassword(password, await decoy);
}

export const newSessionToken = (): string => randomBytes(32).toString("base64url");
export const newUserId = (): string => `user-${randomUUID()}`;

/** Only this keyed hash of a session token is stored, so a database leak does not expose live sessions. */
export const sessionTokenHash = (secret: string, token: string): string =>
  createHmac("sha256", secret).update(token).digest("hex");
