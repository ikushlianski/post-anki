import { describe, expect, it, vi } from "vitest";

vi.mock("../shared/log.js", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));

vi.mock("./anki-import.repo.js", () => ({
  countImportNotesByStatus: vi.fn(),
  listStagedDecks: vi.fn(),
  markNotesImported: vi.fn(),
  takeNextStagedNotes: vi.fn(),
}));

vi.mock("../mcp/business-deck-mapping.js", () => ({ resolveDeckSubjectId: vi.fn() }));
vi.mock("../knowledge-source/knowledge-source-keyed-insert.repo.js", () => ({
  findSourcesByImportKeys: vi.fn(),
  insertKeyedKnowledgeSources: vi.fn(),
}));
vi.mock("../knowledge-source/knowledge-source-kick.js", () => ({ kickSourcesAfterAdd: vi.fn() }));
vi.mock("../db/client.js", () => ({ getDb: vi.fn() }));

const { ankiImportFunction } = await import("./anki-import-inngest.workflow.js");

describe("ankiImportFunction options", () => {
  const opts = ankiImportFunction.opts;

  it("should retry a failed step 3 times so a brief outage does not stop the import", () => {
    expect(opts.retries).toBe(3);
  });

  it("should run one import at a time and skip a second start for the same import while one runs", () => {
    expect(opts.concurrency).toEqual([{ limit: 1 }]);
    expect(opts.singleton).toEqual({ key: "event.data.importId", mode: "skip" });
  });

  it("should cancel a run that sits too long", () => {
    expect(opts.timeouts).toEqual({ finish: "30m" });
  });

  it("should not dedupe by event id so re-sending the event resumes a failed import", () => {
    expect(opts.idempotency).toBeUndefined();
  });
});
