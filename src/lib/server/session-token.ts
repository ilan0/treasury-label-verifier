import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SESSION_LIFETIME_SECONDS = 7 * 24 * 60 * 60;
const TOKEN_VERSION = "v1";
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type VerifiedSessionToken = {
  expiresAt: Date;
  id: string;
};

export class SessionConfigurationError extends Error {
  constructor() {
    super("The user session service is not configured.");
    this.name = "SessionConfigurationError";
  }
}

const globalForSession = globalThis as typeof globalThis & {
  proofcheckDevelopmentSessionSecret?: Buffer;
};

function sessionSecret(): Buffer {
  const configured = process.env.SESSION_SIGNING_SECRET?.trim();
  if (configured) {
    if (configured.length < 32) throw new SessionConfigurationError();
    return Buffer.from(configured, "utf8");
  }

  if (process.env.NODE_ENV === "production") {
    throw new SessionConfigurationError();
  }

  globalForSession.proofcheckDevelopmentSessionSecret ??= randomBytes(32);
  return globalForSession.proofcheckDevelopmentSessionSecret;
}

function signatureFor(payload: string): string {
  return createHmac("sha256", sessionSecret())
    .update(payload)
    .digest("base64url");
}

function constantTimeEqual(first: string, second: string): boolean {
  const firstBytes = Buffer.from(first, "utf8");
  const secondBytes = Buffer.from(second, "utf8");
  return (
    firstBytes.length === secondBytes.length &&
    timingSafeEqual(firstBytes, secondBytes)
  );
}

export function generateSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function signSessionToken(
  id: string,
  expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1_000),
): string {
  if (!SESSION_ID_PATTERN.test(id) || !Number.isFinite(expiresAt.getTime())) {
    throw new TypeError("Invalid user session token input.");
  }

  const expires = Math.floor(expiresAt.getTime() / 1_000);
  const payload = `${TOKEN_VERSION}.${id}.${expires}`;
  return `${payload}.${signatureFor(payload)}`;
}

export function verifySessionToken(
  token: string | undefined,
  now = new Date(),
): VerifiedSessionToken | null {
  if (!token || token.length > 256 || !Number.isFinite(now.getTime()))
    return null;

  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [version, id, expiresText, submittedSignature] = parts;
  if (
    version !== TOKEN_VERSION ||
    !SESSION_ID_PATTERN.test(id) ||
    !/^\d{10}$/.test(expiresText)
  ) {
    return null;
  }

  const expires = Number(expiresText);
  const nowSeconds = Math.floor(now.getTime() / 1_000);
  if (
    !Number.isSafeInteger(expires) ||
    expires <= nowSeconds ||
    expires > nowSeconds + SESSION_LIFETIME_SECONDS + 5 * 60
  ) {
    return null;
  }

  const payload = `${version}.${id}.${expiresText}`;
  if (!constantTimeEqual(signatureFor(payload), submittedSignature))
    return null;

  return { expiresAt: new Date(expires * 1_000), id };
}

export function sessionRecordId(id: string): string {
  if (!SESSION_ID_PATTERN.test(id))
    throw new TypeError("Invalid user session ID.");
  return createHmac("sha256", sessionSecret())
    .update(`record:${id}`)
    .digest("hex");
}

export function privacyPreservingIpHash(ipAddress: string): string {
  const normalized = ipAddress.trim().toLowerCase().slice(0, 128) || "unknown";
  const salt = process.env.RATE_LIMIT_SALT?.trim();
  const key =
    salt && salt.length >= 32 ? Buffer.from(salt, "utf8") : sessionSecret();
  return createHmac("sha256", key).update(`ip:${normalized}`).digest("hex");
}
