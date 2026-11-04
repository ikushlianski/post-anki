import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(import.meta.dirname, "..");

const NOTE_LEVEL_READERS = new Set([
  "knowledge-bit/knowledge-bit-browser-filters.ts",
  "knowledge-bit/knowledge-bit-browser.repo.ts",
  "knowledge-bit/knowledge-bit-browser-matches.repo.ts",
  "knowledge-bit/knowledge-bit-overview.repo.ts",
  "knowledge-bit/knowledge-bit-detail.repo.ts",
  "knowledge-bit/knowledge-bit-export.repo.ts",
  "knowledge-bit/knowledge-cleanup.repo.ts",
  "knowledge-bit/knowledge-bit-delete.repo.ts",
]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    if (statSync(path).isDirectory()) {
      return name === "node_modules" ? [] : sourceFiles(path);
    }

    return name.endsWith(".ts") && !name.includes(".test.") ? [path] : [];
  });
}

describe("schedule table readers", () => {
  it("should never join the schedule table on the note id alone outside the note-level readers", () => {
    const offenders = sourceFiles(SRC)
      .map((path) => ({ rel: path.slice(SRC.length + 1), text: readFileSync(path, "utf8") }))
      .filter(({ rel }) => !NOTE_LEVEL_READERS.has(rel) && rel !== "db/schema.ts" && !rel.endsWith("test-db.ts"))
      .filter(({ text }) => /eq\(knowledgeBitSchedules\.knowledgeBitId,|s\.knowledge_bit_id\s*=\s*(b|c)\.|knowledge_bit_schedules s on s\.knowledge_bit_id = b\.id\b(?!\s+and)/.test(text))
      .filter(({ text }) => !/cardKey|card_key|scheduleIsActiveCard/.test(text))
      .map(({ rel }) => rel);

    expect(offenders).toEqual([]);
  });

  it("should read every card-level schedule through the card key or the note aggregate view", () => {
    const direct = sourceFiles(SRC)
      .map((path) => ({ rel: path.slice(SRC.length + 1), text: readFileSync(path, "utf8") }))
      .filter(({ rel }) => /knowledgeBitSchedules|knowledge_bit_schedules/.test(readFileSync(join(SRC, rel), "utf8")))
      .filter(({ rel }) => !NOTE_LEVEL_READERS.has(rel) && rel !== "db/schema.ts" && !rel.endsWith("test-db.ts"))
      .filter(({ text }) => !/cardKey|card_key|scheduleIsActiveCard/.test(text))
      .map(({ rel }) => rel);

    expect(direct).toEqual([]);
  });
});
