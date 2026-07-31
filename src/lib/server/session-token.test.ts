import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  generateSessionId,
  privacyPreservingIpHash,
  sessionRecordId,
  SessionConfigurationError,
  signSessionToken,
  verifySessionToken,
} from "@/lib/server/session-token";

describe("user session tokens", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv(
      "SESSION_SIGNING_SECRET",
      "test-secret-that-is-at-least-thirty-two-characters-long",
    );
    vi.stubEnv(
      "RATE_LIMIT_SALT",
      "rate-limit-salt-that-is-at-least-thirty-two-characters",
    );
  });

  afterEach(() => vi.unstubAllEnvs());

  it("creates an opaque, signed, expiring token", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const expiresAt = new Date("2026-08-01T12:00:00.000Z");
    const id = generateSessionId();
    const token = signSessionToken(id, expiresAt);

    expect(id).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(verifySessionToken(token, now)).toEqual({ expiresAt, id });
    expect(sessionRecordId(id)).toMatch(/^[a-f0-9]{64}$/);
    expect(sessionRecordId(id)).not.toContain(id);
  });

  it("rejects tampered, expired, malformed, and implausibly long-lived tokens", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const id = generateSessionId();
    const valid = signSessionToken(id, new Date("2026-08-01T12:00:00.000Z"));
    const tampered = `${valid.slice(0, -1)}${valid.endsWith("a") ? "b" : "a"}`;

    expect(verifySessionToken(tampered, now)).toBeNull();
    expect(
      verifySessionToken(
        signSessionToken(id, new Date("2026-07-31T11:59:59.000Z")),
        now,
      ),
    ).toBeNull();
    expect(
      verifySessionToken(
        signSessionToken(id, new Date("2026-08-10T12:00:00.000Z")),
        now,
      ),
    ).toBeNull();
    expect(verifySessionToken("not-a-session", now)).toBeNull();
  });

  it("does not retain raw IP addresses in quota identifiers", () => {
    const first = privacyPreservingIpHash("203.0.113.24");
    expect(first).toBe(privacyPreservingIpHash("203.0.113.24"));
    expect(first).not.toContain("203.0.113.24");
    expect(first).not.toBe(privacyPreservingIpHash("203.0.113.25"));
  });

  it("fails closed when a production signing secret is absent", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SESSION_SIGNING_SECRET", "");

    expect(() => signSessionToken(generateSessionId())).toThrow(
      SessionConfigurationError,
    );
  });
});
