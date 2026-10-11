import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("./knowledge-bit-basic-card-claim.repo.js", () => ({
  listKnowledgeBitsForBasicCardGenerationScan: vi.fn(),
  recordGeneratedBasicCardVariant: vi.fn(),
  markBasicCardGenerationFailed: vi.fn(),
  claimKnowledgeBitForBasicCardGeneration: vi.fn(),
}));

vi.mock("../mastra/knowledge-bit-basic-card-generator.agent.js", () => ({
  runKnowledgeBitBasicCardGenerator: vi.fn(),
}));

const {
  listKnowledgeBitsForBasicCardGenerationScan,
  recordGeneratedBasicCardVariant,
  markBasicCardGenerationFailed,
  claimKnowledgeBitForBasicCardGeneration,
} = await import("./knowledge-bit-basic-card-claim.repo.js");
const { runKnowledgeBitBasicCardGenerator } = await import(
  "../mastra/knowledge-bit-basic-card-generator.agent.js"
);
const { generateKnowledgeBitBasicCards, BASIC_CARD_GENERATION_CAP } = await import(
  "./knowledge-bit-basic-card-generation.orchestrator.js"
);

const TOKEN = "bcgc_fake_claim_token";
const bit = { id: "kb_1", body: "TTL means time to live." };

describe("generateKnowledgeBitBasicCards", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(claimKnowledgeBitForBasicCardGeneration).mockResolvedValue(TOKEN);
  });

  it("should store one basic card for a bit and count it generated", async () => {
    vi.mocked(listKnowledgeBitsForBasicCardGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitBasicCardGenerator).mockResolvedValue({
      front: " What does TTL stand for? ",
      back: "Time to live",
    });

    const result = await generateKnowledgeBitBasicCards();

    expect(listKnowledgeBitsForBasicCardGenerationScan).toHaveBeenCalledWith(BASIC_CARD_GENERATION_CAP);
    expect(recordGeneratedBasicCardVariant).toHaveBeenCalledWith(
      "kb_1",
      "basic",
      0,
      "What does TTL stand for?",
      "Time to live",
      TOKEN,
    );
    expect(result).toEqual({ scanned: 1, generated: 1, failed: 0, skipped: 0 });
  });

  it("should skip a bit without paying for an AI call when another run already claimed it", async () => {
    vi.mocked(listKnowledgeBitsForBasicCardGenerationScan).mockResolvedValue([bit]);
    vi.mocked(claimKnowledgeBitForBasicCardGeneration).mockResolvedValue(null);

    const result = await generateKnowledgeBitBasicCards();

    expect(runKnowledgeBitBasicCardGenerator).not.toHaveBeenCalled();
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 0, skipped: 1 });
  });

  it("should store nothing and count one failed attempt when the card breaks the rules", async () => {
    vi.mocked(listKnowledgeBitsForBasicCardGenerationScan).mockResolvedValue([bit]);
    vi.mocked(runKnowledgeBitBasicCardGenerator).mockResolvedValue({
      front: "What is TTL?",
      back: "what is ttl?",
    });

    const result = await generateKnowledgeBitBasicCards();

    expect(recordGeneratedBasicCardVariant).not.toHaveBeenCalled();
    expect(markBasicCardGenerationFailed).toHaveBeenCalledWith("kb_1", TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });

  it("should keep going with the next bit when one bit's AI call fails", async () => {
    const second = { id: "kb_2", body: "Second fact." };

    vi.mocked(listKnowledgeBitsForBasicCardGenerationScan).mockResolvedValue([bit, second]);
    vi.mocked(runKnowledgeBitBasicCardGenerator)
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce({ front: "Second?", back: "Second fact" });

    const result = await generateKnowledgeBitBasicCards();

    expect(markBasicCardGenerationFailed).toHaveBeenCalledWith("kb_1", TOKEN);
    expect(recordGeneratedBasicCardVariant).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ scanned: 2, generated: 1, failed: 1, skipped: 0 });
  });

  it("should keep going when recording the failure itself fails", async () => {
    const second = { id: "kb_2", body: "Second fact." };

    vi.mocked(listKnowledgeBitsForBasicCardGenerationScan).mockResolvedValue([bit, second]);
    vi.mocked(runKnowledgeBitBasicCardGenerator)
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce({ front: "Second?", back: "Second fact" });
    vi.mocked(markBasicCardGenerationFailed).mockRejectedValueOnce(new Error("claim lost"));

    const result = await generateKnowledgeBitBasicCards();

    expect(result).toEqual({ scanned: 2, generated: 1, failed: 1, skipped: 0 });
  });
});

describe("generateKnowledgeBitBasicCards language guard", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(claimKnowledgeBitForBasicCardGeneration).mockResolvedValue(TOKEN);
  });

  it("should never store a card written in a different script than its bit and should mark the bit failed", async () => {
    const englishBit = { id: "kb_ribosome", body: "Ribosomes synthesize proteins." };

    vi.mocked(listKnowledgeBitsForBasicCardGenerationScan).mockResolvedValue([englishBit]);
    vi.mocked(runKnowledgeBitBasicCardGenerator).mockResolvedValue({
      front: "核糖体的作用是什么？",
      back: "合成蛋白质的细胞器",
    });

    const result = await generateKnowledgeBitBasicCards();

    expect(recordGeneratedBasicCardVariant).not.toHaveBeenCalled();
    expect(markBasicCardGenerationFailed).toHaveBeenCalledWith("kb_ribosome", TOKEN);
    expect(result).toEqual({ scanned: 1, generated: 0, failed: 1, skipped: 0 });
  });
});

describe("generateKnowledgeBitBasicCards concurrency", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(claimKnowledgeBitForBasicCardGeneration).mockResolvedValue(TOKEN);
  });

  it("should keep at most four bits in flight at once and still generate every bit", async () => {
    const bits = Array.from({ length: 6 }, (_, index) => ({
      id: `kb_${index}`,
      body: "Price anchors shape perceived value",
    }));
    let inFlight = 0;
    let maxInFlight = 0;

    vi.mocked(listKnowledgeBitsForBasicCardGenerationScan).mockResolvedValue(bits);
    vi.mocked(runKnowledgeBitBasicCardGenerator).mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;

      return { front: "What anchors perceived value?", back: "Price anchors" };
    });

    const result = await generateKnowledgeBitBasicCards();

    expect(maxInFlight).toBe(4);
    expect(recordGeneratedBasicCardVariant).toHaveBeenCalledTimes(6);
    expect(result).toEqual({ scanned: 6, generated: 6, failed: 0, skipped: 0 });
  });
});
