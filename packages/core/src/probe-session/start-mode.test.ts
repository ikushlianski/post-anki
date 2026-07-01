import { describe, it, expect } from "vitest";
import type { TopicProgress } from "@post-anki/shared";
import { deriveStartMode } from "./start-mode";

function progress(overrides: Partial<TopicProgress>): TopicProgress {
  return {
    status: "not_started",
    maturity: 0,
    attempts: 0,
    lastInteractedAt: null,
    ...overrides,
  };
}

describe("deriveStartMode", () => {
  it("routes a brand-new topic into a quiz probing session", () => {
    expect(deriveStartMode(progress({ status: "not_started" }))).toBe("quiz");
  });

  it("routes an in-progress topic into a Socratic conversation", () => {
    expect(
      deriveStartMode(progress({ status: "in_progress", attempts: 2, maturity: 30 })),
    ).toBe("socratic");
  });

  it("routes a mastered topic into a Socratic conversation", () => {
    expect(
      deriveStartMode(progress({ status: "mastered", attempts: 4, maturity: 90 })),
    ).toBe("socratic");
  });
});
