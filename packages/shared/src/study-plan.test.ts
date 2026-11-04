import { describe, expect, it } from "vitest";
import { examDateSchema, studyIntentSchema } from "./study-plan";
import { updateSubjectStudyOptionsInput } from "./subject-study-options";

describe("study plan contract", () => {
  it("should accept Exam with a real calendar date", () => {
    expect(updateSubjectStudyOptionsInput.safeParse({ studyIntent: "exam", examDate: "2026-12-01" }).success).toBe(
      true,
    );
  });

  it("should reject a date that does not exist on the calendar", () => {
    expect(examDateSchema.safeParse("2026-02-30").success).toBe(false);
  });

  it.each(["long_term", null])("should refuse an exam date sent with intent %s in the same change", (intent) => {
    expect(
      updateSubjectStudyOptionsInput.safeParse({ studyIntent: intent, examDate: "2026-12-01" }).success,
    ).toBe(false);
  });

  it("should allow clearing the date together with switching to Long-term", () => {
    expect(updateSubjectStudyOptionsInput.safeParse({ studyIntent: "long_term", examDate: null }).success).toBe(true);
  });

  it("should know only the two intents", () => {
    expect(studyIntentSchema.safeParse("sprint").success).toBe(false);
  });
});
