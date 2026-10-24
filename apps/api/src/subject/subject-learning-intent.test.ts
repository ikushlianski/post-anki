import { describe, expect, it } from "vitest";
import {
  BUSINESS_LEARNING_INTENT,
  DEFAULT_INTENT_BY_ROOT_NAME,
  DEFAULT_LEARNING_INTENT,
  pickLearningIntent,
  resolveLearningIntent,
} from "./subject-learning-intent.js";

function row(id: string, name: string, parentId: string | null, learningIntent: string | null = null) {
  return { id, name, parentId, learningIntent };
}

describe("pickLearningIntent", () => {
  it("uses the subject's own intent before anything inherited", () => {
    const rows = [row("r", "Business", null, "root"), row("c", "Sales", "r", "own")];

    expect(pickLearningIntent("c", rows)).toBe("own");
  });

  it("falls back to the nearest ancestor that has an intent", () => {
    const rows = [row("r", "Business", null, "root"), row("m", "Mid", "r"), row("c", "Leaf", "m")];

    expect(pickLearningIntent("c", rows)).toBe("root");
  });

  it("treats a blank intent as unset", () => {
    const rows = [row("r", "Business", null, "root"), row("c", "Sales", "r", "   ")];

    expect(pickLearningIntent("c", rows)).toBe("root");
  });

  it("uses the root subject's built-in default when no intent is set in the chain", () => {
    const rows = [row("r", "Business", null), row("c", "Sales", "r")];

    expect(pickLearningIntent("c", rows)).toBe(BUSINESS_LEARNING_INTENT);
  });

  it("uses the generic default for an unknown root or missing subject", () => {
    const rows = [row("r", "Gardening", null), row("c", "Roses", "r")];

    expect(pickLearningIntent("c", rows)).toBe(DEFAULT_LEARNING_INTENT);
    expect(pickLearningIntent("missing", rows)).toBe(DEFAULT_LEARNING_INTENT);
  });

  it("does not loop forever on a parent cycle", () => {
    const rows = [row("a", "A", "b"), row("b", "B", "a")];

    expect(pickLearningIntent("a", rows)).toBe(DEFAULT_LEARNING_INTENT);
  });

  it("has a default for every seeded root subject", () => {
    expect(Object.keys(DEFAULT_INTENT_BY_ROOT_NAME)).toEqual(
      expect.arrayContaining(["Business", "AI", "Architecture", "Databases", "Cloud Computing"]),
    );
  });
});

describe("resolveLearningIntent", () => {
  it("returns the generic default without a subject", async () => {
    await expect(resolveLearningIntent(null)).resolves.toBe(DEFAULT_LEARNING_INTENT);
  });
});
