import { describe, expect, it } from "vitest";

import { isRetryable } from "./pending-capture.js";
import type { SendCaptureResult } from "./send-capture.js";

describe("isRetryable", () => {
  const cases: Array<[string, SendCaptureResult, boolean]> = [
    ["a saved capture is not kept", { ok: true }, false],
    ["a network failure is kept for retry", { ok: false, reason: "network" }, true],
    ["a rate-limited 429 is kept for retry", { ok: false, reason: "rate_limited" }, true],
    ["a server 500 is kept for retry", { ok: false, reason: "unexpected", status: 500 }, true],
    ["a server 503 is kept for retry", { ok: false, reason: "unexpected", status: 503 }, true],
    ["an unknown 4xx is cleared", { ok: false, reason: "unexpected", status: 418 }, false],
    ["a 400 rejected text is cleared", { ok: false, reason: "bad_request" }, false],
    ["a 401 rejected token is cleared", { ok: false, reason: "unauthorized" }, false],
    ["a 403 forbidden is cleared", { ok: false, reason: "forbidden" }, false],
    ["a 409 duplicate is cleared", { ok: false, reason: "already_added" }, false],
    ["a 413 too-large selection is cleared", { ok: false, reason: "too_large" }, false],
  ];

  it.each(cases)("should decide: %s", (_name, result, expected) => {
    expect(isRetryable(result)).toBe(expected);
  });
});
