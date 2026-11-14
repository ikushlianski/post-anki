import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-review.orchestrator.js", () => ({ recordKnowledgeBitReview: vi.fn() }));
vi.mock("../streak/streak.service.js", () => ({ recordActivityToday: vi.fn() }));
vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { recordKnowledgeBitReview } = await import("../knowledge-bit/knowledge-bit-review.orchestrator.js");
const { recordActivityToday } = await import("../streak/streak.service.js");
const { gradeCard } = await import("./grade-card.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const auth = { scopes: ["cards:write"] };
const reviewed = {
  ok: true,
  knowledgeBitId: "kb1",
  phase: "review",
  dueAt: "2026-11-20T00:00:00.000Z",
  intervalDays: 6,
  lapses: 0,
  leech: false,
  suspended: false,
};

describe("gradeCard", () => {
  it("should refuse without cards:write and record nothing", async () => {
    expect(await gradeCard({ variantId: "v1", grade: "good" }, { scopes: [] })).toEqual({ error: "missing_scope" });
    expect(recordKnowledgeBitReview).not.toHaveBeenCalled();
  });

  it("should schedule the card and count the review toward today's streak", async () => {
    vi.mocked(recordKnowledgeBitReview).mockResolvedValue(reviewed as never);

    const result = await gradeCard({ variantId: "v1", grade: "good" }, auth);

    expect(result).toEqual({
      cardId: "kb1",
      phase: "review",
      dueAt: "2026-11-20T00:00:00.000Z",
      intervalDays: 6,
      lapses: 0,
      leech: false,
      suspended: false,
    });
    expect(recordKnowledgeBitReview).toHaveBeenCalledWith(
      expect.objectContaining({ variantId: "v1", grade: "good" }),
      expect.any(Date),
    );
    expect(recordActivityToday).toHaveBeenCalledWith(expect.any(String), "review");
  });

  it("should not count a superseded review as activity", async () => {
    vi.mocked(recordKnowledgeBitReview).mockResolvedValue({ ...reviewed, superseded: true } as never);

    await gradeCard({ variantId: "v1", grade: "again" }, auth);

    expect(recordActivityToday).not.toHaveBeenCalled();
  });

  it("should still return the grade when the streak update fails", async () => {
    vi.mocked(recordKnowledgeBitReview).mockResolvedValue(reviewed as never);
    vi.mocked(recordActivityToday).mockRejectedValue(new Error("db"));

    expect(await gradeCard({ variantId: "v1", grade: "easy" }, auth)).toMatchObject({ cardId: "kb1" });
  });

  it("should pass through an unknown variant", async () => {
    vi.mocked(recordKnowledgeBitReview).mockResolvedValue({ ok: false, error: "variant_not_found" });

    expect(await gradeCard({ variantId: "x", grade: "good" }, auth)).toEqual({ error: "variant_not_found" });
  });
});
