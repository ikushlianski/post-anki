import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeSourceConnector } from "@post-anki/shared";
import type { EnglishPhrasesOptions, EnglishPhrasesResult } from "./english-phrases.sync.js";

const mocks = vi.hoisted(() => ({
  connectors: [] as KnowledgeSourceConnector[],
  importEnglishPhrases: vi.fn(),
}));

vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("./connector-config.js", () => ({ loadKnowledgeSourceConnectors: () => mocks.connectors }));
vi.mock("../subject/subject-path.js", () => ({
  parseSubjectPath: (path: string) => ({ segments: [path] }),
  ensureSubjectPath: async () => ({ subjectId: "subject-1" }),
}));
vi.mock("../mcp/file-keyed-notes.js", () => ({ fileKeyedNotes: vi.fn() }));
vi.mock("../knowledge-source/knowledge-source-keyed-insert.repo.js", () => ({ findSourcesByImportKeys: vi.fn(), findSourcesByNormalizedText: vi.fn() }));
vi.mock("./notion.client.js", () => ({ deleteNotionBlock: vi.fn(), listPhraseBlocksPage: vi.fn() }));
vi.mock("./notion-import-log.repo.js", () => ({ insertImportLog: vi.fn(), markImportDeleted: vi.fn() }));
vi.mock("./english-phrases.sync.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./english-phrases.sync.js")>()),
  importEnglishPhrases: mocks.importEnglishPhrases,
}));

import { NotionAccessError } from "./english-phrases.sync.js";
import { failureStatus, runAllEnglishPhrasesImports } from "./english-phrases.handler.js";

function connector(name: string, overrides: Partial<KnowledgeSourceConnector["destination"]> = {}): KnowledgeSourceConnector {
  return {
    name,
    enabled: true,
    source: { kind: "page", id: `${name}-page` },
    destination: { kind: "knowledge-source", subjectPath: "English", maxWords: 10, maxPhrases: 10, recursive: true, deleteAfterImport: true, ...overrides },
  } as KnowledgeSourceConnector;
}

function resultFor(options: EnglishPhrasesOptions): EnglishPhrasesResult {
  return {
    connector: options.connector,
    dryRun: options.dryRun,
    importable: 3,
    attempted: 3,
    filed: 3,
    alreadyPresent: 0,
    duplicates: 0,
    deleted: 3,
    deleteFailed: 0,
    failed: 0,
    words: { imported: 0, skipped: 0, failed: 0 },
    phrases: { imported: 3, skipped: 0, failed: 0 },
    blocksScanned: 3,
    scanLimitReached: false,
  };
}

describe("runAllEnglishPhrasesImports", () => {
  beforeEach(() => {
    mocks.importEnglishPhrases.mockReset();
    mocks.importEnglishPhrases.mockImplementation(async (_deps, options: EnglishPhrasesOptions) => resultFor(options));
  });

  it("should import every enabled page using its own page id and settings", async () => {
    mocks.connectors = [connector("page-a"), connector("page-b", { maxWords: 4, deleteAfterImport: false })];

    const outcomes = await runAllEnglishPhrasesImports({});

    expect(outcomes.map((outcome) => outcome.connector)).toEqual(["page-a", "page-b"]);
    expect(mocks.importEnglishPhrases.mock.calls.map(([, options]) => options)).toEqual([
      expect.objectContaining({ connector: "page-a", pageId: "page-a-page", maxWords: 10, maxPhrases: 10, recursive: true, deleteAfterImport: true, dryRun: false }),
      expect.objectContaining({ connector: "page-b", pageId: "page-b-page", maxWords: 4, maxPhrases: 10, recursive: true, deleteAfterImport: false, dryRun: false }),
    ]);
    expect(failureStatus(outcomes)).toBe(200);
  });

  it("should skip disabled pages", async () => {
    mocks.connectors = [connector("page-a"), { ...connector("page-b"), enabled: false } as KnowledgeSourceConnector];

    const outcomes = await runAllEnglishPhrasesImports({});

    expect(outcomes.map((outcome) => outcome.connector)).toEqual(["page-a"]);
  });

  it("should still import the second page when the first page fails with an access error", async () => {
    mocks.connectors = [connector("page-a"), connector("page-b")];
    mocks.importEnglishPhrases.mockImplementationOnce(async () => {
      throw new NotionAccessError(new Error("forbidden"));
    });

    const outcomes = await runAllEnglishPhrasesImports({});

    expect(outcomes[0]).toMatchObject({ connector: "page-a", accessDenied: true });
    expect(outcomes[1]).toMatchObject({ connector: "page-b", result: { filed: 3 } });
    expect(failureStatus(outcomes)).toBe(403);
  });

  it("should report a generic failure as 502 and keep processing later pages", async () => {
    mocks.connectors = [connector("page-a"), connector("page-b")];
    mocks.importEnglishPhrases.mockImplementationOnce(async () => {
      throw new Error("boom");
    });

    const outcomes = await runAllEnglishPhrasesImports({});

    expect(outcomes[0]).toMatchObject({ connector: "page-a", error: "boom", accessDenied: false });
    expect(outcomes[1]).toHaveProperty("result");
    expect(failureStatus(outcomes)).toBe(502);
  });

  it("should cap both the word and the phrase limit by the query limit without raising either above the page maximum", async () => {
    mocks.connectors = [connector("page-a"), connector("page-b", { maxWords: 2, maxPhrases: 20 })];

    await runAllEnglishPhrasesImports({ limit: 5 });

    expect(mocks.importEnglishPhrases.mock.calls.map(([, options]) => [options.maxWords, options.maxPhrases])).toEqual([
      [5, 5],
      [2, 5],
    ]);
  });

  it("should share one visited set across pages so a page reachable from two connectors is walked once", async () => {
    mocks.connectors = [connector("page-a"), connector("page-b")];

    await runAllEnglishPhrasesImports({});

    const [first, second] = mocks.importEnglishPhrases.mock.calls.map(([, options]) => options.visited);

    expect(first).toBeInstanceOf(Set);
    expect(first).toBe(second);
  });

  it("should pass dry run to every page", async () => {
    mocks.connectors = [connector("page-a"), connector("page-b")];

    await runAllEnglishPhrasesImports({ dryRun: true });

    expect(mocks.importEnglishPhrases.mock.calls.map(([, options]) => options.dryRun)).toEqual([true, true]);
  });
});
