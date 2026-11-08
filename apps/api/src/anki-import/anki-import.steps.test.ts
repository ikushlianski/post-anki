import { NonRetriableError } from "inngest";
import { describe, expect, it, vi } from "vitest";
import { importBatchStep, planStep, type AnkiImportDeps } from "./anki-import.steps.js";

const notes = [
  { id: "n1", noteKey: "anki:1111111111111111", deck: "Продажи", rawText: "one" },
  { id: "n2", noteKey: "anki:2222222222222222", deck: "Продажи", rawText: "two" },
];

function makeDeps(overrides: Partial<AnkiImportDeps> = {}): AnkiImportDeps {
  return {
    isDurableEnabled: () => true,
    countByStatus: vi.fn().mockResolvedValue({ staged: 45, imported: 0 }),
    listStagedDecks: vi.fn().mockResolvedValue(["Продажи"]),
    takeNext: vi.fn().mockResolvedValue(notes),
    resolveDeck: vi.fn().mockResolvedValue({ subjectId: "sub_1", subjectName: "Sales" }),
    insertKeyed: vi.fn().mockResolvedValue([{ id: "ks_1" }, { id: "ks_2" }]),
    findSources: vi.fn().mockResolvedValue([
      { id: "ks_1", importKey: "anki:1111111111111111", status: "pending" },
      { id: "ks_2", importKey: "anki:2222222222222222", status: "pending" },
    ]),
    markImported: vi.fn().mockResolvedValue(undefined),
    kick: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("importBatchStep", () => {
  it("should create sources, mark the notes imported and start detection for new sources", async () => {
    const deps = makeDeps();

    const outcome = await importBatchStep("imp-1", deps);

    expect(outcome).toEqual({ taken: 2, created: 2, alreadyPresent: 0, kicked: 2 });
    expect(deps.markImported).toHaveBeenCalledWith([
      { id: "n1", sourceId: "ks_1" },
      { id: "n2", sourceId: "ks_2" },
    ]);
    expect(deps.kick).toHaveBeenCalledWith(["ks_1", "ks_2"]);
  });

  it("should add no duplicate sources and still mark notes imported when a batch is retried after a crash", async () => {
    const deps = makeDeps({
      insertKeyed: vi.fn().mockResolvedValue([]),
      findSources: vi.fn().mockResolvedValue([
        { id: "ks_1", importKey: "anki:1111111111111111", status: "pending" },
        { id: "ks_2", importKey: "anki:2222222222222222", status: "detected" },
      ]),
    });

    const outcome = await importBatchStep("imp-1", deps);

    expect(outcome).toMatchObject({ created: 0, alreadyPresent: 2 });
    expect(deps.markImported).toHaveBeenCalledWith([
      { id: "n1", sourceId: "ks_1" },
      { id: "n2", sourceId: "ks_2" },
    ]);
  });

  it("should start detection only for sources still pending so a retry does not re-run finished ones", async () => {
    const deps = makeDeps({
      findSources: vi.fn().mockResolvedValue([
        { id: "ks_1", importKey: "anki:1111111111111111", status: "detected" },
        { id: "ks_2", importKey: "anki:2222222222222222", status: "pending" },
      ]),
    });

    await importBatchStep("imp-1", deps);

    expect(deps.kick).toHaveBeenCalledWith(["ks_2"]);
  });

  it("should not mark notes imported when a source cannot be found, so the batch is retried", async () => {
    const deps = makeDeps({ findSources: vi.fn().mockResolvedValue([]) });

    await expect(importBatchStep("imp-1", deps)).rejects.toThrow("anki_import_source_missing_after_insert");
    expect(deps.markImported).not.toHaveBeenCalled();
  });

  it("should stop for good when a deck has no sub-subject", async () => {
    const deps = makeDeps({
      resolveDeck: vi.fn().mockResolvedValue({ error: "subject_missing", subjectName: "Sales" }),
    });

    await expect(importBatchStep("imp-1", deps)).rejects.toBeInstanceOf(NonRetriableError);
  });
});

describe("planStep", () => {
  it("should plan one batch per 20 staged notes", async () => {
    await expect(planStep("imp-1", makeDeps())).resolves.toEqual({ staged: 45, batchCount: 3 });
  });

  it("should fail without retries when a staged deck has no sub-subject yet", async () => {
    const deps = makeDeps({
      resolveDeck: vi.fn().mockResolvedValue({ error: "subject_missing", subjectName: "Sales" }),
    });

    await expect(planStep("imp-1", deps)).rejects.toBeInstanceOf(NonRetriableError);
  });

  it("should fail without retries when durable extraction is off", async () => {
    const deps = makeDeps({ isDurableEnabled: () => false });

    await expect(planStep("imp-1", deps)).rejects.toBeInstanceOf(NonRetriableError);
    expect(deps.countByStatus).not.toHaveBeenCalled();
  });

  it("should fail without retries when more notes are staged than the cap", async () => {
    const deps = makeDeps({ countByStatus: vi.fn().mockResolvedValue({ staged: 2001, imported: 0 }) });

    await expect(planStep("imp-1", deps)).rejects.toBeInstanceOf(NonRetriableError);
  });
});
