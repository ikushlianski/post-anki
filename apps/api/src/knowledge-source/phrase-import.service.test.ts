import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./phrase-knowledge-source.repo.js", () => ({
  insertPhraseKnowledgeSources: vi.fn(),
}));
vi.mock("./knowledge-source-kick.js", () => ({
  kickSourcesAfterAdd: vi.fn(),
}));

const { insertPhraseKnowledgeSources } = await import("./phrase-knowledge-source.repo.js");
const { importPhraseLines } = await import("./phrase-import.service.js");

function storedText(): string {
  const items = vi.mocked(insertPhraseKnowledgeSources).mock.calls[0]?.[0] ?? [];

  return items[0]?.text ?? "";
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(insertPhraseKnowledgeSources).mockResolvedValue([]);
});

describe("importPhraseLines", () => {
  it("should store a phrase with three question marks as unsure and keep the marks out of the phrase", async () => {
    await importPhraseLines({ lines: ["wrap it up ???"], subjectId: "sub_it" });

    expect(storedText()).toBe("Phrase: wrap it up\nUnsure: yes");
  });

  it("should not flag a phrase that ends with only two question marks", async () => {
    await importPhraseLines({ lines: ["really??"], subjectId: "sub_it" });

    expect(storedText()).toContain("Phrase: really??");
    expect(storedText()).not.toContain("Unsure");
  });
});
