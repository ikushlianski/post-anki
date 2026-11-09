import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { runTxtImport, type TxtImportDeps } from "./txt-import.service.js";

const ankiExport = readFileSync(
  new URL("../../../anki-batch-mcp/src/test-fixtures/small-export.txt", import.meta.url),
  "utf8",
);

function makeDeps(overrides: Partial<TxtImportDeps> = {}): TxtImportDeps {
  return {
    subjectExists: vi.fn().mockResolvedValue(true),
    stageNotes: vi.fn().mockImplementation(async (_id: string, rows: unknown[]) => rows.length),
    insertSources: vi.fn().mockResolvedValue([{ id: "ks_1" }]),
    kick: vi.fn().mockResolvedValue(undefined),
    sendImportEvent: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("runTxtImport", () => {
  it("should stage an Anki export and start the import job", async () => {
    const deps = makeDeps();

    const result = await runTxtImport({ text: ankiExport, subjectId: null }, deps);

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ kind: "anki", newlyStaged: expect.any(Number) });
    expect(deps.sendImportEvent).toHaveBeenCalledTimes(1);
  });

  it("should tell the user the notes were saved when the job cannot be started", async () => {
    const deps = makeDeps({ sendImportEvent: vi.fn().mockRejectedValue(new Error("down")) });

    const result = await runTxtImport({ text: ankiExport, subjectId: null }, deps);

    expect(result.status).toBe(502);
  });

  it("should add a plain text file as one source in the chosen subject and start extraction", async () => {
    const deps = makeDeps();

    const result = await runTxtImport({ text: "Plain notes", subjectId: "sub_1" }, deps);

    expect(result).toEqual({ status: 200, body: { kind: "source", created: true } });
    expect(deps.insertSources).toHaveBeenCalledWith([expect.objectContaining({ rawText: "Plain notes" })], "sub_1");
    expect(deps.kick).toHaveBeenCalledWith(["ks_1"]);
  });

  it("should not add or re-extract a plain text file that was already uploaded", async () => {
    const deps = makeDeps({ insertSources: vi.fn().mockResolvedValue([]) });

    const result = await runTxtImport({ text: "Plain notes", subjectId: "sub_1" }, deps);

    expect(result.body).toEqual({ kind: "source", created: false });
    expect(deps.kick).not.toHaveBeenCalled();
  });

  it("should ask for a subject when a plain text file has none", async () => {
    const result = await runTxtImport({ text: "Plain notes", subjectId: null }, makeDeps());

    expect(result.status).toBe(400);
  });

  it("should refuse binary content with a plain message", async () => {
    const result = await runTxtImport({ text: "a\u0000b", subjectId: "sub_1" }, makeDeps());

    expect(result).toMatchObject({ status: 400, body: { error: "not_text" } });
  });
});
