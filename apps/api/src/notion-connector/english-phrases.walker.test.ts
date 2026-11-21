import { describe, expect, it, vi } from "vitest";
vi.mock("../shared/log.js", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { importEnglishPhrases } from "./english-phrases.sync.js";
import { baseOptions, bullet, childPage, makeDeps } from "./english-phrases.test-mocks.js";

describe("recursive walk", () => {
  it("should import the child bullets of a group header, delete them, and leave the header on the page", async () => {
    const { deps } = makeDeps({
      root: [bullet("h", "ads", true)],
      h: [bullet("c1", "PR merge env does not work"), bullet("c2", "test deploys of preview branches"), bullet("c3", "rollback")],
    });

    const result = await importEnglishPhrases(deps, baseOptions);

    expect(deps.deleteBlock.mock.calls.map(([id]) => id)).toEqual(["c1", "c2", "c3"]);
    expect(deps.deleteBlock).not.toHaveBeenCalledWith("h");
    expect(deps.fileNote).not.toHaveBeenCalledWith("notion:h", expect.anything());
    expect(result).toMatchObject({ filed: 3, deleted: 3, words: { imported: 1 }, phrases: { imported: 2 } });
  });

  it("should not descend into bullets or pages when the connector is not recursive", async () => {
    const { deps } = makeDeps({
      root: [bullet("h", "ads", true), childPage("p")],
      h: [bullet("c1", "hidden note here")],
      p: [bullet("c2", "other hidden note")],
    });

    const result = await importEnglishPhrases(deps, { ...baseOptions, recursive: false });

    expect(deps.fileNote).not.toHaveBeenCalled();
    expect(result.importable).toBe(0);
  });

  it("should read notes from child pages and from pages nested inside them", async () => {
    const { deps } = makeDeps({
      root: [bullet("a", "top level note"), childPage("p1")],
      p1: [bullet("b", "inside child page"), childPage("p2")],
      p2: [bullet("c", "deep note here")],
    });

    const result = await importEnglishPhrases(deps, baseOptions);

    expect(deps.deleteBlock.mock.calls.map(([id]) => id)).toEqual(["a", "b", "c"]);
    expect(result.blocksScanned).toBe(5);
  });

  it("should never process a page or block twice when the same id is reachable from several places or connectors", async () => {
    const { deps } = makeDeps({
      root: [childPage("p"), childPage("p"), bullet("a", "only once here")],
      p: [bullet("b", "inside shared page")],
    });
    const visited = new Set<string>();

    await importEnglishPhrases(deps, { ...baseOptions, visited });
    const second = await importEnglishPhrases(deps, { ...baseOptions, visited });

    expect(deps.fileNote).toHaveBeenCalledTimes(2);
    expect(second.blocksScanned).toBe(0);
  });

  it("should stop descending past the depth cap", async () => {
    const tree: Record<string, ReturnType<typeof childPage>[]> = {};

    for (let level = 0; level < 8; level += 1) {
      tree[level === 0 ? "root" : `p${level}`] = [childPage(`p${level + 1}`)];
    }

    const { deps } = makeDeps(tree);

    await importEnglishPhrases(deps, baseOptions);

    expect(deps.listBlocks).toHaveBeenCalledTimes(6);
  });
});

describe("failing child pages", () => {
  it("should skip a child page that cannot be listed and keep walking the rest", async () => {
    const { deps } = makeDeps({
      root: [childPage("bad"), bullet("a", "after the bad page")],
      bad: [bullet("x", "never read")],
    });
    const original = deps.listBlocks.getMockImplementation();

    deps.listBlocks.mockImplementation(async (parentId, cursor) => {
      if (parentId === "bad") {
        throw Object.assign(new Error("not found"), { status: 404 });
      }

      return original!(parentId, cursor);
    });

    const result = await importEnglishPhrases(deps, baseOptions);

    expect(deps.deleteBlock.mock.calls.map(([id]) => id)).toEqual(["a"]);
    expect(result).toMatchObject({ failed: 1, filed: 1 });
  });

  it("should abort the whole run when a child page is access denied", async () => {
    const { deps } = makeDeps({ root: [childPage("bad"), bullet("a", "after the bad page")] });
    const original = deps.listBlocks.getMockImplementation();

    deps.listBlocks.mockImplementation(async (parentId, cursor) => {
      if (parentId === "bad") {
        throw Object.assign(new Error("nope"), { status: 403 });
      }

      return original!(parentId, cursor);
    });

    await expect(importEnglishPhrases(deps, baseOptions)).rejects.toThrow(/Update content/);
    expect(deps.fileNote).not.toHaveBeenCalled();
  });
});

describe("quotas", () => {
  const words = Array.from({ length: 15 }, (_, i) => bullet(`w${i}`, `word${i}`));
  const phrases = Array.from({ length: 15 }, (_, i) => bullet(`p${i}`, `some phrase number ${i}`));

  it("should fill the word and phrase limits independently", async () => {
    const { deps } = makeDeps([...words, ...phrases]);

    const result = await importEnglishPhrases(deps, baseOptions);

    expect(result.words).toEqual({ imported: 10, skipped: 5, failed: 0 });
    expect(result.phrases).toEqual({ imported: 10, skipped: 0, failed: 0 });
    expect(deps.deleteBlock).toHaveBeenCalledTimes(20);
  });

  it("should still take later phrases after the word limit is full, in document order", async () => {
    const { deps } = makeDeps([bullet("w1", "alpha"), bullet("w2", "beta"), bullet("p1", "first phrase here"), bullet("w3", "gamma")]);

    await importEnglishPhrases(deps, { ...baseOptions, maxWords: 2 });

    expect(deps.deleteBlock.mock.calls.map(([id]) => id)).toEqual(["w1", "w2", "p1"]);
  });

  it("should stop reading Notion as soon as both limits are full", async () => {
    const many = Array.from({ length: 6 }, (_, i) => bullet(`p${i}`, `some phrase number ${i}`));
    const { deps } = makeDeps({ root: [bullet("w", "solo"), ...many, childPage("later")], later: [bullet("z", "never read")] }, {}, 2);

    await importEnglishPhrases(deps, { ...baseOptions, maxWords: 1, maxPhrases: 3 });

    expect(deps.listBlocks.mock.calls.map(([parent, cursor]) => `${parent}:${cursor}`)).toEqual(["root:null", "root:2"]);
  });

  it("should report a scan limit instead of silently stopping", async () => {
    const { deps } = makeDeps({ root: [childPage("a"), childPage("b")], a: [bullet("x", "")], b: [bullet("y", "ignored")] }, {}, 1);

    const result = await importEnglishPhrases(deps, { ...baseOptions, maxBlocksScanned: 3 });

    expect(result).toMatchObject({ scanLimitReached: true, blocksScanned: 3 });
  });

  it("should not flag a scan limit when everything was read", async () => {
    const { deps } = makeDeps([bullet("a", "alpha")]);

    const result = await importEnglishPhrases(deps, { ...baseOptions, maxBlocksScanned: 1 });

    expect(result.scanLimitReached).toBe(false);
  });
});

describe("dedupe against already imported text", () => {
  it("should delete a line already imported by hand without filing it again, and log it against the existing source", async () => {
    const { deps, calls } = makeDeps([bullet("a", "It’s a Piece of Cake…"), bullet("b", "brand new phrase")], {
      "it's a piece of cake": "ks-old",
    });

    const result = await importEnglishPhrases(deps, baseOptions);

    expect(deps.fileNote).toHaveBeenCalledTimes(1);
    expect(deps.fileNote).toHaveBeenCalledWith("notion:b", "brand new phrase");
    expect(deps.logImport).toHaveBeenCalledWith({
      connector: baseOptions.connector,
      notionBlockId: "a",
      originalText: "It’s a Piece of Cake…",
      knowledgeSourceId: "ks-old",
    });
    expect(calls.indexOf("log:a")).toBeLessThan(calls.indexOf("delete:a"));
    expect(result).toMatchObject({ duplicates: 1, filed: 1, deleted: 2 });
  });

  it("should not let already-imported lines use up the quota", async () => {
    const lines = Array.from({ length: 3 }, (_, i) => bullet(`d${i}`, `old phrase ${i}`));
    const { deps } = makeDeps([...lines, bullet("n", "new phrase here")], {
      "old phrase 0": "k0",
      "old phrase 1": "k1",
      "old phrase 2": "k2",
    });

    const result = await importEnglishPhrases(deps, { ...baseOptions, maxPhrases: 1 });

    expect(result).toMatchObject({ duplicates: 3, filed: 1, deleted: 4 });
  });

  it("should not file the same text twice within one run", async () => {
    const { deps } = makeDeps([bullet("a", "Circle back"), bullet("b", "circle back.")]);

    const result = await importEnglishPhrases(deps, baseOptions);

    expect(deps.fileNote).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ filed: 1, duplicates: 1, deleted: 2 });
  });

  it("should keep the line when its restore log cannot be written", async () => {
    const { deps } = makeDeps([bullet("a", "old one here")], { "old one here": "k" });

    deps.logImport.mockRejectedValueOnce(new Error("down"));
    const result = await importEnglishPhrases(deps, baseOptions);

    expect(deps.deleteBlock).not.toHaveBeenCalled();
    expect(result).toMatchObject({ duplicates: 0, failed: 1 });
  });
});

describe("headers with children", () => {
  it("should never delete a bullet that has children, even when it looks like a note and recursion is off", async () => {
    const { deps } = makeDeps({ root: [bullet("h", "PR merge env does not work", true)], h: [bullet("c", "child note")] });

    await importEnglishPhrases(deps, { ...baseOptions, recursive: false });
    await importEnglishPhrases(deps, baseOptions);

    expect(deps.deleteBlock).toHaveBeenCalledTimes(1);
    expect(deps.deleteBlock).toHaveBeenCalledWith("c");
  });
});
