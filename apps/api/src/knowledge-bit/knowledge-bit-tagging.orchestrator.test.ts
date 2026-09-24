import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./knowledge-bit-tagging.repo.js", () => ({
  listKnowledgeBitsForTaggingScan: vi.fn(),
  markKnowledgeBitTagged: vi.fn(),
  markKnowledgeBitTagFailed: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-tagger.agent.js", () => ({
  runKnowledgeBitTagger: vi.fn(),
}));

vi.mock("../tag/tag-auto-assign.js", () => ({
  assignTagForAutoTag: vi.fn(),
}));

vi.mock("../tag/tag.repo.js", () => ({
  listTags: vi.fn(),
  assignTag: vi.fn(),
}));

const {
  listKnowledgeBitsForTaggingScan,
  markKnowledgeBitTagged,
  markKnowledgeBitTagFailed,
} = await import("./knowledge-bit-tagging.repo.js");
const { runKnowledgeBitTagger } = await import("../mastra/knowledge-bit-tagger.agent.js");
const { assignTagForAutoTag } = await import("../tag/tag-auto-assign.js");
const { listTags, assignTag } = await import("../tag/tag.repo.js");
const { tagKnowledgeBits, TAGGING_CAP } = await import("./knowledge-bit-tagging.orchestrator.js");

function tag(id: string, name: string) {
  return { id, name, normalizedName: name.toLowerCase() };
}

