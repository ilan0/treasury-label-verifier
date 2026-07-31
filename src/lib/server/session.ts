import "server-only";

import { cookies } from "next/headers";

import {
  generateSessionId,
  privacyPreservingIpHash,
  SESSION_LIFETIME_SECONDS,
  sessionRecordId,
  signSessionToken,
  verifySessionToken,
} from "@/lib/server/session-token";

export const SESSION_COOKIE_NAME = "proofcheck_session";

export type UserSession = {
  expiresAt: Date;
  id: string;
  isNew: boolean;
  recordId: string;
};

export class SessionRequiredError extends Error {
  constructor() {
    super("An user session is required.");
    this.name = "SessionRequiredError";
  }
}

export class InvalidMutationOriginError extends Error {
  constructor() {
    super("The request origin is not allowed.");
    this.name = "InvalidMutationOriginError";
  }
}

function toSession(
  verified: NonNullable<ReturnType<typeof verifySessionToken>>,
  isNew: boolean,
): UserSession {
  return {
    expiresAt: verified.expiresAt,
    id: verified.id,
    isNew,
    recordId: sessionRecordId(verified.id),
  };
}

/** Reads a session without mutating response cookies; safe in Server Components. */
export async function readUserSession(): Promise<UserSession | null> {
  const cookieStore = await cookies();
  const verified = verifySessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  return verified ? toSession(verified, false) : null;
}

/** Issues a cookie when necessary. Call only from a Route Handler or Server Function. */
export async function getOrCreateUserSession(): Promise<UserSession> {
  const cookieStore = await cookies();
  const existing = verifySessionToken(
    cookieStore.get(SESSION_COOKIE_NAME)?.value,
  );
  if (existing) return toSession(existing, false);

  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1_000);
  cookieStore.set({
    expires: expiresAt,
    httpOnly: true,
    name: SESSION_COOKIE_NAME,
    path: "/",
    priority: "high",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: signSessionToken(id, expiresAt),
  });

  return { expiresAt, id, isNew: true, recordId: sessionRecordId(id) };
}

export async function requireUserSession(): Promise<UserSession> {
  const session = await readUserSession();
  if (!session) throw new SessionRequiredError();
  return session;
}

export async function clearUserSession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export function assertSameOriginMutation(request: Request): void {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return;

  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  const allowedOrigins = new Set([requestUrl.origin]);
  const forwardedHost =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  const forwardedProtocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    requestUrl.protocol.replace(":", "");
  if (forwardedHost && /^(https?|http)$/.test(forwardedProtocol))
    allowedOrigins.add(`${forwardedProtocol}://${forwardedHost}`);
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredOrigin) {
    try {
      allowedOrigins.add(new URL(configuredOrigin).origin);
    } catch {
      // Invalid deployment configuration is not treated as a trusted origin.
    }
  }
  if (!origin || !allowedOrigins.has(origin))
    throw new InvalidMutationOriginError();
}

export function clientIpHash(request: Request): string {
  const forwarded = request.headers
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  const direct = request.headers.get("x-real-ip")?.trim();
  return privacyPreservingIpHash(forwarded || direct || "unknown");
}
