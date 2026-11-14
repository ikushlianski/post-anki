import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./card-read.repo.js", () => ({ listCardRowsByIds: vi.fn() }));
vi.mock("./card-view.js", () => ({ subjectPathsById: vi.fn(), tagNamesByCardId: vi.fn() }));
vi.mock("../knowledge-source/knowledge-source-mcp.repo.js", () => ({ listActiveVariantsForBits: vi.fn() }));

const { listCardRowsByIds } = await import("./card-read.repo.js");
const { subjectPathsById, tagNamesByCardId } = await import("./card-view.js");
const { listActiveVariantsForBits } = await import("../knowledge-source/knowledge-source-mcp.repo.js");
const { getCards, getCard } = await import("./get-cards.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const NOW = new Date("2026-06-01T12:00:00Z");

const row = {
  id: "kb_1",
  approvalState: "approved",
  subjectId: "sub_1",
  sourceId: "ks_1",
  sourceSummary: "Geography notes",
  sourceRawText: null,
  sourceUrl: null,
  scheduled: "kb_1",
  phase: "review",
  dueAt: new Date("2026-06-03T00:00:00Z"),
  intervalDays: 4,
  lapses: 1,
  reviewCount: 6,
  lastReviewedAt: new Date("2026-05-30T00:00:00Z"),
  suspendedAt: null,
  buriedUntil: null,
};

function setup(rows: unknown[]) {
  vi.mocked(listCardRowsByIds).mockResolvedValue(rows as never);
  vi.mocked(subjectPathsById).mockResolvedValue(new Map([["sub_1", "Geo/Europe"]]));
  vi.mocked(tagNamesByCardId).mockResolvedValue(new Map([["kb_1", ["capitals"]]]));
  vi.mocked(listActiveVariantsForBits).mockResolvedValue([
    { knowledgeBitId: "kb_1", kind: "basic", prompt: "Capital of France?", answer: "Paris", sentence: null },
  ]);
}

describe("getCards", () => {
  it("should return sides, subject path, tags, status and schedule for a found card and list unknown ids", async () => {
    setup([row]);

    const result = await getCards({ ids: ["kb_1", "kb_missing", "kb_1"] }, NOW);

    expect(result.notFound).toEqual(["kb_missing"]);
    expect(result.cards).toEqual([
      {
        id: "kb_1",
        status: "approved",
        variants: [{ kind: "basic", front: "Capital of France?", back: "Paris", clozeText: null }],
        subject: { id: "sub_1", path: "Geo/Europe" },
        tags: ["capitals"],
        suspended: false,
        schedule: {
          state: "review",
          phase: "review",
          dueAt: "2026-06-03T00:00:00.000Z",
          intervalDays: 4,
          lapses: 1,
          reviewCount: 6,
          lastReviewedAt: "2026-05-30T00:00:00.000Z",
        },
        sourceTitle: "Geography notes",
      },
    ]);
  });

  it("should report a never-studied card with no schedule and a suspended card as suspended", async () => {
    setup([
      { ...row, scheduled: null, dueAt: null, phase: null },
      { ...row, id: "kb_2", suspendedAt: new Date("2026-05-31T00:00:00Z") },
    ]);

    const result = await getCards({ ids: ["kb_1", "kb_2"] }, NOW);

    expect(result.cards[0]).toMatchObject({ schedule: null, suspended: false });
    expect(result.cards[1]).toMatchObject({ suspended: true, schedule: { state: "suspended" } });
  });
});

describe("getCard", () => {
  it("should answer not_found for an unknown id", async () => {
    setup([]);

    expect(await getCard({ id: "kb_x" })).toEqual({ error: "not_found" });
  });
});
