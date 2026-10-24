import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./knowledge-bit-basic-card-generation.orchestrator.js", () => ({
  generateKnowledgeBitBasicCards: vi.fn(),
}));

vi.mock("./knowledge-bit-fill-blank-generation.orchestrator.js", () => ({
  generateKnowledgeBitFillBlanks: vi.fn(),
}));

const { generateKnowledgeBitBasicCards } = await import(
  "./knowledge-bit-basic-card-generation.orchestrator.js"
);
const { generateKnowledgeBitFillBlanks } = await import(
  "./knowledge-bit-fill-blank-generation.orchestrator.js"
);
const { generateKnowledgeBitVariants } = await import(
  "./knowledge-bit-generate-variants.orchestrator.js"
);

const basicResult = { scanned: 3, generated: 2, failed: 1, skipped: 0 };
const fillResult = { scanned: 2, generated: 1, failed: 0, skipped: 1 };

describe("generateKnowledgeBitVariants", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(generateKnowledgeBitBasicCards).mockResolvedValue(basicResult);
    vi.mocked(generateKnowledgeBitFillBlanks).mockResolvedValue(fillResult);
  });

  it("should call basic-card generation before fill-blank generation", async () => {
    const callOrder: string[] = [];

    vi.mocked(generateKnowledgeBitBasicCards).mockImplementation(async () => {
      callOrder.push("basic");
      return basicResult;
    });
    vi.mocked(generateKnowledgeBitFillBlanks).mockImplementation(async () => {
      callOrder.push("fillBlank");
      return fillResult;
    });

    await generateKnowledgeBitVariants();

    expect(callOrder).toEqual(["basic", "fillBlank"]);
  });

  it("should return combined counts from both passes", async () => {
    const result = await generateKnowledgeBitVariants();

    expect(result).toEqual({ basicCards: basicResult, fillBlanks: fillResult });
  });

  it("should skip fill-blank generation when basic-card generation throws", async () => {
    vi.mocked(generateKnowledgeBitBasicCards).mockRejectedValue(new Error("basic failed"));

    await expect(generateKnowledgeBitVariants()).rejects.toThrow("basic failed");
    expect(generateKnowledgeBitFillBlanks).not.toHaveBeenCalled();
  });

  it("should scope both passes to the requested bit and let them fill an approved one", async () => {
    await generateKnowledgeBitVariants("kb_approved");

    const scope = { bitId: "kb_approved", includeApproved: true };

    expect(generateKnowledgeBitBasicCards).toHaveBeenCalledWith(scope);
    expect(generateKnowledgeBitFillBlanks).toHaveBeenCalledWith(scope);
  });

  it("should keep approved bits out of the passes when no bit is requested", async () => {
    await generateKnowledgeBitVariants();

    expect(generateKnowledgeBitBasicCards).toHaveBeenCalledWith({});
    expect(generateKnowledgeBitFillBlanks).toHaveBeenCalledWith({});
  });
});
