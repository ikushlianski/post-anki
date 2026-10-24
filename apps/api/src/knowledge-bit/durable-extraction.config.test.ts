import { describe, expect, it } from "vitest";
import {
  DURABLE_CHUNK_DEADLINE_MS,
  DURABLE_STALE_RANGE_MS,
  DURABLE_TIMEOUT_RANGE_MS,
  durableStaleMs,
  durableTimeoutMs,
} from "./durable-extraction.config.js";

describe("durable extraction limits", () => {
  it("should keep the smallest stale cutoff above the largest launch timeout plus the chunk deadline", () => {
    expect(DURABLE_STALE_RANGE_MS.min).toBeGreaterThan(DURABLE_TIMEOUT_RANGE_MS.max + DURABLE_CHUNK_DEADLINE_MS);
  });

  it.each(["2147483648", "99999999999999999999", "1", "999", "-5", "0", "1.5", "abc", "", "  ", "300001"])(
    "should use the 10 s default for the launch timeout %j",
    (raw) => {
      expect(durableTimeoutMs(raw)).toBe(10_000);
    },
  );

  it.each([["1000", 1000], ["60000", 60_000], ["300000", 300_000]])(
    "should accept the launch timeout %s inside 1 s to 5 min",
    (raw, expected) => {
      expect(durableTimeoutMs(raw)).toBe(expected);
    },
  );

  it.each(["2147483648", "99999999999999999999", "1000", "1199999", "-5", "0", "abc", "", "21600001"])(
    "should use the 30 min default for the stale cutoff %j",
    (raw) => {
      expect(durableStaleMs(raw)).toBe(30 * 60 * 1000);
    },
  );

  it.each([["1200000", 1_200_000], ["3600000", 3_600_000], ["21600000", 21_600_000]])(
    "should accept the stale cutoff %s inside 20 min to 6 h",
    (raw, expected) => {
      expect(durableStaleMs(raw)).toBe(expected);
    },
  );
});
