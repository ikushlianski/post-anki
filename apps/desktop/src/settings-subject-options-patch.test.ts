import { describe, expect, it } from "vitest";
import type { SubjectStudyOptions } from "@/api/settings-commands";
import {
  buildSubjectOptionsPatch,
  draftFromOptions,
  type SubjectOptionsDraft,
} from "@/settings-subject-options-patch";

const INHERITED: SubjectStudyOptions = {
  own: {
    newCardsPerDay: null,
    learningStepsMinutes: null,
    relearningStepsMinutes: null,
    desiredRetention: null,
    studyIntent: null,
    examDate: null,
    detailLevel: null,
    hintingEnabled: null,
  },
  intent: { studyIntent: "long_term", examDate: null },
  effective: {
    newCardsPerDay: 20,
    learningStepsMinutes: [1, 10],
    relearningStepsMinutes: [10],
    desiredRetention: 0.9,
  },
};

describe("draftFromOptions", () => {
  it("should show the inherited values and the Same as parent choice for a subject with no overrides", () => {
    const draft = draftFromOptions(INHERITED);

    expect(draft.intent).toBe("inherit");
    expect(draft.retention).toBe("90");
    expect(draft.learningSteps).toBe("1, 10");
    expect(draft.detailLevel).toBe("standard");
  });
});

describe("buildSubjectOptionsPatch", () => {
  it("should send nothing when the form still shows the inherited values", () => {
    const draft = draftFromOptions(INHERITED);

    expect(buildSubjectOptionsPatch(draft, INHERITED)).toEqual({ ok: true, value: {} });
  });

  it("should send only the field the user changed so other fields keep inheriting", () => {
    const draft: SubjectOptionsDraft = { ...draftFromOptions(INHERITED), retention: "95" };

    expect(buildSubjectOptionsPatch(draft, INHERITED)).toEqual({
      ok: true,
      value: { desiredRetention: 0.95 },
    });
  });

  it("should refuse an exam intent with no exam date so the subject is never left half set", () => {
    const draft: SubjectOptionsDraft = { ...draftFromOptions(INHERITED), intent: "exam", examDate: "" };

    expect(buildSubjectOptionsPatch(draft, INHERITED).ok).toBe(false);
  });

  it("should send the exam intent with its date when the user picks an exam", () => {
    const draft: SubjectOptionsDraft = {
      ...draftFromOptions(INHERITED),
      intent: "exam",
      examDate: "2027-06-15",
    };

    expect(buildSubjectOptionsPatch(draft, INHERITED)).toEqual({
      ok: true,
      value: { studyIntent: "exam", examDate: "2027-06-15" },
    });
  });

  it("should clear an old exam date when the subject stops studying for an exam", () => {
    const exam: SubjectStudyOptions = {
      ...INHERITED,
      own: { ...INHERITED.own, studyIntent: "exam", examDate: "2027-06-15" },
    };
    const draft: SubjectOptionsDraft = { ...draftFromOptions(exam), intent: "long_term" };

    expect(buildSubjectOptionsPatch(draft, exam)).toEqual({
      ok: true,
      value: { studyIntent: "long_term", examDate: null },
    });
  });

  it("should refuse a new cards value above 200 before it reaches the server", () => {
    const draft: SubjectOptionsDraft = { ...draftFromOptions(INHERITED), newCards: "500" };

    expect(buildSubjectOptionsPatch(draft, INHERITED).ok).toBe(false);
  });
});
