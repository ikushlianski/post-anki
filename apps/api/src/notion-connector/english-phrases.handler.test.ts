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
vi.mock("../knowledge-source/knowledge-source-keyed-insert.repo.js", () => ({ findSourcesByImportKeys: vi.fn() }));
vi.mock("./notion.client.js", () => ({ deleteNotionBlock: vi.fn(), listPhraseBlocks: vi.fn() }));
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
    destination: { kind: "knowledge-source", subjectPath: "English", maxPerRun: 10, deleteAfterImport: true, ...overrides },
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
    deleted: 3,
    deleteFailed: 0,
    failed: 0,
  };
}

describe("runAllEnglishPhrasesImports", () => {
  beforeEach(() => {
    mocks.importEnglishPhrases.mockReset();
    mocks.importEnglishPhrases.mockImplementation(async (_deps, options: EnglishPhrasesOptions) => resultFor(options));
  });

  it("should import every enabled page using its own page id and settings", async () => {
    mocks.connectors = [connector("page-a"), connector("page-b", { maxPerRun: 4, deleteAfterImport: false })];

    const outcomes = await runAllEnglishPhrasesImports({});

    expect(outcomes.map((outcome) => outcome.connector)).toEqual(["page-a", "page-b"]);
    expect(mocks.importEnglishPhrases.mock.calls.map(([, options]) => options)).toEqual([
      { connector: "page-a", pageId: "page-a-page", maxPerRun: 10, deleteAfterImport: true, dryRun: false },
      { connector: "page-b", pageId: "page-b-page", maxPerRun: 4, deleteAfterImport: false, dryRun: false },
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

  it("should cap each page by the limit without raising it above the page maximum", async () => {
    mocks.connectors = [connector("page-a"), connector("page-b", { maxPerRun: 2 })];

    await runAllEnglishPhrasesImports({ limit: 5 });

    expect(mocks.importEnglishPhrases.mock.calls.map(([, options]) => options.maxPerRun)).toEqual([5, 2]);
  });

  it("should pass dry run to every page", async () => {
    mocks.connectors = [connector("page-a"), connector("page-b")];

    await runAllEnglishPhrasesImports({ dryRun: true });

    expect(mocks.importEnglishPhrases.mock.calls.map(([, options]) => options.dryRun)).toEqual([true, true]);
  });
});
