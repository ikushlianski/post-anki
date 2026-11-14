import { afterEach, describe, expect, it, vi } from "vitest";
import type { DuplicateCandidate } from "./knowledge-bit-duplicate-finder.repo.js";

vi.mock("../shared/log.js", () => ({ log: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("../shared/embeddings-client.js", () => ({ embedTexts: vi.fn() }));
vi.mock("./knowledge-bit-duplicate-finder.repo.js", () => ({
  findLiteralCandidates: vi.fn(),
  findSemanticCandidates: vi.fn(),
}));

const { embedTexts } = await import("../shared/embeddings-client.js");
const repo = await import("./knowledge-bit-duplicate-finder.repo.js");
const { distinctiveSlice, findDuplicateCards } = await import("./knowledge-bit-duplicate-finder.js");

afterEach(() => {
  vi.resetAllMocks();
});

function candidate(over: Partial<DuplicateCandidate>): DuplicateCandidate {
  return {
    bitId: "kb_1",
    bitBody: "",
    prompt: "What is the capital of France?",
    answer: "Paris",
    subjectId: "sub_1",
    subjectName: "Geo",
    similarity: null,
    ...over,
  };
}

function embeddingsWork() {
  vi.mocked(embedTexts).mockResolvedValue([
    { id: "front", embedding: [1] },
    { id: "pair", embedding: [2] },
  ]);
  vi.mocked(repo.findSemanticCandidates).mockResolvedValue([]);
}

describe("distinctiveSlice", () => {
  it("should pick the six consecutive words with the most letters from a long front", () => {
    expect(distinctiveSlice("so um what exactly distinguishes mitochondrial respiration from fermentation ok")).toBe(
      "exactly distinguishes mitochondrial respiration from fermentation",
    );
  });

  it("should keep a short front whole", () => {
    expect(distinctiveSlice("Capital of France?")).toBe("Capital of France?");
  });
});

describe("findDuplicateCards", () => {
  it("should call a card with the same front and back, ignoring case and punctuation, a duplicate", async () => {
    embeddingsWork();
    vi.mocked(repo.findLiteralCandidates).mockResolvedValue([candidate({ prompt: "what is the capital of france", answer: "PARIS!" })]);

    const result = await findDuplicateCards({ front: "What is the capital of France?", back: "Paris" });

    expect(result.matches).toEqual([
      expect.objectContaining({ id: "kb_1", kind: "duplicate", matchKind: "literal", subject: { id: "sub_1", name: "Geo" } }),
    ]);
  });

  it("should call a card with the same front but a different back a possible duplicate", async () => {
    embeddingsWork();
    vi.mocked(repo.findLiteralCandidates).mockResolvedValue([candidate({ answer: "Lyon" })]);

    const result = await findDuplicateCards({ front: "What is the capital of France?", back: "Paris" });

    expect(result.matches[0]).toMatchObject({ kind: "possible_duplicate", matchKind: "literal" });
  });

  it("should catch a near-literal copy that contains the distinctive span of the front", async () => {
    embeddingsWork();
    vi.mocked(repo.findLiteralCandidates).mockResolvedValue([
      candidate({ prompt: "Quick check: what exactly distinguishes mitochondrial respiration from fermentation, in one line?", answer: "x" }),
    ]);

    const result = await findDuplicateCards({
      front: "what exactly distinguishes mitochondrial respiration from fermentation",
      back: "Oxygen",
    });

    expect(result.matches[0]).toMatchObject({ kind: "possible_duplicate", matchKind: "literal" });
  });

  it("should flag a semantic pair match as duplicate and a front-only semantic match as possible, duplicates first", async () => {
    vi.mocked(repo.findLiteralCandidates).mockResolvedValue([]);
    vi.mocked(embedTexts).mockResolvedValue([
      { id: "front", embedding: [1] },
      { id: "pair", embedding: [2] },
    ]);
    vi.mocked(repo.findSemanticCandidates).mockImplementation(async (embedding) =>
      embedding[0] === 1
        ? [candidate({ bitId: "kb_front", similarity: 0.85 })]
        : [candidate({ bitId: "kb_pair", similarity: 0.95 })],
    );

    const result = await findDuplicateCards({ front: "Capital of France?", back: "Paris" });

    expect(result.matches.map((m) => [m.id, m.kind, m.matchKind])).toEqual([
      ["kb_pair", "duplicate", "semantic"],
      ["kb_front", "possible_duplicate", "semantic"],
    ]);
    expect(repo.findSemanticCandidates).toHaveBeenCalledWith([1], 0.8, expect.any(Number));
    expect(repo.findSemanticCandidates).toHaveBeenCalledWith([2], 0.92, expect.any(Number));
  });

  it("should fall back to literal matches and say so when embeddings fail", async () => {
    vi.mocked(embedTexts).mockRejectedValue(new Error("no key"));
    vi.mocked(repo.findLiteralCandidates).mockResolvedValue([candidate({})]);

    const result = await findDuplicateCards({ front: "What is the capital of France?", back: "Paris" });

    expect(result.semanticChecked).toBe(false);
    expect(result.matches).toHaveLength(1);
  });

  it("should report no matches for an unrelated card", async () => {
    embeddingsWork();
    vi.mocked(repo.findLiteralCandidates).mockResolvedValue([candidate({ prompt: "Largest ocean?", answer: "Pacific" })]);

    expect(await findDuplicateCards({ front: "What is the capital of France?", back: "Paris" })).toEqual({
      matches: [],
      semanticChecked: true,
    });
  });
});
