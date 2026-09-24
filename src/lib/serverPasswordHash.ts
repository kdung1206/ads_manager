// ---------------------------------------------------------------------------
// Server-only password hashing (Node's built-in crypto.scrypt — slow,
// memory-hard, no new dependency). Never import from client code.
// ---------------------------------------------------------------------------
import crypto from "crypto";

const SCRYPT_PREFIX = "scrypt:";
const SCRYPT_KEYLEN = 64;

export function generateServerSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPasswordScrypt(password: string, salt: string): string {
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return SCRYPT_PREFIX + derived.toString("hex");
}

export async function verifyPasswordScrypt(
  password: string,
  salt: string | undefined | null,
  storedHash: string | undefined | null
): Promise<boolean> {
  if (!salt || !storedHash || !storedHash.startsWith(SCRYPT_PREFIX)) return false;
  const expected = hashPasswordScrypt(password, salt);
  const expectedBuf = Buffer.from(expected);
  const storedBuf = Buffer.from(storedHash);
  return expectedBuf.length === storedBuf.length && crypto.timingSafeEqual(expectedBuf, storedBuf);
}
