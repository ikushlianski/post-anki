import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./knowledge-bit-placement.repo.js", () => ({
  listKnowledgeBitsForPlacementScan: vi.fn(),
  listTopicsForPlacement: vi.fn(),
  markKnowledgeBitMatched: vi.fn(),
  markKnowledgeBitSuggested: vi.fn(),
  markKnowledgeBitPlacementFailed: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-placer.agent.js", () => ({
  runKnowledgeBitPlacer: vi.fn(),
}));

const {
  listKnowledgeBitsForPlacementScan,
  listTopicsForPlacement,
  markKnowledgeBitMatched,
  markKnowledgeBitSuggested,
  markKnowledgeBitPlacementFailed,
} = await import("./knowledge-bit-placement.repo.js");
const { runKnowledgeBitPlacer } = await import("../mastra/knowledge-bit-placer.agent.js");
const { placeKnowledgeBits, PLACEMENT_CAP } = await import(
  "./knowledge-bit-placement.orchestrator.js"
);

function topic(topicId: string) {
  return {
    topicId,
    topicTitle: `Topic ${topicId}`,
    curriculumName: "Curriculum",
    subjectName: "Subject",
  };
}

describe("placeKnowledgeBits", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(listTopicsForPlacement).mockResolvedValue([topic("topic_1")]);
  });

  it("should mark a bit matched when the agent returns a topic id present in the fetched topic list", async () => {
    const bit = { id: "kb_1", body: "Price anchors shape perceived value" };

    vi.mocked(listKnowledgeBitsForPlacementScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitPlacer).mockResolvedValue({
      matchedTopicId: "topic_1",
      suggestedPlacement: null,
    });

    const result = await placeKnowledgeBits();

    expect(markKnowledgeBitMatched).toHaveBeenCalledWith("kb_1", "topic_1");
    expect(markKnowledgeBitSuggested).not.toHaveBeenCalled();
    expect(markKnowledgeBitPlacementFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, matched: 1, suggested: 0, failed: 0 });
  });

  it("should mark a bit suggested when the agent returns a placement suggestion instead of a match", async () => {
    const bit = { id: "kb_2", body: "A brand new concept with no home yet" };

    vi.mocked(listKnowledgeBitsForPlacementScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitPlacer).mockResolvedValue({
      matchedTopicId: null,
      suggestedPlacement: "Create a new topic under Subject > Curriculum",
    });

    const result = await placeKnowledgeBits();

    expect(markKnowledgeBitSuggested).toHaveBeenCalledWith(
      "kb_2",
      "Create a new topic under Subject > Curriculum",
    );
    expect(markKnowledgeBitMatched).not.toHaveBeenCalled();
    expect(markKnowledgeBitPlacementFailed).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, matched: 0, suggested: 1, failed: 0 });
  });

  it("should mark a bit failed when the agent returns a matchedTopicId that is not in the fetched topic list", async () => {
    const bit = { id: "kb_hallucinated", body: "Something the agent mismatches" };

    vi.mocked(listKnowledgeBitsForPlacementScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitPlacer).mockResolvedValue({
      matchedTopicId: "topic_does_not_exist",
      suggestedPlacement: null,
    });

    const result = await placeKnowledgeBits();

    expect(markKnowledgeBitPlacementFailed).toHaveBeenCalledWith("kb_hallucinated");
    expect(markKnowledgeBitMatched).not.toHaveBeenCalled();
    expect(markKnowledgeBitSuggested).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, matched: 0, suggested: 0, failed: 1 });
  });

  it("should mark a bit failed when the suggestion is blank or whitespace-only", async () => {
    const bit = { id: "kb_blank", body: "Some content" };

    vi.mocked(listKnowledgeBitsForPlacementScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitPlacer).mockResolvedValue({
      matchedTopicId: null,
      suggestedPlacement: "   ",
    });

    const result = await placeKnowledgeBits();

    expect(markKnowledgeBitPlacementFailed).toHaveBeenCalledWith("kb_blank");
    expect(markKnowledgeBitSuggested).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, matched: 0, suggested: 0, failed: 1 });
  });

  it("should mark a bit failed when the suggestion exceeds the max length", async () => {
    const bit = { id: "kb_long", body: "Some content" };

    vi.mocked(listKnowledgeBitsForPlacementScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitPlacer).mockResolvedValue({
      matchedTopicId: null,
      suggestedPlacement: "x".repeat(301),
    });

    const result = await placeKnowledgeBits();

    expect(markKnowledgeBitPlacementFailed).toHaveBeenCalledWith("kb_long");
    expect(markKnowledgeBitSuggested).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, matched: 0, suggested: 0, failed: 1 });
  });

  it("should trim surrounding whitespace before persisting a usable suggestion", async () => {
    const bit = { id: "kb_padded", body: "Some content" };

    vi.mocked(listKnowledgeBitsForPlacementScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitPlacer).mockResolvedValue({
      matchedTopicId: null,
      suggestedPlacement: "  Create a new topic under Subject > Curriculum  ",
    });

    await placeKnowledgeBits();

    expect(markKnowledgeBitSuggested).toHaveBeenCalledWith(
      "kb_padded",
      "Create a new topic under Subject > Curriculum",
    );
  });

  it("should mark a bit failed when the placer agent throws, and continue processing the next bit", async () => {
    const failingBit = { id: "kb_fail", body: "Broken content" };
    const nextBit = { id: "kb_next", body: "Fine content" };

    vi.mocked(listKnowledgeBitsForPlacementScan).mockResolvedValue([failingBit, nextBit]);
    vi.mocked(runKnowledgeBitPlacer)
      .mockRejectedValueOnce(new Error("agent call failed"))
      .mockResolvedValueOnce({ matchedTopicId: "topic_1", suggestedPlacement: null });

    const result = await placeKnowledgeBits();

    expect(markKnowledgeBitPlacementFailed).toHaveBeenCalledWith("kb_fail");
    expect(markKnowledgeBitMatched).toHaveBeenCalledWith("kb_next", "topic_1");
    expect(result).toEqual({ scanned: 2, matched: 1, suggested: 0, failed: 1 });
  });

  it("should fetch the topic list exactly once per scan call regardless of batch size", async () => {
    const bits = [
      { id: "kb_a", body: "A" },
      { id: "kb_b", body: "B" },
      { id: "kb_c", body: "C" },
    ];

    vi.mocked(listKnowledgeBitsForPlacementScan).mockResolvedValue(bits);
    vi.mocked(runKnowledgeBitPlacer).mockResolvedValue({
      matchedTopicId: "topic_1",
      suggestedPlacement: null,
    });

    await placeKnowledgeBits();

    expect(listTopicsForPlacement).toHaveBeenCalledTimes(1);
    expect(runKnowledgeBitPlacer).toHaveBeenCalledTimes(3);
    expect(runKnowledgeBitPlacer).toHaveBeenCalledWith("A", [topic("topic_1")]);
  });

  it("should cap the scan's batch size, leaving remainder bits unprocessed this call", async () => {
    const bits = Array.from({ length: PLACEMENT_CAP + 10 }, (_, i) => ({
      id: `kb_${i}`,
      body: `Body ${i}`,
    }));

    vi.mocked(listKnowledgeBitsForPlacementScan).mockImplementation(async (limit: number) =>
      bits.slice(0, limit),
    );
    vi.mocked(runKnowledgeBitPlacer).mockResolvedValue({
      matchedTopicId: "topic_1",
      suggestedPlacement: null,
    });

    const result = await placeKnowledgeBits();

    const requestedLimit = vi.mocked(listKnowledgeBitsForPlacementScan).mock.calls[0]![0];

    expect(requestedLimit).toBe(PLACEMENT_CAP);
    expect(result.scanned).toBe(PLACEMENT_CAP);
    expect(runKnowledgeBitPlacer).toHaveBeenCalledTimes(PLACEMENT_CAP);
    expect(markKnowledgeBitMatched).not.toHaveBeenCalledWith(`kb_${PLACEMENT_CAP}`, "topic_1");
  });

  it("should never let a markKnowledgeBitPlacementFailed write failure abort the rest of the batch", async () => {
    const failingBit = { id: "kb_fail", body: "Broken content" };
    const nextBit = { id: "kb_next", body: "Fine content" };

    vi.mocked(listKnowledgeBitsForPlacementScan).mockResolvedValue([failingBit, nextBit]);
    vi.mocked(runKnowledgeBitPlacer)
      .mockRejectedValueOnce(new Error("agent call failed"))
      .mockResolvedValueOnce({ matchedTopicId: "topic_1", suggestedPlacement: null });
    vi.mocked(markKnowledgeBitPlacementFailed).mockRejectedValueOnce(new Error("db write failed"));

    const result = await placeKnowledgeBits();

    expect(markKnowledgeBitMatched).toHaveBeenCalledWith("kb_next", "topic_1");
    expect(result).toEqual({ scanned: 2, matched: 1, suggested: 0, failed: 1 });
  });
});
