import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "../shared/merge-lock.js";
import { recordKnowledgeBitReview } from "./knowledge-bit-review.orchestrator.js";
import { pickAlternateVariant } from "./knowledge-bit-review-alt-variant.repo.js";
import { recordRehearsalInTx } from "./knowledge-bit-review-rehearsal.orchestrator.js";
import { insertKnowledgeBitReview } from "./knowledge-bit-review.repo.js";
import { upsertKnowledgeBitScheduleInTx } from "./knowledge-bit-schedule.repo.js";
import { getQuestionVariantById } from "./knowledge-bit-variant-attempt.repo.js";
import { awardReviewPointInTx } from "../gamification/review-point-event.repo.js";
import type { KnowledgeBitReviewCardRow } from "./knowledge-bit-review-queue.repo.js";

vi.mock("../shared/merge-lock.js", () => ({
  withSubjectLock: vi.fn((_id: string, run: (tx: Tx) => unknown) => run({} as Tx)),
}));
vi.mock("./knowledge-bit-variant-attempt.repo.js", () => ({ getQuestionVariantById: vi.fn() }));
vi.mock("./knowledge-bit-review-alt-variant.repo.js", () => ({ pickAlternateVariant: vi.fn() }));
vi.mock("./knowledge-bit-review-rehearsal.orchestrator.js", () => ({ recordRehearsalInTx: vi.fn() }));
vi.mock("./knowledge-bit-card-subject.js", () => ({ readCardSubjectId: vi.fn().mockResolvedValue(null) }));
vi.mock("../subject-study-options/subject-study-options-resolver.js", () => ({
  loadStudyOptionsResolver: vi.fn().mockResolvedValue({ resolvePlan: vi.fn() }),
}));
vi.mock("../study-plan/study-plan-today.js", () => ({
  readStudyPlanClock: vi.fn().mockResolvedValue({ timeZone: "UTC" }),
}));
vi.mock("./knowledge-bit-schedule-options.js", () => ({
  toScheduleOptions: vi.fn().mockReturnValue({ learningSteps: [1, 10], relearningSteps: [10], graduatingDays: 1, easyDays: 4 }),
}));
vi.mock("./knowledge-bit-schedule.repo.js", () => ({
  readKnowledgeBitScheduleInTx: vi.fn().mockResolvedValue(null),
  upsertKnowledgeBitScheduleInTx: vi.fn(),
}));
vi.mock("./knowledge-bit-review.repo.js", () => ({
  getLocalDayWindow: vi.fn().mockResolvedValue({ endsAt: new Date("2026-11-05T00:00:00Z") }),
  insertKnowledgeBitReview: vi.fn().mockResolvedValue("kbreview_1"),
  readKnowledgeBitReviewByRequestIdInTx: vi.fn().mockResolvedValue(null),
}));
vi.mock("./knowledge-bit-sibling-burial.repo.js", () => ({
  buryCardSiblingsInTx: vi.fn().mockResolvedValue([]),
  listActiveCardVariantsInTx: vi.fn().mockResolvedValue([]),
  variantIdsForKeys: vi.fn().mockReturnValue([]),
}));
vi.mock("../gamification/review-point-event.repo.js", () => ({
  awardReviewPointInTx: vi.fn().mockResolvedValue(null),
  readPointEventByReviewIdInTx: vi.fn(),
}));
vi.mock("../gamification/gamification.service.js", () => ({
  reviewPointsForEventInTx: vi.fn().mockResolvedValue({
    awarded: 1,
    reason: "awarded",
    totalPoints: 1,
    level: 1,
    leveledUp: false,
  }),
}));

const now = new Date("2026-11-04T10:00:00Z");
const alternate = { variantId: "v2", cardKey: "" } as KnowledgeBitReviewCardRow;

function stubVariant(kind: string) {
  vi.mocked(getQuestionVariantById).mockResolvedValue({
    id: "v1",
    knowledgeBitId: "kb_1",
    kind: kind as "wh_question",
    order: 0,
    prompt: "p",
    answer: "a",
    approvalState: "approved",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(pickAlternateVariant).mockResolvedValue(alternate);
  stubVariant("wh_question");
});

describe("recordKnowledgeBitReview follow-up", () => {
  it("should return the alternate wording after a good grade on a plain card", async () => {
    const outcome = await recordKnowledgeBitReview({ variantId: "v1", grade: "good" }, now);

    expect(outcome).toMatchObject({ ok: true, followUp: alternate });
    expect(pickAlternateVariant).toHaveBeenCalledWith("kb_1", "v1", now, expect.anything(), expect.any(Function));
  });

  it("should offer no follow-up after an again grade", async () => {
    const outcome = await recordKnowledgeBitReview({ variantId: "v1", grade: "again" }, now);

    expect(outcome).toMatchObject({ ok: true, followUp: null });
    expect(pickAlternateVariant).not.toHaveBeenCalled();
  });

  it("should offer no follow-up for a cloze card that has its own schedule", async () => {
    stubVariant("cloze");

    const outcome = await recordKnowledgeBitReview({ variantId: "v1", grade: "easy" }, now);

    expect(outcome).toMatchObject({ ok: true, followUp: null });
    expect(pickAlternateVariant).not.toHaveBeenCalled();
  });

  it("should return a null follow-up when the card has a single wording", async () => {
    vi.mocked(pickAlternateVariant).mockResolvedValue(null);

    const outcome = await recordKnowledgeBitReview({ variantId: "v1", grade: "hard" }, now);

    expect(outcome).toMatchObject({ ok: true, followUp: null });
  });
});

describe("recordKnowledgeBitReview rehearsal", () => {
  it("should leave the schedule, review log and points untouched", async () => {
    vi.mocked(recordRehearsalInTx).mockResolvedValue({ reviewId: "kbvattempt_1" } as never);

    const outcome = await recordKnowledgeBitReview({ variantId: "v1", grade: "good", rehearsal: true }, now);

    expect(outcome).toMatchObject({ ok: true, reviewId: "kbvattempt_1" });
    expect(upsertKnowledgeBitScheduleInTx).not.toHaveBeenCalled();
    expect(insertKnowledgeBitReview).not.toHaveBeenCalled();
    expect(awardReviewPointInTx).not.toHaveBeenCalled();
    expect(pickAlternateVariant).not.toHaveBeenCalled();
  });
});
