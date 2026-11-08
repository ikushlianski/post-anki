import { describe, expect, it, vi } from "vitest";
import { InngestTestEngine } from "@inngest/test";

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

const EVENT = { name: "anki-import/requested", data: { importId: "business-1" } };
const BATCH = { taken: 20, created: 20, alreadyPresent: 0, kicked: 20 };

describe("ankiImportFunction", () => {
  it("should run one batch step per planned batch and then summarize", async () => {
    const t = new InngestTestEngine({ function: ankiImportFunction });
    const summary = { staged: 0, imported: 45 };

    const { result } = await t.execute({
      events: [EVENT],
      steps: [
        { id: "plan", handler: () => ({ staged: 45, batchCount: 3 }) },
        { id: "batch-0", handler: () => BATCH },
        { id: "batch-1", handler: () => BATCH },
        { id: "batch-2", handler: () => ({ ...BATCH, taken: 5 }) },
        { id: "summary", handler: () => summary },
      ],
    });

    expect(result).toEqual(summary);
  });

  it("should go straight to the summary when nothing is staged", async () => {
    const t = new InngestTestEngine({ function: ankiImportFunction });

    const { result } = await t.execute({
      events: [EVENT],
      steps: [
        { id: "plan", handler: () => ({ staged: 0, batchCount: 0 }) },
        { id: "summary", handler: () => ({ staged: 0, imported: 45 }) },
      ],
    });

    expect(result).toEqual({ staged: 0, imported: 45 });
  });

  it("should reject an import id that does not match the allowed pattern", async () => {
    const t = new InngestTestEngine({ function: ankiImportFunction });

    const { error } = await t.execute({
      events: [{ name: EVENT.name, data: { importId: "../Etc" } }],
    });

    expect(JSON.stringify(error)).toContain("invalid_import_id");
  });

  it("should not repeat finished batches when the run resumes after a failed step", async () => {
    const { takeNextStagedNotes } = await import("./anki-import.repo.js");
    const { findSourcesByImportKeys } = await import("../knowledge-source/knowledge-source-keyed-insert.repo.js");

    vi.mocked(takeNextStagedNotes).mockClear().mockResolvedValue([]);
    vi.mocked(findSourcesByImportKeys).mockResolvedValue([]);

    const t = new InngestTestEngine({ function: ankiImportFunction });

    await t.execute({
      events: [EVENT],
      steps: [
        { id: "plan", handler: () => ({ staged: 40, batchCount: 2 }) },
        { id: "batch-0", handler: () => BATCH },
        { id: "summary", handler: () => ({ staged: 0, imported: 40 }) },
      ],
    });

    expect(vi.mocked(takeNextStagedNotes)).toHaveBeenCalledTimes(1);
  });
});
