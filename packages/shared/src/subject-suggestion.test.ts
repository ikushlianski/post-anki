import { describe, expect, it } from "vitest";
import {
  resolveSubjectSuggestionInput,
  subjectSuggestionSchema,
  triggerSubjectSuggestionScanResult,
} from "./subject-suggestion.js";

const validSuggestion = {
  id: "s1",
  kind: "new-subject",
  parentSubjectId: null,
  proposedName: "Cooking",
  reason: "Many unplaced bits about recipes",
  evidenceCount: 12,
  evidenceSamples: ["a", "b", "c"],
  status: "pending",
  createdSubjectId: null,
  createdAt: "2026-10-24T00:00:00.000Z",
  resolvedAt: null,
};

describe("subjectSuggestionSchema", () => {
  it("should accept a pending new-subject suggestion", () => {
    expect(subjectSuggestionSchema.safeParse(validSuggestion).success).toBe(true);
  });

  it("should reject more than 3 evidence samples so the review row stays compact", () => {
    const result = subjectSuggestionSchema.safeParse({
      ...validSuggestion,
      evidenceSamples: ["a", "b", "c", "d"],
    });

    expect(result.success).toBe(false);
  });

  it("should reject a sample longer than 200 characters", () => {
    const result = subjectSuggestionSchema.safeParse({
      ...validSuggestion,
      evidenceSamples: ["x".repeat(201)],
    });

    expect(result.success).toBe(false);
  });

  it("should reject an unknown status", () => {
    expect(subjectSuggestionSchema.safeParse({ ...validSuggestion, status: "open" }).success).toBe(
      false,
    );
  });
});

describe("resolveSubjectSuggestionInput", () => {
  it("should accept approve without a name", () => {
    expect(resolveSubjectSuggestionInput.safeParse({ action: "approve" }).success).toBe(true);
  });

  it("should trim an edited name on approve", () => {
    const result = resolveSubjectSuggestionInput.parse({ action: "approve", name: "  Cooking  " });

    expect(result).toEqual({ action: "approve", name: "Cooking" });
  });

  it("should reject an edited name shorter than 2 or longer than 60 characters", () => {
    expect(resolveSubjectSuggestionInput.safeParse({ action: "approve", name: "a" }).success).toBe(
      false,
    );
    expect(
      resolveSubjectSuggestionInput.safeParse({ action: "approve", name: "x".repeat(61) }).success,
    ).toBe(false);
  });

  it("should accept dismiss", () => {
    expect(resolveSubjectSuggestionInput.safeParse({ action: "dismiss" }).success).toBe(true);
  });

  it("should reject an unknown action", () => {
    expect(resolveSubjectSuggestionInput.safeParse({ action: "merge" }).success).toBe(false);
  });
});

describe("triggerSubjectSuggestionScanResult", () => {
  it("should accept scan counts with the budget flag", () => {
    const result = triggerSubjectSuggestionScanResult.safeParse({
      created: 1,
      skipped: 2,
      calls: 3,
      budgetStopped: true,
    });

    expect(result.success).toBe(true);
  });

  it("should reject negative counts", () => {
    const result = triggerSubjectSuggestionScanResult.safeParse({
      created: -1,
      skipped: 0,
      calls: 0,
      budgetStopped: false,
    });

    expect(result.success).toBe(false);
  });
});
