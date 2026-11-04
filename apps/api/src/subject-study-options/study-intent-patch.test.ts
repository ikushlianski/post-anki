import { describe, expect, it } from "vitest";
import { validateStudyIntentPatch } from "./study-intent-patch.js";

const TODAY = "2026-11-01";
const none = { studyIntent: null, examDate: null };

describe("validateStudyIntentPatch", () => {
  it("should refuse Exam without a date", () => {
    expect(validateStudyIntentPatch(none, { studyIntent: "exam" }, TODAY)).toEqual({
      ok: false,
      error: "exam_date_required",
    });
  });

  it("should accept Exam with a date and ask for the plan to be stamped", () => {
    expect(validateStudyIntentPatch(none, { studyIntent: "exam", examDate: "2026-12-01" }, TODAY)).toEqual({
      ok: true,
      changed: true,
      next: { studyIntent: "exam", examDate: "2026-12-01" },
      restampPlan: true,
    });
  });

  it("should refuse a past date", () => {
    expect(validateStudyIntentPatch(none, { studyIntent: "exam", examDate: "2026-10-31" }, TODAY)).toEqual({
      ok: false,
      error: "exam_date_in_past",
    });
  });

  it("should accept today as the exam date", () => {
    expect(validateStudyIntentPatch(none, { studyIntent: "exam", examDate: TODAY }, TODAY).ok).toBe(true);
  });

  it("should refuse a date over two years ahead", () => {
    expect(validateStudyIntentPatch(none, { studyIntent: "exam", examDate: "2028-11-02" }, TODAY)).toEqual({
      ok: false,
      error: "exam_date_too_far",
    });
  });

  it("should refuse a date when the intent is not Exam", () => {
    expect(validateStudyIntentPatch(none, { examDate: "2026-12-01" }, TODAY)).toEqual({
      ok: false,
      error: "exam_date_requires_exam_intent",
    });
  });

  it("should clear the date when switching to Long-term", () => {
    const stored = { studyIntent: "exam" as const, examDate: "2026-12-01" };

    expect(validateStudyIntentPatch(stored, { studyIntent: "long_term" }, TODAY)).toEqual({
      ok: true,
      changed: true,
      next: { studyIntent: "long_term", examDate: null },
      restampPlan: false,
    });
  });

  it("should restart the plan clock only when the date moves", () => {
    const stored = { studyIntent: "exam" as const, examDate: "2026-12-01" };

    expect(validateStudyIntentPatch(stored, { examDate: "2026-12-15" }, TODAY)).toMatchObject({ restampPlan: true });
    expect(validateStudyIntentPatch(stored, { studyIntent: "exam", examDate: "2026-12-01" }, TODAY)).toEqual({
      ok: true,
      changed: false,
    });
  });
});
