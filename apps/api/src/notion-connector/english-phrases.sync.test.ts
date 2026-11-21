import { describe, expect, it, vi } from "vitest";
import { importEnglishPhrases, isNotionAccessError, NotionAccessError } from "./english-phrases.sync.js";
import { baseOptions, bullet, makeDeps } from "./english-phrases.test-mocks.js";
vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import type { PhraseBlock } from "./phrase-key.js";

const options = baseOptions;

describe("importEnglishPhrases", () => {
  it("should file, log, then delete each line in that order", async () => {
    const { deps, calls } = makeDeps([bullet("a", "break the ice")]);

    const result = await importEnglishPhrases(deps, options);

    expect(calls).toEqual(["file:notion:a", "log:a", "delete:a"]);
    expect(result).toMatchObject({ filed: 1, deleted: 1, failed: 0 });
  });

  it("should only take the configured number of lines per run", async () => {
    const blocks = Array.from({ length: 5 }, (_, i) => bullet(`b${i}`, `phrase number ${i}`));
    const { deps } = makeDeps(blocks);

    const result = await importEnglishPhrases(deps, { ...options, maxPhrases: 2 });

    expect(deps.deleteBlock).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ attempted: 2, phrases: { imported: 2 } });
  });

  it("should skip empty bullets and non-bullet blocks without touching them", async () => {
    const { deps } = makeDeps([
      bullet("a", "  "),
      { id: "t", type: "toggle", text: "x", hasChildren: true },
      bullet("c", "keep it up"),
    ]);

    await importEnglishPhrases(deps, options);

    expect(deps.deleteBlock).toHaveBeenCalledTimes(1);
    expect(deps.deleteBlock).toHaveBeenCalledWith("c");
  });

  it("should keep going and not delete a line whose filing failed", async () => {
    const { deps } = makeDeps([bullet("a", "one"), bullet("b", "two")]);

    deps.fileNote.mockRejectedValueOnce(new Error("db down"));

    const result = await importEnglishPhrases(deps, options);

    expect(deps.deleteBlock).toHaveBeenCalledTimes(1);
    expect(deps.deleteBlock).toHaveBeenCalledWith("b");
    expect(result).toMatchObject({ failed: 1, deleted: 1 });
  });

  it("should not delete a line whose restore log could not be written", async () => {
    const { deps } = makeDeps([bullet("a", "one")]);

    deps.logImport.mockRejectedValueOnce(new Error("log down"));

    const result = await importEnglishPhrases(deps, options);

    expect(deps.deleteBlock).not.toHaveBeenCalled();
    expect(result.failed).toBe(1);
  });

  it("should treat a failed delete after filing as non-fatal and record the error", async () => {
    const { deps } = makeDeps([bullet("a", "one"), bullet("b", "two")]);

    deps.deleteBlock.mockRejectedValueOnce(new Error("timeout"));

    const result = await importEnglishPhrases(deps, options);

    expect(deps.markDeleted).toHaveBeenCalledWith("log-a", null, "timeout");
    expect(result).toMatchObject({ filed: 2, deleted: 1, deleteFailed: 1 });
  });

  it("should not file a line twice when it is still on the page on the next run", async () => {
    const { deps } = makeDeps([bullet("a", "one")]);

    deps.deleteBlock.mockRejectedValueOnce(new Error("timeout"));
    await importEnglishPhrases(deps, options);
    const second = await importEnglishPhrases(deps, options);

    expect(second).toMatchObject({ filed: 0, alreadyPresent: 1, deleted: 1 });
  });

  it("should store the original text verbatim, keeping curly apostrophes", async () => {
    const text = "It’s a piece of cake";
    const { deps } = makeDeps([bullet("a", text)]);

    await importEnglishPhrases(deps, options);

    expect(deps.logImport).toHaveBeenCalledWith(expect.objectContaining({ originalText: text }));
    expect(deps.fileNote).toHaveBeenCalledWith("notion:a", text);
  });

  it("should abort the whole run on the first Notion access error during delete", async () => {
    const { deps } = makeDeps([bullet("a", "one"), bullet("b", "two")]);

    deps.deleteBlock.mockRejectedValue(Object.assign(new Error("nope"), { code: "restricted_resource", status: 403 }));

    await expect(importEnglishPhrases(deps, options)).rejects.toBeInstanceOf(NotionAccessError);
    expect(deps.deleteBlock).toHaveBeenCalledTimes(1);
  });

  it("should abort on an access error while reading the page", async () => {
    const { deps } = makeDeps([]);

    deps.listBlocks.mockRejectedValue(Object.assign(new Error("nope"), { status: 403 }));

    await expect(importEnglishPhrases(deps, options)).rejects.toThrow(/Update content/);
  });

  it("should report a dry run without filing or deleting anything", async () => {
    const { deps } = makeDeps([bullet("a", "one")]);

    const result = await importEnglishPhrases(deps, { ...options, dryRun: true });

    expect(deps.fileNote).not.toHaveBeenCalled();
    expect(deps.deleteBlock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dryRun: true, importable: 1, attempted: 0, words: { imported: 1 } });
  });

  it("should count duplicates as would-delete in a dry run without filing, logging or deleting", async () => {
    const { deps } = makeDeps([bullet("a", "old one here"), bullet("b", "fresh one here")], { "old one here": "k" });

    const result = await importEnglishPhrases(deps, { ...options, dryRun: true });

    expect(deps.findExisting).toHaveBeenCalled();
    expect(deps.fileNote).not.toHaveBeenCalled();
    expect(deps.logImport).not.toHaveBeenCalled();
    expect(deps.deleteBlock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dryRun: true, duplicates: 1, importable: 1, phrases: { imported: 1 } });
  });

  it("should keep lines on the page when deleteAfterImport is off", async () => {
    const { deps } = makeDeps([bullet("a", "one")]);

    await importEnglishPhrases(deps, { ...options, deleteAfterImport: false });

    expect(deps.deleteBlock).not.toHaveBeenCalled();
  });
});

describe("isNotionAccessError", () => {
  it("should recognise unauthorized and restricted_resource codes and 401/403 statuses", () => {
    expect(isNotionAccessError({ code: "unauthorized" })).toBe(true);
    expect(isNotionAccessError({ code: "restricted_resource" })).toBe(true);
    expect(isNotionAccessError({ status: 403 })).toBe(true);
    expect(isNotionAccessError({ status: 500 })).toBe(false);
    expect(isNotionAccessError(null)).toBe(false);
  });
});
