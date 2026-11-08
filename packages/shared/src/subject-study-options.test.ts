import { describe, expect, it } from "vitest";
import { updateAdminSettingsInput } from "./admin-settings";
import { updateSubjectStudyOptionsInput } from "./subject-study-options";
import { subjectReviewDueCountsSchema } from "./subject-review-due";

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

  it("should accept a review cap including zero and null to clear it", () => {
    expect(updateSubjectStudyOptionsInput.parse({ maxReviewsPerDay: 0 }).maxReviewsPerDay).toBe(0);
    expect(updateSubjectStudyOptionsInput.parse({ maxReviewsPerDay: 50 }).maxReviewsPerDay).toBe(50);
    expect(updateSubjectStudyOptionsInput.parse({ maxReviewsPerDay: null }).maxReviewsPerDay).toBeNull();
  });

  it.each([[-1], [10000], [1.5]])("should reject review cap %s", (value) => {
    expect(updateSubjectStudyOptionsInput.safeParse({ maxReviewsPerDay: value }).success).toBe(false);
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

describe("subject review due counts contract", () => {
  it("should parse an older payload without today fields and fill safe defaults", () => {
    const parsed = subjectReviewDueCountsSchema.parse({
      subjects: [{ subjectId: "s1", dueCount: 4, newCount: 2 }],
      unsorted: { dueCount: 1, newCount: 0 },
      newRemainingToday: 5,
    });

    expect(parsed.subjects[0]).toMatchObject({
      reviewTodayCount: 0,
      learningDueCount: 0,
      todayCount: 0,
      limits: null,
    });
    expect(parsed.unsorted).toMatchObject({ reviewTodayCount: 0, learningDueCount: 0, todayCount: 0 });
    expect(parsed.reviewsRemainingToday).toBeNull();
  });

  it("should keep the today counts, limits and remaining reviews of a full payload", () => {
    const parsed = subjectReviewDueCountsSchema.parse({
      subjects: [
        {
          subjectId: "s1",
          dueCount: 4,
          newCount: 2,
          reviewTodayCount: 3,
          learningDueCount: 1,
          todayCount: 6,
          limits: { newCardsPerDay: 10, maxReviewsPerDay: 0 },
        },
      ],
      unsorted: { dueCount: 0, newCount: 0, reviewTodayCount: 0, learningDueCount: 0, todayCount: 0 },
      newRemainingToday: 5,
      reviewsRemainingToday: 120,
    });

    expect(parsed.subjects[0]?.todayCount).toBe(6);
    expect(parsed.subjects[0]?.limits).toEqual({ newCardsPerDay: 10, maxReviewsPerDay: 0 });
    expect(parsed.reviewsRemainingToday).toBe(120);
  });
});
