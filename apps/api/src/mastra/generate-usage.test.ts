import { describe, expect, it } from "vitest";
import { readGenerateUsage } from "./generate-usage.js";

describe("readGenerateUsage", () => {
  it("should prefer the multi-step total over the last step usage", () => {
    expect(
      readGenerateUsage({
        usage: { inputTokens: 10, outputTokens: 5 },
        totalUsage: { inputTokens: 30, outputTokens: 15 },
      }),
    ).toEqual({ inputTokens: 30, outputTokens: 15 });
  });

  it("should fall back to the last step usage when no total is present", () => {
    expect(readGenerateUsage({ usage: { inputTokens: 7, outputTokens: 3 } })).toEqual({
      inputTokens: 7,
      outputTokens: 3,
    });
  });

  it("should report null for tokens the provider did not report instead of a made-up zero", () => {
    expect(readGenerateUsage({})).toEqual({ inputTokens: null, outputTokens: null });
    expect(readGenerateUsage({ usage: { inputTokens: 9 } })).toEqual({ inputTokens: 9, outputTokens: null });
  });
});
