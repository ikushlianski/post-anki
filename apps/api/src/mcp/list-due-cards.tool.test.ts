import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("./subject-ref.js", () => ({ findExistingSubject: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-review-queue.repo.js", () => ({ getKnowledgeBitReviewQueue: vi.fn() }));

const { findExistingSubject } = await import("./subject-ref.js");
const { getKnowledgeBitReviewQueue } = await import("../knowledge-bit/knowledge-bit-review-queue.repo.js");
const { listDueCards } = await import("./list-due-cards.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const queue = {
  cards: [
    {
      variantId: "v1",
      knowledgeBitId: "kb1",
      kind: "basic",
      prompt: "Q",
      answer: "A",
      background: null,
      isAiGenerated: false,
      sourceLinks: [],
      subjectId: "s1",
      phase: "review",
      leech: false,
      intervalPreview: { again: 0, hard: 1, good: 3, easy: 7 },
    },
  ],
  counts: { new: 0, learning: 0, review: 1 },
  newRemainingToday: 5,
  newLimitReached: false,
  nextDueAt: null,
};

describe("listDueCards", () => {
  it("should list the app's due queue with variant ids and default limit 10", async () => {
    vi.mocked(getKnowledgeBitReviewQueue).mockResolvedValue(queue as never);

    const result = await listDueCards({});

    expect(getKnowledgeBitReviewQueue).toHaveBeenCalledWith(10, { subjectId: undefined }, expect.objectContaining({ tz: "UTC", aheadDays: 0 }));
    expect(result).toMatchObject({ cards: [{ variantId: "v1", cardId: "kb1", context: null }], counts: { review: 1 } });
  });

  it("should scope the queue to a subject given by path", async () => {
    vi.mocked(findExistingSubject).mockResolvedValue({ subjectId: "s1", subjectPath: "A" });
    vi.mocked(getKnowledgeBitReviewQueue).mockResolvedValue(queue as never);

    await listDueCards({ subject: "A", limit: 3 });

    expect(getKnowledgeBitReviewQueue).toHaveBeenCalledWith(3, { subjectId: "s1" }, expect.anything());
  });

  it("should report an unknown subject", async () => {
    vi.mocked(findExistingSubject).mockResolvedValue({ error: "not_found" });

    expect(await listDueCards({ subject: "Nope" })).toEqual({ error: "subject_not_found" });
  });
});
