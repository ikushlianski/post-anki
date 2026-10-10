import { describe, expect, it } from "vitest";
import { resolveCorsDecision } from "./cors.js";

const webOrigin = "http://localhost:5540";
const extensionId = "abcdefghijklmnopabcdefghijklmnop";

describe("resolveCorsDecision", () => {
  it("should echo the web origin so the web app's browser calls keep working", () => {
    expect(resolveCorsDecision({ requestOrigin: webOrigin, webOrigin, extensionId: undefined })).toEqual({
      allowedOrigin: webOrigin,
    });
  });

  it("should echo the extension origin only when EXTENSION_ID matches exactly", () => {
    expect(
      resolveCorsDecision({ requestOrigin: `chrome-extension://${extensionId}`, webOrigin, extensionId }),
    ).toEqual({ allowedOrigin: `chrome-extension://${extensionId}` });
  });

  it("should reject the extension origin when EXTENSION_ID is unset", () => {
    expect(
      resolveCorsDecision({
        requestOrigin: `chrome-extension://${extensionId}`,
        webOrigin,
        extensionId: undefined,
      }),
    ).toEqual({ forbidden: true });
  });

  it("should reject a different extension id", () => {
    expect(
      resolveCorsDecision({ requestOrigin: "chrome-extension://other", webOrigin, extensionId }),
    ).toEqual({ forbidden: true });
  });

  it("should reject an arbitrary web page origin", () => {
    expect(resolveCorsDecision({ requestOrigin: "https://evil.example", webOrigin, extensionId })).toEqual({
      forbidden: true,
    });
  });

  it("should let origin-less server-to-server callers through unchanged", () => {
    expect(resolveCorsDecision({ requestOrigin: undefined, webOrigin, extensionId })).toEqual({
      noOrigin: true,
    });
  });

  it("should never return a wildcard origin", () => {
    const decision = resolveCorsDecision({ requestOrigin: "*", webOrigin, extensionId });

    expect(decision).toEqual({ forbidden: true });
  });
});