describe("tagKnowledgeBits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listTags).mockResolvedValue([]);
  });

  it("should assign 1-3 tags to a bit with no tags yet and mark it tagged", async () => {
    const bit = { id: "kb_1", body: "Price anchors shape perceived value" };

    vi.mocked(listKnowledgeBitsForTaggingScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitTagger).mockResolvedValue(["pricing", "psychology"]);
    vi.mocked(assignTagForAutoTag).mockImplementation(async (name: string) => tag(name, name));

    const result = await tagKnowledgeBits();

    expect(assignTagForAutoTag).toHaveBeenCalledWith("pricing", bit.body);
    expect(assignTagForAutoTag).toHaveBeenCalledWith("psychology", bit.body);
    expect(assignTag).toHaveBeenCalledWith("pricing", "knowledgeBit", "kb_1");
    expect(assignTag).toHaveBeenCalledWith("psychology", "knowledgeBit", "kb_1");
    expect(markKnowledgeBitTagged).toHaveBeenCalledWith("kb_1");
    expect(markKnowledgeBitTagFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, tagged: 1, failed: 0 });
  });

  it("should call assignTagForAutoTag once per surviving (validated) candidate name, dropping the rest", async () => {
    const bit = { id: "kb_2", body: "Retention beats acquisition" };

    vi.mocked(listKnowledgeBitsForTaggingScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitTagger).mockResolvedValue(["retention", "a\nb", "  growth  "]);
    vi.mocked(assignTagForAutoTag).mockImplementation(async (name: string) => tag(name, name));

    await tagKnowledgeBits();

    expect(assignTagForAutoTag).toHaveBeenCalledTimes(2);
    expect(assignTagForAutoTag).toHaveBeenNthCalledWith(1, "retention", bit.body);
    expect(assignTagForAutoTag).toHaveBeenNthCalledWith(2, "growth", bit.body);
  });

  it("should persist the resolved tag's id, not the raw candidate name, for a close-match reuse", async () => {
    const bit = { id: "kb_close", body: "Anchoring biases price perception" };

    vi.mocked(listKnowledgeBitsForTaggingScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitTagger).mockResolvedValue(["pricing psych"]);
    vi.mocked(assignTagForAutoTag).mockResolvedValue(tag("tag_pricing", "pricing"));

    await tagKnowledgeBits();

    expect(assignTagForAutoTag).toHaveBeenCalledWith("pricing psych", bit.body);
    expect(assignTag).toHaveBeenCalledWith("tag_pricing", "knowledgeBit", "kb_close");
    expect(assignTag).not.toHaveBeenCalledWith("pricing psych", "knowledgeBit", "kb_close");
  });

  it("should mark a bit failed when the tagger agent throws, and continue processing the next bit", async () => {
    const failingBit = { id: "kb_fail", body: "Broken content" };
    const nextBit = { id: "kb_next", body: "Fine content" };

    vi.mocked(listKnowledgeBitsForTaggingScan).mockResolvedValue([failingBit, nextBit]);
    vi.mocked(runKnowledgeBitTagger)
      .mockRejectedValueOnce(new Error("agent call failed"))
      .mockResolvedValueOnce(["marketing"]);
    vi.mocked(assignTagForAutoTag).mockImplementation(async (name: string) => tag(name, name));

    const result = await tagKnowledgeBits();

    expect(markKnowledgeBitTagFailed).toHaveBeenCalledWith("kb_fail");
    expect(markKnowledgeBitTagged).toHaveBeenCalledWith("kb_next");
    expect(result).toEqual({ scanned: 2, tagged: 1, failed: 1 });
  });

  it("should mark a bit failed when every candidate name fails validation", async () => {
    const bit = { id: "kb_3", body: "Some content" };

    vi.mocked(listKnowledgeBitsForTaggingScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitTagger).mockResolvedValue(["  ", "a\nb", "x".repeat(61)]);

    const result = await tagKnowledgeBits();

    expect(assignTagForAutoTag).not.toHaveBeenCalled();
    expect(markKnowledgeBitTagFailed).toHaveBeenCalledWith("kb_3");
    expect(markKnowledgeBitTagged).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, tagged: 0, failed: 1 });
  });

  it("should cap the scan's batch size, leaving remainder bits unprocessed this call", async () => {
    const bits = Array.from({ length: TAGGING_CAP + 10 }, (_, i) => ({
      id: `kb_${i}`,
      body: `Body ${i}`,
    }));

    vi.mocked(listKnowledgeBitsForTaggingScan).mockImplementation(async (limit: number) =>
      bits.slice(0, limit),
    );
    vi.mocked(runKnowledgeBitTagger).mockResolvedValue(["tag-a"]);
    vi.mocked(assignTagForAutoTag).mockImplementation(async (name: string) => tag(name, name));

    const result = await tagKnowledgeBits();

    const requestedLimit = vi.mocked(listKnowledgeBitsForTaggingScan).mock.calls[0]![0];

    expect(requestedLimit).toBe(TAGGING_CAP);
    expect(result.scanned).toBe(TAGGING_CAP);
    expect(runKnowledgeBitTagger).toHaveBeenCalledTimes(TAGGING_CAP);
    expect(markKnowledgeBitTagged).not.toHaveBeenCalledWith(`kb_${TAGGING_CAP}`);
    expect(markKnowledgeBitTagFailed).not.toHaveBeenCalledWith(`kb_${TAGGING_CAP}`);
  });

  it("should never let a markKnowledgeBitTagFailed write failure abort the rest of the batch", async () => {
    const failingBit = { id: "kb_fail", body: "Broken content" };
    const nextBit = { id: "kb_next", body: "Fine content" };

    vi.mocked(listKnowledgeBitsForTaggingScan).mockResolvedValue([failingBit, nextBit]);
    vi.mocked(runKnowledgeBitTagger)
      .mockRejectedValueOnce(new Error("agent call failed"))
      .mockResolvedValueOnce(["marketing"]);
    vi.mocked(assignTagForAutoTag).mockImplementation(async (name: string) => tag(name, name));
    vi.mocked(markKnowledgeBitTagFailed).mockRejectedValueOnce(new Error("db write failed"));

    const result = await tagKnowledgeBits();

    expect(markKnowledgeBitTagged).toHaveBeenCalledWith("kb_next");
    expect(result).toEqual({ scanned: 2, tagged: 1, failed: 1 });
  });
});
