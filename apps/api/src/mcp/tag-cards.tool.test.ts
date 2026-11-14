import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));
vi.mock("../knowledge-bit/knowledge-bit-read.repo.js", () => ({ getKnowledgeBitById: vi.fn() }));
vi.mock("../tag/tag.repo.js", () => ({
  assignTag: vi.fn(),
  getTagsByIds: vi.fn(),
  listAssignmentsForNodes: vi.fn(),
  removeTagAssignment: vi.fn(),
  resolveOrCreateTag: vi.fn(),
}));

const { getKnowledgeBitById } = await import("../knowledge-bit/knowledge-bit-read.repo.js");
const tagRepo = await import("../tag/tag.repo.js");
const { tagCards } = await import("./tag-cards.tool.js");

afterEach(() => {
  vi.resetAllMocks();
});

const auth = { scopes: ["cards:write"] };

describe("tagCards", () => {
  it("should refuse without cards:write", async () => {
    expect(await tagCards({ cardIds: ["kb_1"], add: ["x"] }, { scopes: [] })).toEqual({ error: "missing_scope" });
  });

  it("should refuse a call that neither adds nor removes tags", async () => {
    expect(await tagCards({ cardIds: ["kb_1"] }, auth)).toEqual({ error: "nothing_to_do" });
  });

  it("should add a tag to found cards, remove another, and list unknown cards", async () => {
    vi.mocked(getKnowledgeBitById).mockImplementation(async (id) => (id === "kb_1" ? ({ id } as never) : null));
    vi.mocked(tagRepo.resolveOrCreateTag).mockResolvedValue({ id: "tag_new", name: "Verbs" } as never);
    vi.mocked(tagRepo.listAssignmentsForNodes).mockResolvedValue([
      { id: "a1", tagId: "tag_new", nodeType: "knowledgeBit", nodeId: "kb_1" },
      { id: "a2", tagId: "tag_old", nodeType: "knowledgeBit", nodeId: "kb_1" },
    ] as never);
    vi.mocked(tagRepo.getTagsByIds).mockResolvedValue(
      new Map([
        ["tag_new", { id: "tag_new", name: "Verbs" }],
        ["tag_old", { id: "tag_old", name: "Old" }],
      ]) as never,
    );

    const result = await tagCards({ cardIds: ["kb_1", "kb_2"], add: ["Verbs"], remove: ["old"] }, auth);

    expect(tagRepo.assignTag).toHaveBeenCalledWith("tag_new", "knowledgeBit", "kb_1");
    expect(tagRepo.removeTagAssignment).toHaveBeenCalledWith("tag_old", "a2");
    expect(result).toEqual({ tagged: [{ cardId: "kb_1", tags: ["Verbs"] }], notFound: ["kb_2"] });
  });
});
