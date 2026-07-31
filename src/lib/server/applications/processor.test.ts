import { describe, expect, it } from "vitest";

import { applicationFileDataUri } from "./processor";

describe("applicationFileDataUri", () => {
  it("qualifies base64 bytes with their MIME type for OpenAI file input", () => {
    expect(
      applicationFileDataUri(Buffer.from("Brand: TEST"), "text/plain"),
    ).toBe("data:text/plain;base64,QnJhbmQ6IFRFU1Q=");
  });

  it("rejects an invalid MIME type", () => {
    expect(() =>
      applicationFileDataUri(Buffer.from("test"), "text/plain;evil=true"),
    ).toThrow("INVALID_DOCUMENT_MIME_TYPE");
  });
});
