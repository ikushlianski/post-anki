import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Tx } from "../shared/merge-lock.js";
import { recordRehearsalInTx } from "./knowledge-bit-review-rehearsal.orchestrator.js";
import { readKnowledgeBitScheduleInTx } from "./knowledge-bit-schedule.repo.js";
import { insertRehearsalAttemptInTx } from "./knowledge-bit-variant-attempt-rehearsal.repo.js";

vi.mock("./knowledge-bit-schedule.repo.js", () => ({ readKnowledgeBitScheduleInTx: vi.fn() }));
vi.mock("./knowledge-bit-variant-attempt-rehearsal.repo.js", () => ({
  insertRehearsalAttemptInTx: vi.fn(),
}));
vi.mock("../gamification/gamification.service.js", () => ({
  reviewPointsForEventInTx: vi.fn().mockResolvedValue({
    awarded: 0,
    reason: "not_scored",
    totalPoints: 12,
    level: 1,
    leveledUp: false,
  }),
}));

const now = new Date("2026-11-04T10:00:00Z");
const variant = { id: "v1", knowledgeBitId: "kb_1" };
const tx = {} as Tx;

beforeEach(() => {
  vi.mocked(insertRehearsalAttemptInTx).mockResolvedValue("kbvattempt_1");
});

describe("recordRehearsalInTx", () => {
  it("should echo the unchanged schedule and award no points", async () => {
    const dueAt = new Date("2026-11-09T00:00:00Z");

    vi.mocked(readKnowledgeBitScheduleInTx).mockResolvedValue({
      easeFactor: 2.5,
      intervalDays: 5,
      dueAt,
      lastReviewedAt: now,
      reviewCount: 4,
      phase: "review",
      learningStep: 0,
      lapses: 1,
      suspendedAt: null,
      buriedUntil: null,
    });

    const result = await recordRehearsalInTx(tx, variant, "", { variantId: "v1", grade: "good", rehearsal: true }, now);

    expect(result).toMatchObject({
      reviewId: "kbvattempt_1",
      phase: "review",
      dueAt: dueAt.toISOString(),
      intervalDays: 5,
      lapses: 1,
      buriedVariantIds: [],
      followUp: null,
    });
    expect(result.points.awarded).toBe(0);
  });

  it("should report a never-graded card as new", async () => {
    vi.mocked(readKnowledgeBitScheduleInTx).mockResolvedValue(null);

    const result = await recordRehearsalInTx(tx, variant, "", { variantId: "v1", grade: "again", rehearsal: true }, now);

    expect(result.phase).toBe("new");
    expect(result.intervalDays).toBe(0);
  });

  it("should pass the request id through so a retry reuses the same attempt", async () => {
    vi.mocked(readKnowledgeBitScheduleInTx).mockResolvedValue(null);
    const requestId = "6f1c1b0e-0c3c-4f0e-9a8e-1d2b3c4d5e6f";

    await recordRehearsalInTx(tx, variant, "", { variantId: "v1", grade: "hard", requestId, rehearsal: true }, now);

    expect(insertRehearsalAttemptInTx).toHaveBeenCalledWith(tx, {
      variantId: "v1",
      grade: "hard",
      requestId,
      createdAt: now,
    });
  });
});
