import { describe, expect, it } from "vitest";
import { updateAdminSettingsInput } from "./admin-settings";
import { updateSubjectStudyOptionsInput } from "./subject-study-options";

describe("subject study options contract", () => {
  it.each([[[]], [[0]], [[1441]], [[1.5]], [new Array(11).fill(5)]])(
    "should reject an empty or out-of-range steps list %j",
    (steps) => {
      expect(updateSubjectStudyOptionsInput.safeParse({ learningStepsMinutes: steps }).success).toBe(false);
    },
  );

  it("should accept null to clear an override so it re-inherits", () => {
    const parsed = updateSubjectStudyOptionsInput.parse({ newCardsPerDay: null });

    expect(parsed.newCardsPerDay).toBeNull();
  });

  it("should reject a body that changes nothing", () => {
    expect(updateSubjectStudyOptionsInput.safeParse({}).success).toBe(false);
  });

  it.each([[0.5], [1]])("should reject desired retention %s outside 0.7 to 0.99", (retention) => {
    expect(updateSubjectStudyOptionsInput.safeParse({ desiredRetention: retention }).success).toBe(false);
  });

  it("should clamp the app-wide defaults a learner sends instead of rejecting them", () => {
    const parsed = updateAdminSettingsInput.parse({
      learningStepsMinutes: [0, 5000],
      desiredRetention: 2,
    });

    expect(parsed.learningStepsMinutes).toEqual([1, 1440]);
    expect(parsed.desiredRetention).toBe(0.99);
  });
});
