// ---------------------------------------------------------------------------
// Server-side session tokens — stateless HMAC-signed token carrying
// {username, name, role, exp}. Same mechanism as marketing_report_v2's
// src/server/auth.ts, copied so this project has zero runtime coupling to it.
// ---------------------------------------------------------------------------
import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import type { UserAccount } from "../lib/defaultUsers";

const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  throw new Error(
    "SESSION_SECRET chưa được cấu hình. Đặt SESSION_SECRET (một chuỗi ngẫu nhiên dài) trong .env.local " +
    "(dev) hoặc Vercel Environment Variables (production) — tạo bằng: " +
    'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
}

const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionPayload {
  username: string;
  name: string;
  role: UserAccount["role"];
  exp: number;
  sid: string;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function signSessionToken(user: Pick<UserAccount, "username" | "name" | "role">): { token: string; sid: string } {
  const payload: SessionPayload = {
    username: user.username,
    name: user.name,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
    sid: crypto.randomBytes(12).toString("hex"),
  };
  const data = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  return { token: `${data}.${signature}`, sid: payload.sid };
}

export function verifySessionToken(token: string | undefined | null): SessionPayload | null {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;

  const expected = crypto.createHmac("sha256", SESSION_SECRET).update(data).digest("base64url");
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as SessionPayload;
    if (!payload.exp || Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

const ROLE_RANK: Record<UserAccount["role"], number> = { Viewer: 0, Editor: 1, Admin: 2 };

// requireAuth() — any logged-in role (Viewer+). requireAuth("Editor") —
// Editor or Admin. requireAuth("Admin") — Admin only.
export function requireAuth(minRole: UserAccount["role"] = "Viewer") {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;
    const session = verifySessionToken(token);

    if (!session) {
      return res.status(401).json({ error: "Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." });
    }
    if (ROLE_RANK[session.role] < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: "Tài khoản của bạn không có quyền thực hiện hành động này." });
    }

    (req as any).session = session;
    next();
  };
}
