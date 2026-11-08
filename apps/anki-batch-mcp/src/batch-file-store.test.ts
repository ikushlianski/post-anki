import { copyFileSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createBatchFileStore } from "./batch-file-store.js";

const fixture = new URL("./test-fixtures/small-export.txt", import.meta.url);
let file: string;

beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), "anki-store-")), "export.txt");
  copyFileSync(fixture, file);
});

describe("createBatchFileStore", () => {
  it("should create the backup once and never overwrite it", async () => {
    const store = createBatchFileStore(file);
    const original = readFileSync(file, "utf8");

    expect(await store.ensureBackup()).toBe(true);
    writeFileSync(file, "#changed\n");
    expect(await store.ensureBackup()).toBe(false);
    expect(readFileSync(`${file}.bak`, "utf8")).toBe(original);
  });

  it("should remove exactly the given notes and keep the rest byte-identical", async () => {
    const store = createBatchFileStore(file);
    const { notes } = await store.read();
    const gone = new Set([notes[1]!.hash, notes[3]!.hash]);

    const result = await store.removeByHashes(gone);
    const expected =
      "#separator:tab\n#html:true\n" +
      notes
        .filter((note) => !gone.has(note.hash))
        .map((note) => note.source)
        .join("");

    expect(result).toEqual({ removed: 2, remaining: 5 });
    expect(readFileSync(file, "utf8")).toBe(expected);
  });

  it("should ignore hashes that are not in the file and leave no temp file", async () => {
    const store = createBatchFileStore(file);
    const before = readFileSync(file, "utf8");

    const result = await store.removeByHashes(new Set(["0000000000000000"]));

    expect(result).toEqual({ removed: 0, remaining: 7 });
    expect(readFileSync(file, "utf8")).toBe(before);
    expect(existsSync(`${file}.tmp`)).toBe(false);
  });
});
