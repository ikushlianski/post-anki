import { describe, expect, it } from "vitest";
import { recordAttemptInput } from "./attempt";
import { createCurriculumInput } from "./curriculum";
import { decideInput } from "./decide";
import { declareGapInput } from "./gap";
import { editKnowledgeBitQuestionVariantInput } from "./knowledge-bit";
import { createModuleInput, updateModuleInput } from "./module";
import { captureNoteInput } from "./note";
import { submitProbeInput } from "./probe";
import { answerSocraticInput } from "./socratic";
import { createSubjectCategoryInput, renameCategoryInput } from "./subject-category";
import {
  CARD_TEXT_MAX_CHARS,
  NOTE_BODY_MAX_CHARS,
  TITLE_MAX_CHARS,
  TYPED_ANSWER_MAX_CHARS,
} from "./text-limits";
import { createTopicInput, updateTopicInput } from "./topic";

const title = (length: number) => "t".repeat(length);

describe("card text caps", () => {
  it("should accept a card prompt and answer at the cap and refuse one character more", () => {
    const at = "x".repeat(CARD_TEXT_MAX_CHARS);

    expect(editKnowledgeBitQuestionVariantInput.safeParse({ prompt: at, answer: at }).success).toBe(
      true,
    );
    expect(
      editKnowledgeBitQuestionVariantInput.safeParse({ prompt: `${at}x`, answer: "a" }).success,
    ).toBe(false);
    expect(
      editKnowledgeBitQuestionVariantInput.safeParse({ prompt: "q", answer: `${at}x` }).success,
    ).toBe(false);
  });
});

describe("typed answer caps", () => {
  const at = "a".repeat(TYPED_ANSWER_MAX_CHARS);
  const over = `${at}a`;

  it("should cap probe answers", () => {
    const base = { topicId: "t", gapId: null, mode: "socratic" as const };

    expect(submitProbeInput.safeParse({ ...base, answer: at }).success).toBe(true);
    expect(submitProbeInput.safeParse({ ...base, answer: over }).success).toBe(false);
  });

  it("should cap socratic answers", () => {
    const base = { sessionId: "s", turnId: "t" };

    expect(answerSocraticInput.safeParse({ ...base, answer: at }).success).toBe(true);
    expect(answerSocraticInput.safeParse({ ...base, answer: over }).success).toBe(false);
  });

  it("should cap attempt answers", () => {
    const base = { topicId: "t", questionId: "q", mode: "socratic" as const };

    expect(recordAttemptInput.safeParse({ ...base, answer: at }).success).toBe(true);
    expect(recordAttemptInput.safeParse({ ...base, answer: over }).success).toBe(false);
  });

  it("should cap decide decision and opinion", () => {
    expect(decideInput.safeParse({ decision: at, opinion: at }).success).toBe(true);
    expect(decideInput.safeParse({ decision: over, opinion: "o" }).success).toBe(false);
    expect(decideInput.safeParse({ decision: "d", opinion: over }).success).toBe(false);
  });
});

describe("title and name caps", () => {
  it("should cap module titles on create and update", () => {
    expect(
      createModuleInput.safeParse({ curriculumId: "c", title: title(TITLE_MAX_CHARS) }).success,
    ).toBe(true);
    expect(
      createModuleInput.safeParse({ curriculumId: "c", title: title(TITLE_MAX_CHARS + 1) }).success,
    ).toBe(false);
    expect(
      updateModuleInput.safeParse({ moduleId: "m", title: title(TITLE_MAX_CHARS + 1) }).success,
    ).toBe(false);
  });

  it("should cap topic titles on create and update", () => {
    expect(
      createTopicInput.safeParse({ moduleId: "m", title: title(TITLE_MAX_CHARS) }).success,
    ).toBe(true);
    expect(
      createTopicInput.safeParse({ moduleId: "m", title: title(TITLE_MAX_CHARS + 1) }).success,
    ).toBe(false);
    expect(
      updateTopicInput.safeParse({ topicId: "t", title: title(TITLE_MAX_CHARS + 1) }).success,
    ).toBe(false);
  });

  it("should cap curriculum names", () => {
    expect(
      createCurriculumInput.safeParse({ subjectId: "s", name: title(TITLE_MAX_CHARS) }).success,
    ).toBe(true);
    expect(
      createCurriculumInput.safeParse({ subjectId: "s", name: title(TITLE_MAX_CHARS + 1) }).success,
    ).toBe(false);
  });

  it("should cap category names on create and rename", () => {
    expect(
      createSubjectCategoryInput.safeParse({ subjectId: "s", name: title(TITLE_MAX_CHARS) })
        .success,
    ).toBe(true);
    expect(
      createSubjectCategoryInput.safeParse({ subjectId: "s", name: title(TITLE_MAX_CHARS + 1) })
        .success,
    ).toBe(false);
    expect(renameCategoryInput.safeParse({ name: title(TITLE_MAX_CHARS + 1) }).success).toBe(false);
  });

  it("should cap gap labels", () => {
    expect(declareGapInput.safeParse({ topicId: "t", label: title(TITLE_MAX_CHARS) }).success).toBe(
      true,
    );
    expect(
      declareGapInput.safeParse({ topicId: "t", label: title(TITLE_MAX_CHARS + 1) }).success,
    ).toBe(false);
  });

  it("should refuse a blank title", () => {
    expect(createModuleInput.safeParse({ curriculumId: "c", title: "   " }).success).toBe(false);
  });
});

describe("note body cap", () => {
  it("should accept a note at the cap and refuse one character more", () => {
    const base = { nodeType: "topic" as const, nodeId: "n" };

    expect(
      captureNoteInput.safeParse({ ...base, body: "n".repeat(NOTE_BODY_MAX_CHARS) }).success,
    ).toBe(true);
    expect(
      captureNoteInput.safeParse({ ...base, body: "n".repeat(NOTE_BODY_MAX_CHARS + 1) }).success,
    ).toBe(false);
  });
});

describe("study session creation input", () => {
  it("should accept an ISO date and a duration up to 1440 minutes", async () => {
    const { createStudySessionInput } = await import("./study-session");

    expect(
      createStudySessionInput.safeParse({
        plannedDurationMinutes: 1440,
        scheduledFor: "2026-03-01T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      createStudySessionInput.safeParse({ plannedDurationMinutes: 20, scheduledFor: null }).success,
    ).toBe(true);
  });

  it("should refuse an unparseable date and a duration above 1440 or beyond 32-bit range", async () => {
    const { createStudySessionInput } = await import("./study-session");

    expect(
      createStudySessionInput.safeParse({ plannedDurationMinutes: 20, scheduledFor: "tomorrow" })
        .success,
    ).toBe(false);
    expect(createStudySessionInput.safeParse({ plannedDurationMinutes: 1441 }).success).toBe(false);
    expect(
      createStudySessionInput.safeParse({ plannedDurationMinutes: 5_000_000_000 }).success,
    ).toBe(false);
  });
});
