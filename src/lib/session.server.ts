/**
 * Session cookie helpers. The Deriv OAuth token is stored in an HTTP-only,
 * Secure, SameSite=Lax cookie. Never exposed to client JS.
 */
import { getCookie, setCookie, deleteCookie } from "@tanstack/react-start/server";

export const SESSION_COOKIE = "deriv_session";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export interface SessionData {
  token: string;
  loginid?: string;
  currency?: string;
}

function encode(data: SessionData): string {
  return Buffer.from(JSON.stringify(data), "utf8").toString("base64url");
}

function decode(raw: string): SessionData | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    if (typeof parsed?.token === "string" && parsed.token.length > 0) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function readSession(): SessionData | null {
  const raw = getCookie(SESSION_COOKIE);
  if (!raw) return null;
  return decode(raw);
}

export function writeSession(data: SessionData): void {
  setCookie(SESSION_COOKIE, encode(data), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export function clearSession(): void {
  deleteCookie(SESSION_COOKIE, { path: "/" });
}
