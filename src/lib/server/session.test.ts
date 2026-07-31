import { afterEach, describe, expect, it } from "vitest";

import {
  assertSameOriginMutation,
  InvalidMutationOriginError,
} from "@/lib/server/session";

const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (configuredOrigin === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = configuredOrigin;
});

describe("mutation origin validation", () => {
  it("allows the request origin", () => {
    expect(() =>
      assertSameOriginMutation(
        new Request("https://proofcheck.example/api/demo", {
          method: "POST",
          headers: { origin: "https://proofcheck.example" },
        }),
      ),
    ).not.toThrow();
  });

  it("allows a reverse proxy's exact forwarded host", () => {
    expect(() =>
      assertSameOriginMutation(
        new Request("http://localhost:3000/api/demo", {
          method: "POST",
          headers: {
            origin: "http://127.0.0.1:3000",
            "x-forwarded-host": "127.0.0.1:3000",
            "x-forwarded-proto": "http",
          },
        }),
      ),
    ).not.toThrow();
  });

  it("rejects absent and cross-site origins", () => {
    expect(() =>
      assertSameOriginMutation(
        new Request("https://proofcheck.example/api/demo", { method: "POST" }),
      ),
    ).toThrow(InvalidMutationOriginError);
    expect(() =>
      assertSameOriginMutation(
        new Request("https://proofcheck.example/api/demo", {
          method: "POST",
          headers: { origin: "https://attacker.example" },
        }),
      ),
    ).toThrow(InvalidMutationOriginError);
  });
});
