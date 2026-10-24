import { describe, expect, it } from "vitest";
import {
  BUSINESS_LEARNING_INTENT,
  DEFAULT_LEARNING_INTENT,
  inheritedLearningIntent,
  pickLearningIntent,
} from "./subject-learning-intent";

const rows = [
  { id: "r", name: "Business", parentId: null, learningIntent: "root own" },
  { id: "c", name: "Sales", parentId: "r", learningIntent: "child own" },
];

describe("learning intent resolution", () => {
  it("prefers the subject's own intent", () => {
    expect(pickLearningIntent("c", rows)).toBe("child own");
  });

  it("ignores the subject's own intent when computing what it would inherit", () => {
    expect(inheritedLearningIntent("c", rows)).toBe("root own");
  });

  it("falls back to the root-name default, then the generic default", () => {
    expect(inheritedLearningIntent("r", rows)).toBe(BUSINESS_LEARNING_INTENT);
    expect(pickLearningIntent("x", [{ id: "x", name: "Gardening", parentId: null, learningIntent: null }])).toBe(
      DEFAULT_LEARNING_INTENT,
    );
  });
});
