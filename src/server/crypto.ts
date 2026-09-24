// ---------------------------------------------------------------------------
// Shared AES-256-CBC helpers, keyed off ENCRYPTION_KEY. Every platform
// connection credential (Facebook/Google/TikTok access token) is encrypted
// with this before hitting storage — see connectionsStore.ts.
//
// No fallback value on purpose: a hardcoded default committed to this repo
// would let anyone decrypt every secret this key protects — fail loudly at
// startup instead of silently running with a key every reader of the source
// already knows.
// ---------------------------------------------------------------------------
import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  throw new Error(
    "ENCRYPTION_KEY chưa được cấu hình. Đặt ENCRYPTION_KEY (một chuỗi ngẫu nhiên dài) trong .env.local " +
    "(dev) hoặc Vercel Environment Variables (production)."
  );
}
const IV_LENGTH = 16;

export function encrypt(text: string): string {
  if (!text) return "";
  const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

export function decrypt(text: string): string {
  if (!text) return "";
  if (!text.includes(":")) return text;
  try {
    const parts = text.split(":");
    const iv = Buffer.from(parts.shift() || "", "hex");
    const encryptedText = Buffer.from(parts.join(":"), "hex");
    const key = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (err) {
    console.error("Decryption error:", err);
    return text;
  }
}
