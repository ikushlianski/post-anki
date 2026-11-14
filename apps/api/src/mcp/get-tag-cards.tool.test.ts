import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../tag/tag.repo.js", () => ({ getTag: vi.fn() }));
vi.mock("../search/list-nodes-by-tag.repo.js", () => ({ listNodesByTagId: vi.fn() }));

const { getTag } = await import("../tag/tag.repo.js");
const { listNodesByTagId } = await import("../search/list-nodes-by-tag.repo.js");
const { getTagCards } = await import("./get-tag-cards.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

describe("getTagCards", () => {
  it("should report an unknown tag", async () => {
    vi.mocked(getTag).mockResolvedValue(null);

    expect(await getTagCards({ tagId: "nope" })).toEqual({ error: "not_found" });
  });

  it("should return only cards, not topics or modules, carrying the tag", async () => {
    vi.mocked(getTag).mockResolvedValue({ id: "t1" } as never);
    vi.mocked(listNodesByTagId).mockResolvedValue({
      capped: false,
      nodes: [
        { id: "topic1", kind: "topic", title: "T", curriculumId: null, curriculumName: null, rank: 0, tags: [] },
        { id: "kb1", kind: "bit", title: "Card", curriculumId: null, curriculumName: null, rank: 0, tags: [{ id: "t1", name: "Verbs" }] },
      ],
    });

    expect(await getTagCards({ tagId: "t1" })).toEqual({
      tagId: "t1",
      cards: [{ id: "kb1", title: "Card", tags: ["Verbs"] }],
      capped: false,
    });
  });
});
