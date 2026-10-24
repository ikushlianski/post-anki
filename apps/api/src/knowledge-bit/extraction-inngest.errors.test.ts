import { NonRetriableError, RetryAfterError } from "inngest";
import { describe, expect, it } from "vitest";
import { rateLimitWaitMs, toChunkError } from "./extraction-inngest.errors.js";

function providerError(statusCode: number, responseHeaders: Record<string, string> = {}): Error {
  return Object.assign(new Error("Too many requests with SECRET-SOURCE-TEXT"), { statusCode, responseHeaders });
}

describe("toChunkError", () => {
  it("should wait the provider's retry-after seconds on a 429 instead of retrying at once", () => {
    const error = toChunkError(providerError(429, { "retry-after": "42" }));

    expect(error).toBeInstanceOf(RetryAfterError);
    expect((error as RetryAfterError).retryAfter).toBe("42");
  });

  it("should prefer the millisecond header when the provider sends both", () => {
    expect(rateLimitWaitMs(providerError(429, { "retry-after-ms": "2500", "retry-after": "60" }))).toBe(2500);
  });

  it("should find a 429 wrapped as the cause of another error", () => {
    const wrapped = new Error("agent failed", { cause: providerError(429, { "retry-after": "5" }) });

    expect(toChunkError(wrapped)).toBeInstanceOf(RetryAfterError);
  });

  it("should use a default wait when the 429 exposes no retry-after", () => {
    expect(rateLimitWaitMs(providerError(429))).toBe(30_000);
  });

  it("should cap an absurd retry-after so one run cannot be parked for hours", () => {
    expect(rateLimitWaitMs(providerError(429, { "retry-after": "86400" }))).toBe(600_000);
  });

  it.each(["wrong_language", "no_valid_items", "source_empty", "source_too_long"])(
    "should never retry the %s refusal or invalid-input outcome",
    (message) => {
      expect(toChunkError(new Error(message))).toBeInstanceOf(NonRetriableError);
    },
  );

  it("should not retry other provider failures because the model wrapper already did", () => {
    expect(toChunkError(providerError(500))).toBeInstanceOf(NonRetriableError);
  });

  it("should keep provider text out of the stored error message", () => {
    expect(toChunkError(providerError(500)).message).toBe("extraction_failed");
    expect(toChunkError(providerError(429)).message).not.toContain("SECRET");
  });
});
