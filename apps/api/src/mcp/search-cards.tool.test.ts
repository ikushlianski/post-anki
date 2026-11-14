import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../knowledge-bit/knowledge-bit-overview.repo.js", () => ({ listKnowledgeBitOverview: vi.fn() }));
vi.mock("../search/list-nodes-by-tag.repo.js", () => ({ listNodesByTagId: vi.fn() }));
vi.mock("../tag/tag-read.repo.js", () => ({ listTags: vi.fn() }));
vi.mock("./card-view.js", () => ({ subjectPathsById: vi.fn(), tagNamesByCardId: vi.fn() }));
vi.mock("./subject-ref.js", () => ({ findExistingSubject: vi.fn() }));

const { listKnowledgeBitOverview } = await import("../knowledge-bit/knowledge-bit-overview.repo.js");
const { listNodesByTagId } = await import("../search/list-nodes-by-tag.repo.js");
const { listTags } = await import("../tag/tag-read.repo.js");
const { subjectPathsById, tagNamesByCardId } = await import("./card-view.js");
const { findExistingSubject } = await import("./subject-ref.js");
const { searchCards } = await import("./search-cards.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

function page(items: unknown[] = [], hasMore = false) {
  vi.mocked(listKnowledgeBitOverview).mockResolvedValue({ items, hasMore } as never);
  vi.mocked(subjectPathsById).mockResolvedValue(new Map([["sub_1", "Geo/Europe"]]));
  vi.mocked(tagNamesByCardId).mockResolvedValue(new Map([["kb_1", ["capitals"]]]));
}

const item = {
  knowledgeBitId: "kb_1",
  question: "Capital of France?",
  answer: "P".repeat(300),
  subjectId: "sub_1",
  state: "suspended",
  dueAt: "2026-06-03T00:00:00.000Z",
};

describe("searchCards", () => {
  it("should return compact rows with a trimmed back, subject path, tags and suspended flag", async () => {
    page([item], true);

    const result = await searchCards({ query: "france" });

    expect(result).toMatchObject({ hasMore: true });
    expect(result).toMatchObject({
      cards: [{ id: "kb_1", front: "Capital of France?", subjectPath: "Geo/Europe", tags: ["capitals"], suspended: true }],
    });
    expect("cards" in result && result.cards[0]!.backSnippet.length).toBe(201);
    expect(listKnowledgeBitOverview).toHaveBeenCalledWith(
      expect.objectContaining({ q: "france", limit: 20, offset: 0, states: [] }),
      expect.any(Date),
      undefined,
      { bitIds: undefined },
    );
  });

  it("should limit to suspended cards, or to cards in rotation, by the suspended flag", async () => {
    page();
    await searchCards({ suspended: true });
    await searchCards({ suspended: false });

    const states = vi.mocked(listKnowledgeBitOverview).mock.calls.map((call) => call[0].states);

    expect(states[0]).toEqual(["suspended"]);
    expect(states[1]).not.toContain("suspended");
    expect(states[1]).toContain("new");
  });

  it("should resolve a tag name case-insensitively and restrict the search to its cards", async () => {
    page();
    vi.mocked(listTags).mockResolvedValue([{ id: "tag_1", name: "Capitals" }] as never);
    vi.mocked(listNodesByTagId).mockResolvedValue({
      nodes: [{ kind: "bit", id: "kb_1" }, { kind: "topic", id: "t_1" }],
      capped: false,
    } as never);

    await searchCards({ tag: "capitals" });

    expect(listNodesByTagId).toHaveBeenCalledWith("tag_1");
    expect(vi.mocked(listKnowledgeBitOverview).mock.calls[0]![3]).toEqual({ bitIds: ["kb_1"] });
  });

  it("should return nothing without searching when the tag has no cards", async () => {
    vi.mocked(listNodesByTagId).mockResolvedValue({ nodes: [], capped: false });

    expect(await searchCards({ tagId: "tag_1" })).toEqual({ cards: [], hasMore: false });
    expect(listKnowledgeBitOverview).not.toHaveBeenCalled();
  });

  it("should report unknown tags and subjects as errors", async () => {
    vi.mocked(listTags).mockResolvedValue([]);
    vi.mocked(findExistingSubject).mockResolvedValue({ error: "not_found" });

    expect(await searchCards({ tag: "nope" })).toEqual({ error: "tag_not_found" });
    expect(await searchCards({ subject: "Nope" })).toEqual({ error: "subject_not_found" });
  });
});
