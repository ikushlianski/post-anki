import { describe, expect, it } from "vitest";
import { summarizeSourceStatuses } from "./txt-import-status.repo.js";

describe("summarizeSourceStatuses", () => {
  it("should count failed and discarded sources as finished so progress can stop", () => {
    const result = summarizeSourceStatuses([
      { status: "bits_detected", total: 2 },
      { status: "failed", total: "1" },
      { status: "discarded", total: 1 },
    ]);

    expect(result).toEqual({ extracted: 2, finished: 4 });
  });

  it("should not count sources still being processed as finished", () => {
    const result = summarizeSourceStatuses([
      { status: "pending", total: 3 },
      { status: "bits_detected", total: 1 },
    ]);

    expect(result).toEqual({ extracted: 1, finished: 1 });
  });
});
