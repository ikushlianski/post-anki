import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listArchitectureMentorSubjectsForDuplicateScan,
  updateSubjectEmbedding,
  type SubjectForDuplicateScan,
} from "../subject/subject.repo.js";
import { embedSubjectTexts } from "./embeddings-client.js";
import { triggerSubjectDuplicateScan } from "./subject-duplicate.orchestrator.js";

vi.mock("../subject/subject.repo.js", () => ({
  listArchitectureMentorSubjectsForDuplicateScan: vi.fn(),
  updateSubjectEmbedding: vi.fn(),
}));
vi.mock("../mastra/mastra.js", () => ({ startTracingSpan: vi.fn(() => undefined) }));
vi.mock("./embeddings-client.js", () => ({ embedSubjectTexts: vi.fn() }));
vi.mock("./subject-duplicate-pairs.repo.js", () => ({
  findSimilarSubjectPairs: vi.fn(async () => []),
}));
vi.mock("./subject-duplicate.repo.js", () => ({
  insertDuplicateSuggestionIfNew: vi.fn(async () => null),
}));

function subject(id: string): SubjectForDuplicateScan {
  return {
    id,
    name: `Subject ${id}`,
    description: `About ${id}`,
    embeddingHash: null,
  };
}

describe("triggerSubjectDuplicateScan embedding counts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listArchitectureMentorSubjectsForDuplicateScan).mockResolvedValue([
      subject("a"),
      subject("b"),
      subject("c"),
    ]);
  });

  it("should report only the saved subjects as embedded and the rest as skipped when the client returns fewer results than sent", async () => {
    vi.mocked(embedSubjectTexts).mockResolvedValue([
      { id: "a", embedding: [1, 0, 0] },
      { id: "c", embedding: [0, 0, 1] },
    ]);

    const result = await triggerSubjectDuplicateScan();

    expect(result.embeddedCount).toBe(2);
    expect(result.skippedCount).toBe(1);
    expect(updateSubjectEmbedding).toHaveBeenCalledTimes(2);
    expect(vi.mocked(updateSubjectEmbedding).mock.calls.map((call) => call[0])).toEqual(["a", "c"]);
  });

  it("should omit skippedCount when every subject sent was saved", async () => {
    vi.mocked(embedSubjectTexts).mockResolvedValue([
      { id: "a", embedding: [1, 0, 0] },
      { id: "b", embedding: [0, 1, 0] },
      { id: "c", embedding: [0, 0, 1] },
    ]);

    const result = await triggerSubjectDuplicateScan();

    expect(result.embeddedCount).toBe(3);
    expect(result).not.toHaveProperty("skippedCount");
    expect(updateSubjectEmbedding).toHaveBeenCalledTimes(3);
  });
});
