import { describe, expect, it } from "vitest";
import type { StudyOptions } from "@post-anki/shared";
import { resolveStudyPlan, type StudyPlanChainLink } from "./study-plan-resolve";

const APP: StudyOptions = {
  newCardsPerDay: 20,
  maxReviewsPerDay: 200,
  learningStepsMinutes: [1, 10],
  relearningStepsMinutes: [10],
  desiredRetention: 0.9,
};

const link = (subjectId: string, patch: Partial<StudyPlanChainLink> = {}): StudyPlanChainLink => ({
  subjectId,
  options: {},
  studyIntent: null,
  examDate: null,
  examPlannedAt: null,
  ...patch,
});

describe("resolveStudyPlan", () => {
  it("should follow the nearest parent's intent and exam date together", () => {
    const plan = resolveStudyPlan(
      [link("child"), link("parent", { studyIntent: "exam", examDate: "2026-12-01", examPlannedAt: "2026-11-01T00:00:00Z" })],
      APP,
    );

    expect(plan).toMatchObject({ intent: "exam", examDate: "2026-12-01", intentSource: "parent" });
  });

  it("should let a child's own intent win", () => {
    const plan = resolveStudyPlan(
      [
        link("child", { studyIntent: "long_term" }),
        link("parent", { studyIntent: "exam", examDate: "2026-12-01" }),
      ],
      APP,
    );

    expect(plan).toMatchObject({ intent: "long_term", examDate: null, intentSource: "child" });
  });

  it("should ignore a new-cards value set above the exam subject", () => {
    const plan = resolveStudyPlan(
      [
        link("exam", { studyIntent: "exam", examDate: "2026-12-01" }),
        link("root", { options: { newCardsPerDay: 7 } }),
      ],
      APP,
    );

    expect(plan.explicitPerDay).toBeNull();
  });

  it("should honour a value set on the exam subject or below", () => {
    const below = resolveStudyPlan(
      [
        link("child", { options: { newCardsPerDay: 4 } }),
        link("exam", { studyIntent: "exam", examDate: "2026-12-01", options: { newCardsPerDay: 9 } }),
      ],
      APP,
    );
    const onExam = resolveStudyPlan(
      [link("child"), link("exam", { studyIntent: "exam", examDate: "2026-12-01", options: { newCardsPerDay: 9 } })],
      APP,
    );

    expect(below.explicitPerDay).toBe(4);
    expect(onExam.explicitPerDay).toBe(9);
  });

  it("should default to Long-term from the app", () => {
    const plan = resolveStudyPlan([link("only")], APP);

    expect(plan).toMatchObject({ intent: "long_term", intentSource: "app", desiredRetention: 0.9 });
  });

  it("should inherit retention exactly as before", () => {
    const plan = resolveStudyPlan([link("child"), link("parent", { options: { desiredRetention: 0.85 } })], APP);

    expect(plan.desiredRetention).toBe(0.85);
  });
});
