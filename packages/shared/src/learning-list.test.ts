import { describe, expect, it } from "vitest";
import {
  captureLearningListItemInput,
  chooseLearningListDestinationInput,
  resolveLearningListRecommendationInput,
} from "./learning-list";

describe("captureLearningListItemInput", () => {
  it("should fill defaults for kind, description and sub-subject", () => {
    expect(captureLearningListItemInput.parse({ url: "https://a.example", subjectId: "s1" })).toEqual({
      url: "https://a.example",
      kind: "article",
      pastedDescription: null,
      subjectId: "s1",
      subSubjectNodeId: null,
    });
  });

  it("should reject a missing subject and an unknown kind", () => {
    expect(captureLearningListItemInput.safeParse({ url: "https://a.example" }).success).toBe(false);
    expect(captureLearningListItemInput.safeParse({ url: "u", subjectId: "s", kind: "podcast" }).success).toBe(false);
  });
});

describe("resolveLearningListRecommendationInput", () => {
  it("should accept approve and decline only", () => {
    expect(resolveLearningListRecommendationInput.safeParse({ decision: "approve" }).success).toBe(true);
    expect(resolveLearningListRecommendationInput.safeParse({ decision: "maybe" }).success).toBe(false);
  });
});

describe("chooseLearningListDestinationInput", () => {
  it("should accept mini_course and fold_in only", () => {
    expect(chooseLearningListDestinationInput.safeParse({ destination: "fold_in" }).success).toBe(true);
    expect(chooseLearningListDestinationInput.safeParse({ destination: "trash" }).success).toBe(false);
  });
});
